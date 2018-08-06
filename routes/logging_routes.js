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
const ANDROID = "android"
const BROWSER = "browser"

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
  }
  date = date.format(DATE_FORMAT)
  try {
    const [collection, db] = await get_collection_for_user_and_logname(userid, "domain_stats")
    for (var domain in domains_time) {
      var duration = domains_time[domain]
      //var [collection, db] = await get_collection_for_user_and_logname(userid,
      //"domain_stats")
      var obj = await n2p(function(cb) {
        collection.find({"_id": domain}).toArray(cb)
      })
      var objFound = false
      if (obj != null && obj.length > 0)  {
        obj = obj[0]
        objFound = true
      } else {
        obj = {"_id": domain}
      }

      if (obj[date] == null) {
        obj[date] = 0
      }
      obj[date] += Number(duration)
      if (objFound) {
        collection.updateOne({"_id": domain}, {$set: obj}, function(err, res) {
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
    console.log("EMAIL: " + email)
    // To anonymize, let's hash it with SHA-256
    email = crypto.createHash('sha256').update(email).digest('hex');
    console.log('HASH: ' + email)
    // The id token was valid! We have a user
    var [collection, db] = await get_collection("email_to_user")
    var obj = await n2p(function(cb) {
      collection.find({_id: email}).toArray(cb)
    })
    var objFound = false
    if (obj != null && obj.length > 0)  {
      obj = obj[0]
      objFound = true
    } else {
      obj = {}
      for (device of SUPPORTED_DEVICES) {
        obj[device] = []
      }
    }
    //Convert to set to ensure we're not adding a duplicate id.
    var set = new Set(obj[from])
    set.add(userid)
    // MONGODB deals with arrays better than sets!
    console.log("OBJ: "+ JSON.stringify(obj))
    obj[from] = Array.from(set)
      collection.updateOne({_id: email}, {$set: obj}, {upsert: true}, function(err, res) {
        if (err)  {
          throw err
        }
      })
    const secret = await generate_secret(email)
    ctx.body = {message: 'Sucesss! Registered user ' + userid + ' with ' + email,
                secret: secret}
  } catch(e) {
    console.log(e)
    ctx.body = {message: 'Error. Perhaps your token is outdated?'}
    ctx.status = 401
  }
})

/**
 * Gives total time spent across devices for a given doamin and Google Account
 * As JSON body fields:
 * @param domain: name of domain you want stats  of (i.e. "www.facebook.com")
 * @param token: token id of Google Account
 * @param secret: instead of token, you can use a secret key.
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
  let return_obj = {}
  return_obj['total'] = {days: Array(7).fill(0), weeks: Array(4).fill(0)}
  for (var i = 0; i < SUPPORTED_DEVICES.length; i++) {
    return_obj[SUPPORTED_DEVICES[i]] = {}
  }
  const {token, secret, from, domain, timestamp, utcOffset} = ctx.request.body
  let domain_name = get_domain_name(domain, from)
  if (!valid_from(from)) {
    ctx.body = 'Invalid from key'
    return
  }
  client = android_client2
  if (from == "browser") {
    client = extension_client
  }
  try {
    let email_hash = ""
    if (token) {
        const email = await verify(client, token)
        // To anonymize, let's hash it with SHA-256
        email_hash = crypto.createHash('sha256').update(email).digest('hex');
    } else {
      //We will need to use secret keyboardHidden
      const [collection, db] = await get_collection("secret")
      const email_hash_list = await n2p(function(cb) {
        collection.find({_id: secret}).toArray(cb)
      })
      if (email_hash_list.length == 0) {
        ctx.status = 405
        ctx.body = {message: 'no emails associated with this secret'}
        return
      }
      console.log(email_hash)
      email_hash = email_hash_list[0]['email']
    }


    const user_ids = await get_user_ids_from_email(email_hash)
    for (let j = 0; j < SUPPORTED_DEVICES.length; j++) {
      const device = SUPPORTED_DEVICES[j]
      let device_user_ids = user_ids[device]
      device_user_ids = device_user_ids.map(function(obj) {
        if (obj.id != null){
          return obj.id
        }
        return obj
      })
      for (let i = 0; i < device_user_ids.length; i++) {
        const userid = device_user_ids[i]
        return_obj[device][userid] = await get_stats_for_user(userid, domain_name,
          timestamp, utcOffset, device)
        // We now add this to total
        for (let k = 0; k < 7; k++) {
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
 * @param domain_name: domain name of interest (i.e. "facebook")
 * @param timestamp: the timestamp of the client relative to its timezone
 *                    so we can correctly reference the desired dates.
 * @param utcOffset: the offset from UTC time, in minutes.
 * Returns:
 * {
 *  days: [time_day, time_yesterday, ..., time_6_days_ago],
 *  weeks: [time_this_week, time_last_week, two_weeks_ago, three_weeks_ago]
 * }
 */
get_stats_for_user = async function(user_id, domain_name, timestamp, utcOffset, device) {
  let return_obj = {"days": Array(7).fill(0), "weeks": Array(4).fill(0)}
  var [collection, db] = await get_collection_for_user_and_logname(user_id, "domain_stats")
  // Get list of possible domain values

  const compatible_domains = await get_compatible_domains(collection, domain_name,
     device)
  var obj = await n2p(function(cb) {
    collection.find({"_id": {$in: compatible_domains}}).toArray(cb)
  })
  if (obj != null && obj.length > 0) {
    obj = obj[0]
  } else {
    obj = {}
  }
  let time_cursor = moment(timestamp)
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
  let client = android_client2
  if (from == "browser") {
    let client = extension_client
  }
  try {
    const email = await verify(client, token)
    // To anonymize, let's hash it with SHA-256
    const email_hash = crypto.createHash('sha256').update(email).digest('hex');
    ctx.body = await get_user_ids_from_email(email_hash)
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

/**
 * Get's user ids associated with an email.
 * @param email_hash sha256 hash of email.
 * @param {"android": ["abcbd23432"], "browser":[]}
 */
get_user_ids_from_email = async function(email_hash) {
    var [collection,db] = await get_collection("email_to_user")
    var obj = await n2p(function(cb) {
      collection.find({_id: email_hash}).toArray(cb)
    })
    if (obj!= null && obj.length > 0) {
      obj = obj[0]
    } else {
      obj = {}
      for (let device of SUPPORTED_DEVICES) {
        obj[device] = []
      }
    }
    return obj
}

/**
 * Generates a list of package names/domains that are associated with the domain
 * @param collection: mongoDB collection to query from.
 * @param domain: domain for us to find associated domains
 * @param device: either "android" or "browser"
 */
get_compatible_domains = async function(collection, domain_name, device) {
  let possible_domains = await collection.distinct("_id")
  return possible_domains.filter(function(domain) {
    return get_domain_name(domain, device) == domain_name
  })
}

/**
 * Generates the "important" field in the domain (i.e. www.facebook.com -> "facebook")
 * @param domain: domain (i.e. www.facebook.com or com.facebook.kortana)
 * @param from: either "android" or "browser" (so we know whether it is web domain
 *              or package)
 */
get_domain_name = function(domain, from) {
  if (typeof domain != "string") return ""
  // First, split up domain by periods.
  domain = domain.toLowerCase()
  let names = domain.split(".")
  if (from == ANDROID) {
    // A lot of native app packages have "android.google". Let's cut those out
    names = names.filter(function(obj) {
      return obj != "google" && obj != "android"
    })
  }
  if (names.length < 2) {
    // This is not a normal domain. Just return it as is.
    return domain
  }
  if (from == ANDROID) {
    // It's a package (reversed). Return second element (after "com","org",etc)

    return names[1]
  } else {
    // It's a normal domain. Return second to last element (before "com", etc.)
    return names[names.length - 2]
  }
}

/**
 * This function tranforms our previous domain_stats objects. Before, there was
 * a "domain" field, which requried queries that take O(n) time.
 * Now, domain  will be the primary key in the _id field, which has O(1) lookup
 * time.
 */
 let transition_objects = async function() {
   // Get user user_ids
   const [email_to_user_col, db] = await get_collection("email_to_user")
   const email_to_user_arr = await n2p(function(cb){
     email_to_user_col.find({}).toArray(cb)
   })
   const email_to_user = email_to_user_arr[0]
   let triedOnce = false
   for (let email in email_to_user) {
     if (email == "_id") continue
     const device_types = ['android', 'browser']
     for (let device of device_types) {
       for (let id of email_to_user[email][device]) {
         if (!triedOnce) {
            //Get domain STATS
            const [domain_stats_col, db2] =
              await get_collection_for_user_and_logname(id, "domain_stats")
            // The scary part. We cannot update _id, so we have to
            // delete the object and recreate it.
            let results = await n2p(function(cb) {
              domain_stats_col.find({domain: {$exists: true}}).toArray(cb)
            })
            for (let x of results) {
              x._id = x.domain
              await n2p(function(cb) {
                domain_stats_col.remove({domain: x.domain}, cb)
              })
              await n2p(function(cb) {
                domain_stats_col.insert(x, cb)
              })
            }
         }
       }
     }
   }
 }

/**
 * This script converts the email to user collection from one ginormous document
 * into a document per email hash, which will be much more manageable.
 */
 let transition_email_to_user = async function(ctx) {
   const [collection, db] = await get_collection('email_to_user')
   const docs = await n2p(function(cb) {
     collection.find().toArray(cb)
   })
   const big_obj = docs[0]
   //Now for for each email hash
   let counter = 0
   for (email_hash in big_obj) {
     if (email_hash == "_id") continue //This is not an email hash
     await n2p(function(cb) {
       doc_to_insert = {
         _id: email_hash,
         android: big_obj[email_hash].android,
         browser: big_obj[email_hash].browser
       }
       collection.insert(doc_to_insert, cb)
     })
     console.log('we migrated email ' + email_hash)
     counter += 1
   }
   ctx.body = 'Finished migrating ' + counter + ' users'
   ctx.type = 'json'
 }

/**
 * Generate secret that will serve as substitute for id token.
 * This will then be added to the database.
 * @param email_hash {string} SHA-256 hash of email.
 * @return randomly generated 60-char hex string
 */
let generate_secret = async function(email_hash) {
  // Randomly generate secret.
  let secret = ""
  for (let i = 0; i < 60; i++) {
    secret += "0123456789abcdef"[Math.floor(Math.random() * 16)]
  }
  const [collection, db] = await get_collection("secret")
  await n2p(function(cb){
      collection.insert({_id: secret, email: email_hash}, cb)
  })
  return secret
}

require('libs/globals').add_globals(module.exports)
