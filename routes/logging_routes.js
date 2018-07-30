const {
  app,
  get_collection,
  get_signups,
  get_secrets,
  get_logging_states,
  get_installs,
  get_uninstalls,
  get_uninstall_feedback,
  list_collections,
  list_log_collections_for_user,
  list_log_collections_for_logname,
  get_collection_for_user_and_logname,
  mongodb,
  need_query_properties,
  get_webvisits,
  fix_object,
  valid_from,
  SUPPORTED_DEVICES
} = require('libs/server_common')

var crypto = require('crypto')

var get_secret = require('getsecret')

const CLIENT_ID_ANDROID = get_secret('CLIENT_ID_ANDROID')
const CLIENT_IDS_EXTENSION = JSON.parse(get_secret('CLIENT_ID_EXTENSION'))
const CLIENT_ID_ANDROID_PROD = get_secret('CLIENT_ID_ANDROID_PRODUCTION')

const {OAuth2Client} = require('google-auth-library')
const android_client = new OAuth2Client(CLIENT_ID_ANDROID)
const extension_client = new OAuth2Client(CLIENT_IDS_EXTENSION[1])
const android_client2 = new OAuth2Client(CLIENT_ID_ANDROID_PROD)

async function verify(client, token) {
  const ticket = await client.verifyIdToken({
      idToken: token,
      audience: [CLIENT_ID_ANDROID, CLIENT_ID_ANDROID_PROD].concat(CLIENT_IDS_EXTENSION),  // Specify the CLIENT_ID of the app that accesses the backend
      // Or, if multiple clients access the backend:
      //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
  })
  const payload = ticket.getPayload()
  return payload['email']
  // If request specified a G Suite domain:
  //const domain = payload['hd']
}

moment = require('moment')

const n2p = require('n2p')
const DATE_FORMAT = "YYYYMMDD"

app.get('/helloworld', async function(ctx) {
  let data = ctx.request.query
  console.log('stuff being run on server')
  ctx.body = 'hello world from get method!! you sent the following data: ' + JSON.stringify(data)
})

app.post('/helloworld', async function(ctx) {
  //ctx.type = 'json'
  let data = ctx.request.body
  console.log('stuff being run on server')
  ctx.body = 'hello world from post method!! you sent the following data: ' + JSON.stringify(data)
})


app.post('/addtolog', async function(ctx) {
  ctx.type = 'json'
  let data = ctx.request.body
  const {userid, logname} = ctx.request.query
  try {
    var [collection,db] = await get_collection_for_user_and_logname(userid, logname)
    data.timestamp = Date.now()
    await n2p(function(cb) {
      collection.insert(fix_object(data), cb)
    })
  } catch(err) {
    console.error('error in addtolog')
    console.error(err)
  } finally {
    if (db != null)
      db.close()
  }
  ctx.body = JSON.stringify({response: 'success', success: true})
})

app.post('/givefeedback', async function(ctx) {
  ctx.type = 'json'
  var [collection, db] = await get_collection("feedback")
  await n2p(function(cb) {
    collection.insert(fix_object(ctx.request.body), cb)
  })
  ctx.body = 'success'
})

/**
 * In JSON request body:
 * @param userid: id of user
 * @param domains_time: {<domain>: <time_spent in seconds>}
 * @param timestamp: start of session in milli since epoch (used to get date)
 * @param utcOffset: offset of timezone from UTC in minutes.
 */
app.post('/addsessiontototal', async function(ctx) {
  ctx.type = 'json'
  const {userid, domains_time, timestamp, utcOffset} = ctx.request.body
  var date = moment(timestamp)
  if (utcOffset) {
    date.add(utcOffset, "minutes")
    console.log("GOT UTCOFFSET: " + utcOffset)
  }
  date = date.format(DATE_FORMAT)
  try {
    for (var domain in domains_time) {
      var duration = domains_time[domain]
      var [collection, db] = await get_collection_for_user_and_logname(userid,
        "domain_stats")
      var obj = await n2p(function(cb) {
        collection.find({domain: domain}).toArray(cb)
      })
      var objFound = false
      if (obj != null && obj.length > 0)  {
        obj = obj[0]
        objFound = true
      } else {
        obj = {domain: domain}
      }

      if (obj[date] == null) {
        obj[date] = 0
      }
      obj[date] += Number(duration)
      if (objFound) {
        collection.updateOne({domain: domain}, {$set: obj}, function(err, res) {
          if (err)  {
            throw err
          }
        })
      } else {
        await n2p(function(cb) {
          collection.insert(fix_object(obj),cb)
        })
      }
    }
    ctx.body = obj
  } catch (e) {
    console.log(e)
  }
})

