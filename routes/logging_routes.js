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
const CLIENT_ID_EXTENSION = get_secret('CLIENT_ID_EXTENSION')

const {OAuth2Client} = require('google-auth-library')
const android_client = new OAuth2Client(CLIENT_ID_ANDROID)
const extension_client = new OAuth2Client(CLIENT_ID_EXTENSION)

async function verify(client, token) {
  const ticket = await client.verifyIdToken({
      idToken: token,
      audience: [CLIENT_ID_ANDROID, CLIENT_ID_EXTENSION],  // Specify the CLIENT_ID of the app that accesses the backend
      // Or, if multiple clients access the backend:
      //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
  })
  const payload = ticket.getPayload()
  console.log(JSON.stringify(payload))
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
  console.log(ctx.request.body)
  console.log(data)
  console.log(fix_object(data))
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

/**
 * In JSON request body:
 * @param userid: id of user
 * @param domain: domain of session (i.e. 'facebook.com')
 * @param time: duration of session in seconds.
 */
app.post('/addsessiontototal', async function(ctx) {
  ctx.type = 'json'
  const {userid, domain, time} = ctx.request.body
  try {
    var [collection, db] = await get_collection_for_user_and_logname(userid, "domain_stats")
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
    var date = moment().format(DATE_FORMAT)
    if (obj[date] == null) {
      obj[date] = 0
    }
    obj[date] += time
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
    ctx.body = obj
  } catch (e) {
    console.log(e)
  }
})

/**
 * Registers user id with given email to allow for syncing logs across devices.
 * In JSON request body:
 * @param userid: id of user associated with HabitLab install.
 * @param token: the Id Token associated with the Google Account.
 * @param from: either "android" or "browser" 
 */
app.post('/register_user_with_email', async function(ctx) {
  ctx.type = 'json'
  const {userid, token, from} = ctx.request.body
  // NOTE: userid is the userid associated with HabitLab install, NOT Google's user id.
  client = android_client
  if (from == "browser") {
    client = extension_client
  }
  try {
    email = await verify(client, token)
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
 * This fetches the stats necessary to display a synced, total visualziation in
 * the app. The return object looks like this:
 * 
 * {
 *  days: [time_day, time_yesterday, ..., time_6_days_ago],
 *  weeks: [time_this_week, time_last_week, two_weeks_ago, three_weeks_ago]
 * }
 */
app.get('/user_external_stats', async function(ctx) {
  // Get time spent in day, week, and month.
  const {domain, userid} = ctx.request.query
  var return_obj = {}
  return_obj.days = []
  return_obj.weeks = []
  for (var l = 0; l < 7; l++) {
    return_obj.days.push(0)
    if (l < 4)
      return_obj.weeks.push(0)
  }
  userid = userid
  var [collection, db] = await get_collection_for_user_and_logname(userid, "domain_stats")
  var obj = await n2p(function(cb) {
    collection.find({domain: domain}).toArray(cb)
  })
  if (obj!= null && obj.length > 0) {
    obj = obj[0]
  } else {
    obj = {}
  }
  time_cursor = moment()
  for (var i = 0; i < 7; i++) {
    var key = time_cursor.format(DATE_FORMAT)
    if (obj[key] != null) {
      return_obj.days[i] += (obj[key])
    } 
    time_cursor.subtract(1, 'days')
  }
  time_cursor = moment()
  for (var j = 0; j < 4; j++) {
    return_obj.weeks[j] += (sum_time_of_period(time_cursor, 'week', obj))
    time_cursor.subtract(1, 'weeks')
  }
  ctx.body = return_obj
})

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
  client = android_client
  if (from == "browser") {
    client = extension_client
  }
  try {
    email = await verify(client, token)
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
      ctx.body = {}
      for (var i = 0; i < SUPPORTED_DEVICES; i++) {
        ctx.body[SUPPORTED_DEVICES[i]] = []
      }
    } else {
      ctx.body = obj[email]
    }
  } catch(e) {
    ctx.status = 401
    ctx.body = {message: 'Error getting email from id token.'}
  }
 })

/**
 * Sums total time of the designated period (month, week) so far as
 * noted in DB.
 * @param moment_obj: moment object representing the period you want to sum to
 * @param period: string ('week' or 'month')
 * @param object: object representing MongoDB document for domain.
 */
sum_time_of_period = function(moment_obj, period, object) {
  var today = moment_obj.format(DATE_FORMAT)
  var total_time = 0
  if (object[today] != null) {
    total_time = object[today]
  }
  //We need to clone this moment object since moments are mutable.
  var begin_period = moment(moment_obj)
  begin_period.startOf(period)
  while(begin_period.format(DATE_FORMAT) != today) {
    var date = begin_period.format(DATE_FORMAT)
    if (object[date] != null) {
      total_time += object[date]
    }
    begin_period.add(1, 'days')
  }
  return total_time    
}

require('libs/globals').add_globals(module.exports)
