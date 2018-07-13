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
} = require('libs/server_common');

moment = require('moment');

const n2p = require('n2p');
const DATE_FORMAT = "YYYYMMDD";

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

app.get('/addtolog', async function(ctx) {
  ctx.type = 'json'
  let data = ctx.request.query
  const {userid, logname} = data
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
  ctx.body = JSON.stringify({response: 'hello', success: true})
})

app.post('/addtolog', async function(ctx) {
  ctx.type = 'json'
  let data = ctx.request.body
  const {userid, logname} = data
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

app.post('/addsessiontototal', async function(ctx) {
  ctx.type = 'json';
  const {userid, domain} = ctx.request.body;
  try {
    var [collection, db] = await get_collection_for_user_and_logname(userid, "domain_stats");
    var obj = await n2p(function(cb) {
      collection.find({domain: domain}).toArray(cb)
    })
    var objFound = false;
    if (obj != null && obj.length > 0)  {
      obj = obj[0]
      objFound = true;
    } else {
      obj = {domain: domain}
    }
    var date = moment().format(DATE_FORMAT)
    if (obj[date] == null) {
      obj[date] = 0
    }
    obj[date] += 4;
    if (objFound) {
      console.log(JSON.stringify(obj));
      collection.updateOne({domain: domain}, {$set: obj}, function(err, res) {
        if (err)  {
          console.log("an error occurred.");
          throw err;
        }
        console.log("1 document updated");
      });
    } else {
      await n2p(function(cb) {
        collection.insert(fix_object(obj),cb);
      });
    }
    ctx.body = obj;
  } catch (e) {
    console.log(e);
  }
});

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
  const {domain, userid} = ctx.request.query;
  var return_obj = {};
  return_obj.days = [];
  return_obj.weeks = [];
  var [collection, db] = await get_collection_for_user_and_logname(userid, "domain_stats");
  var obj = await n2p(function(cb) {
    collection.find({domain: domain}).toArray(cb);
  });
  time_cursor = moment();
  for (var i = 0; i < 7; i++) {
    var key = time_cursor.format(DATE_FORMAT);
    if (obj[key] != null) {
      return_obj.days.push(obj[key]);
    } else {
      return_obj.days.push(0);
    }
    time_cursor.subtract(1, 'days');
  }
  time_cursor = moment();
  for (var j = 0; j < 4; j++) {
    return_obj.weeks.push(sum_time_of_period(time_cursor, 'week', obj))
    time_cursor.subtract(1, 'weeks');
  }
  ctx.body = return_obj;
});

/**
 * Sums total time of the designated period (month, week) so far as
 * noted in DB.
 * @param moment: moment object representing the period you want to sum to
 * @param period: string ('week' or 'month')
 * @param object; object representing MongoDB document for domain.
 */
sum_time_of_period = function(moment_obj, period, object) {
  var today = moment_obj.format(DATE_FORMAT);
  var total_time = 0;
  if (object[today] != null) {
    total_time = object[today];
  }
  //We need to clone this moment object since moments are mutable.
  var begin_period = moment_obj(moment);
  begin_period.startOf(period);
  while(begin_period.format(DATE_FORMAT) != today) {
    var date = begin_period.format(DATE_FORMAT);
    if (object[date] != null) {
      total_time += object[date];
    }
    begin_period.add(1, 'days');
  }
  return total_time;
}
/*
app.get '/addtolog', (ctx) ->>
  ctx.type = 'json'
  {userid, logname} = ctx.request.query
  ctx.body = JSON.stringify {response: 'you gave the followign data', data: ctx.request.query}

  return
  # {itemid} = ctx.request.body
  logname = logname.split('/').join(':')
  if not userid?
    ctx.body = JSON.stringify {response: 'error', error: 'need parameter userid'}
    return
  if not logname?
    ctx.body = JSON.stringify {response: 'error', error: 'need parameter logname'}
    return
  #if not itemid?
  #  ctx.body = JSON.stringify {response: 'error', error: 'need parameter itemid'}
  #  return
  #if itemid.length != 24
  #  ctx.body = JSON.stringify {response: 'error', error: 'itemid length needs to be 24'}
  #  return
  try
    [collection,db] = await get_collection_for_user_and_logname(userid, logname)
    #ctx.request.body._id = mongodb.ObjectId.createFromHexString(itemid)
    if ctx.request.body.timestamp?
      ctx.request.body.timestamp_local = ctx.request.body.timestamp
    ctx.request.body.timestamp = Date.now()
    await n2p -> collection.insert(fix_object(ctx.request.body), it)
  catch err
    console.error 'error in addtolog'
    console.error err
  finally
    db?close()
  #ctx.body = JSON.stringify {response: 'error', error: 'not yet implemented'}
  ctx.body = JSON.stringify {response: 'success', success: true}
*/

require('libs/globals').add_globals(module.exports)