/**
 * Registers user id with given email to allow for syncing logs across devices.
 * In JSON request body:
 * @param userid: id of user associated with HabitLab install.
 * @param token: the Id Token associated with the Google Account. (value of token, not full response)
 * @param from: either "android" or "browser"
 */
app.post('/register_user_with_email', async function(ctx) {
  ctx.type = 'json'
  const {userid, token, type, from} = ctx.request.body
  // NOTE: userid is the userid associated with HabitLab install, NOT Google's user id.
  client = android_client2
  if (from == "browser") {
    client = extension_client
  }
  try {
    email = await verify(client, token)
    console.log(email)
    // To anonymize, let's hash it with SHA-256
    email = crypto.createHash('sha256').update(email).digest('hex');
    // The id token was valid! We have a user
    var [collection, db] = await get_collection("email_to_user")
    var obj = await n2p(function(cb) {
      collection.find({}).toArray(cb)
    })
    var objFound = false
    if (obj != null && obj.length > 0)  {
      obj = obj[0]
      objFound = true
    } else {
      obj = {}
    }
    if (obj[email] == null) {
      obj[email] = {}
      for (var i = 0; i < SUPPORTED_DEVICES.length; i++) {
        obj[email][SUPPORTED_DEVICES[i]] = []
      }
    }
    var set = new Set(obj[email][from])
    set.add(userid)
    // MONGODB deals with arrays better than sets!
    obj[email][from] = Array.from(set)
    if (objFound) {
      collection.updateOne({}, {$set: obj}, function(err, res) {
        if (err)  {
          throw err
        }
      })
    } else {
      await n2p(function(cb) {
        collection.insert(fix_object(obj),cb)
      })
    }
    ctx.body = {message: 'Sucesss! Registered user ' + userid + ' with ' + email}
  } catch(e) {
    console.log(e)
    ctx.body = {message: 'Error. Perhaps your token is outdated?'}
    ctx.status = 401
  }
})

/**
 * Gives total time spent across devices for a given doamin and Google Account
 * As query params:
 * @param domain: name of domain you want stats  of (i.e. "www.facebook.com")
 * @param token: token id of Google Account
 * @param from: either "browser or "android" (just to determine which client to use)
 * @param timestamp: the timestamp of the client relative to its timezone
 *                    so we can correctly reference the desired dates.
 * @param utcOffset: offset from UTC time, in minutes.
 * This fetches the stats necessary to display a synced, total visualziation in
 * the app. The return object looks like this:
 * {
 *  days: [time_day, time_yesterday, ..., time_6_days_ago],
 *  weeks: [time_this_week, time_last_week, two_weeks_ago, three_weeks_ago]
 * }
 */
app.post('/account_external_stats', async function(ctx) {
  // Get time spent in day, week, and month.
  var return_obj = {}
  return_obj['total'] = {days: Array(7).fill(0), weeks: Array(4).fill(0)}
  for (var i = 0; i < SUPPORTED_DEVICES.length; i++) {
    return_obj[SUPPORTED_DEVICES[i]] = {}
  }
  const {token, from, domain, timestamp, utcOffset} = ctx.request.body
  if (utcOffset) {
    console.log("GOT UTC OFFSET!!" + utcOffset)
  }
  if (!valid_from(from)) {
    ctx.body = 'Invalid from key'
    return
  }
  client = android_client2
  if (from == "browser") {
    client = extension_client
  }
  try {
    var email = await verify(client, token)
    var user_ids = await get_user_ids_from_email(email)
    for (var j = 0; j < SUPPORTED_DEVICES.length; j++) {
      device = SUPPORTED_DEVICES[j]
      device_user_ids = user_ids[device]
      device_user_ids = device_user_ids.map(function(obj) {
        if (obj.id != null){
          return obj.id
        }
        return obj
      })
      for (var i = 0; i < device_user_ids.length; i++) {
        userid = device_user_ids[i]
        console.log("setting param w/ userid: " + userid + "  device: " + device)
        return_obj[device][userid] = await get_stats_for_user(userid, domain,
          timestamp, utcOffset)
        // We now add this to total
        console.log(return_obj)
        console.log(JSON.stringify(return_obj))
        console.log("userid: " + userid + "  device: " + device)
        for (var k = 0; k < 7; k++) {
          return_obj['total']['days'][k] += return_obj[device][userid]['days'][k]
          if (k < 4) {
            return_obj['total']['weeks'][k] += return_obj[device][userid]['weeks'][k]
          }
        }
      }
    }
  } catch(e) {
    console.log(e)
    ctx.status = 401
    ctx.body = {message: 'Error getting email from id token.'}
  }
  ctx.body = return_obj
})

