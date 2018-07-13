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
    obj = collection.find({domain: domain});
    if (obj != null && obj.length > 0)  {
      obj = [0]
    } else {
      obj = {domain: domain}
    }
    year = moment().year();
    if (obj[year] == null) {
      obj[year] = {};
    }
    month = moment().month();
    if (obj[year][month] == null) {
      obj[year][month] = {};
    }
    date = moment().date();
    if (obj[year][month][date] == null) {
      obj[year][month][date] = 0;
    }
    obj[year][month][date] += 4;
    await n2p(function(cb) {
      collection.update({domain: domain}, fix_object(obj),cb);
    });
    ctx.body = obj
  } catch (e) {
    console.log(e);
  }
});

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