/**
 * Gets stats in format according to 'account_external_stats'
 * @param user_id: string user id
 * @param domain: domain of interest (i.e. "www.facebook.com")
 * @param timestamp: the timestamp of the client relative to its timezone
 *                    so we can correctly reference the desired dates.
 * @param utcOffset: the offset from UTC time, in minutes.
 * Returns:
 * {
 *  days: [time_day, time_yesterday, ..., time_6_days_ago],
 *  weeks: [time_this_week, time_last_week, two_weeks_ago, three_weeks_ago]
 * }
 */
get_stats_for_user = async function(user_id, domain, timestamp, utcOffset) {
  return_obj = {"days": Array(7).fill(0), "weeks": Array(4).fill(0)}
  var [collection, db] = await get_collection_for_user_and_logname(user_id, "domain_stats")
  var obj = await n2p(function(cb) {
    collection.find({domain: domain}).toArray(cb)
  })
  if (obj != null && obj.length > 0) {
    obj = obj[0]
  } else {
    obj = {}
  }
  time_cursor = moment(timestamp)
  if (utcOffset) {
    time_cursor.add(utcOffset, 'minutes')
  }
  for (var i = 0; i < 7; i++) {
    var key = time_cursor.format(DATE_FORMAT)
    if (obj[key] != null) {
      return_obj["days"][i] += (obj[key])
    }
    time_cursor.subtract(1, 'days')
  }
  time_cursor = moment(timestamp)
  if (utcOffset) {
    time_cursor.add(utcOffset, 'minutes')
  }
  for (var j = 0; j < 4; j++) {
    return_obj["weeks"][j] += (sum_time_of_period(time_cursor, 7, obj))
    time_cursor.subtract(1, 'weeks')
  }
  console.log('return obj in get_stats_for_user: ' + user_id + " " + JSON.stringify(return_obj))
  return return_obj
}


/**
 * @param token: id token corresponding to email of synced user.
 * @param from: the type of device the request came from. The response will still contain user ids
 * across different device types.
 * @return
 * {
 * "device_type": [list of user ids]
 * }
 */
app.post('/get_user_ids_from_email', async function(ctx) {
  const {token, from } = ctx.request.body
  if (!valid_from(from)) {
    ctx.body = 'Invalid from key'
    return
  }
  client = android_client2
  if (from == "browser") {
    client = extension_client
  }
  try {
    email = await verify(client, token)
    ctx.body = await get_user_ids_from_email(email)
  } catch(e) {
    ctx.status = 401
    ctx.body = {message: 'Error getting email from id token.'}
  }
 })

/**
 * Sums total time of the designated period (month, week) so far as
 * noted in DB.
 * @param moment_obj: moment object representing the period you want to sum to
 * @param days_of_period: number of days contained in period.
 * @param object: object representing MongoDB document for domain.
 */
sum_time_of_period = function(moment_obj, days_of_period, object) {
  var today = moment_obj.format(DATE_FORMAT)
  var total_time = 0
  if (object[today] != null) {
    total_time = object[today]
  }
  //We need to clone this moment object since moments are mutable.
  var begin_period = moment(moment_obj)
  begin_period.subtract(days_of_period, 'days')
  while(begin_period.format(DATE_FORMAT) != today) {
    var date = begin_period.format(DATE_FORMAT)
    if (object[date] != null) {
      total_time += object[date]
    }
    begin_period.add(1, 'days')
  }
  return total_time
}

get_user_ids_from_email = async function(email) {
    // To anonymize, let's hash it with SHA-256
    email = crypto.createHash('sha256').update(email).digest('hex');
    var [collection,db] = await get_collection("email_to_user")
    var obj = await n2p(function(cb) {
      collection.find({}).toArray(cb)
    })
    if (obj!= null && obj.length > 0) {
      obj = obj[0]
    } else {
      obj = {}
    }
    if (obj[email] == null) {
      returnObj = {}
      for (var i = 0; i < SUPPORTED_DEVICES; i++) {
        returnObj[SUPPORTED_DEVICES[i]] = []
      }
    } else {
      returnObj = obj[email]
    }
    return returnObj
}

require('libs/globals').add_globals(module.exports)
