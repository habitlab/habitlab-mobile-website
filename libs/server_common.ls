require! {
  'koa'
  'koa-static'
  'koa-router'
  'koa-bodyparser'
  'koa-jsonp'
  'mongodb'
  'getsecret'
  'koa-basic-auth'
  'n2p'
}

export mongodb
export prelude = require 'prelude-ls'

export kapp = new koa()
kapp.use(koa-jsonp())
#kapp.use(koa-logger())
kapp.use(koa-bodyparser({jsonLimit: '20mb'}))
export app = new koa-router()

if getsecret('username')? or getsecret('password')?
  # custom 401 handling
  app.use (ctx, next) ->>
    try
      await next()
    catch err
      if 401 == err.status
        ctx.status = 401
        ctx.set('WWW-Authenticate', 'Basic')
        ctx.body = 'Authentication failed'
      else
        throw err
  export auth = koa-basic-auth({name: getsecret('username'), pass: getsecret('password')})
else
  export auth = (ctx, next) ->> await next()

export mongourl = getsecret('MONGODB_URI') ? 'mongodb://localhost:27017/default'

export mongourl2 = getsecret('MONGODB_URI') ? 'mongodb://localhost:27017/default'

sleep = (time) ->>
  return new Promise ->
    setTimeout(it, time)

local_cache_db = null
getdb_running = false

export get_mongo_db = ->>
  if local_cache_db?
    return local_cache_db
  if getdb_running
    while getdb_running
      await sleep(1)
    while getdb_running or local_cache_db == null
      await sleep(1)
    return local_cache_db
  getdb_running := true
  connection_options = {
    w: 0
    j: false
    socketOptions: {
      keepAlive: 1,
      connectTimeoutMS: 30000
    }
    server: { 
      # sets how many times to try reconnecting
      reconnectTries: Number.MAX_VALUE,
      # sets the delay between every retry (milliseconds)
      reconnectInterval: 1000 
    }
  }
  /*
  if process.env.PORT? # on heroku
    connection_options.readPreference = mongodb.ReadPreference.PRIMARY_PREFERRED
  else # local machine
    connection_options.readPreference = mongodb.ReadPreference.SECONDARY
    connection_options.readConcern = {
      level: 'available'
    }
  */
  try
    local_cache_db := await n2p -> mongodb.MongoClient.connect(
      mongourl,
      connection_options,
      it
    )
    return local_cache_db
  catch err
    console.error 'error getting mongodb'
    console.error err
    return

local_cache_db2 = null
getdb_running2 = false

export get_mongo_db2 = ->>
  if local_cache_db2?
    return local_cache_db2
  if getdb_running2
    while getdb_running2
      await sleep(1)
    while getdb_running2 or local_cache_db2 == null
      await sleep(1)
    return local_cache_db2
  getdb_running2 := true
  connection_options = {
    w: 0
    j: false
    socketOptions: {
      keepAlive: 1,
      connectTimeoutMS: 30000
    }
    server: { 
      # sets how many times to try reconnecting
      reconnectTries: Number.MAX_VALUE,
      # sets the delay between every retry (milliseconds)
      reconnectInterval: 1000 
    }
  }
  /*
  if process.env.PORT? # on heroku
    connection_options.readPreference = mongodb.ReadPreference.PRIMARY_PREFERRED
  else # local machine
    connection_options.readPreference = mongodb.ReadPreference.SECONDARY
    connection_options.readConcern = {
      level: 'available'
    }
  */
  try
    local_cache_db2 := await n2p -> mongodb.MongoClient.connect(
      mongourl2,
      connection_options,
      it
    )
    return local_cache_db2
  catch err
    console.error 'error getting mongodb2'
    console.error err
    return

export get_collection = (collection_name) ->>
  db = await get_mongo_db()
  fakedb = {
    close: ->
  }
  collection = db.collection(collection_name)
  /*
  proxy_func = (obj, methodname) ->
    orig_method = obj[methodname]
    new_method = ->
      log_collection_exists(collection_name)
      return orig_method.apply(obj, arguments)
    obj[methodname] = new_method.bind(obj)
  proxy_func(collection, 'insert')
  proxy_func(collection, 'insertMany')
  proxy_func(collection, 'insertOne')
  proxy_func(collection, 'update')
  proxy_func(collection, 'updateMany')
  proxy_func(collection, 'updateOne')
  proxy_func(collection, 'save')
  #proxy_func(collection, 'findAndModify')
  #proxy_func(collection, 'findAndUpdate')
  */
  return [collection, fakedb]

export get_collection = (collection_name) ->>
  db = await get_mongo_db2()
  fakedb = {
    close: ->
  }
  collection = db.collection(collection_name)
  proxy_func = (obj, methodname) ->
    orig_method = obj[methodname]
    new_method = ->
      log_collection_exists(collection_name)
      return orig_method.apply(obj, arguments)
    obj[methodname] = new_method.bind(obj)
  proxy_func(collection, 'insert')
  proxy_func(collection, 'insertMany')
  proxy_func(collection, 'insertOne')
  proxy_func(collection, 'update')
  proxy_func(collection, 'updateMany')
  proxy_func(collection, 'updateOne')
  proxy_func(collection, 'save')
  #proxy_func(collection, 'findAndModify')
  #proxy_func(collection, 'findAndUpdate')
  return [collection, fakedb]

export get_signups = ->>
  return await get_collection('signups')

export get_secrets = ->>
  return await get_collection('secrets')

export get_logging_states = ->>
  return await get_collection('logging_states')

export get_installs = ->>
  return await get_collection('installs')

export get_uninstalls = ->>
  return await get_collection('uninstalls')

export get_uninstall_feedback = ->>
  return await get_collection('uninstall_feedback')

export get_proposed_goals = ->>
  return await get_collection2('proposed_goals')

export get_contributed_interventions = ->>
  return await get_collection2('contributed_interventions')

export get_user_active_dates = ->>
  return await get_collection('user_active_dates')

export get_intervention_votes = ->>
  return await get_collection2('intervention_votes')

export get_intervention_votes_total = ->>
  return await get_collection2('intervention_votes_total')

export get_webvisits = ->>
  return await get_collection('webvisits')

export list_collections = ->>
  ndb = await get_mongo_db()
  collections_list = await n2p -> ndb.listCollections().toArray(it)
  ndb.close()
  return collections_list.map (.name)

export list_log_collections_for_user = (userid) ->>
  all_collections = await list_collections()
  return all_collections.filter -> it.startsWith("#{userid}_")

export list_intervention_collections_for_user = (userid) ->>
  all_collections = await list_collections()
  return all_collections.filter(-> it.startsWith("#{userid}_")).filter(->
    entry_key = it.replace("#{userid}_", '')
    return !entry_key.startsWith('synced:') and !entry_key.startsWith('logs:')
  )

export list_log_collections_for_logname = (logname) ->>
  all_collections = await list_collections()
  return all_collections.filter -> it.endsWith("_#{logname}")

export get_collection_for_user_and_logname = (userid, logname) ->>
  return await get_collection("#{userid}_#{logname}")

export need_query_properties = (ctx, properties_list) ->
  for property in properties_list
    if not ctx.request.query[property]?
      ctx.body = JSON.stringify {response: 'error', error: 'Need ' + property}
      return true
  return false

export need_query_property = (ctx, property) ->
  if not ctx.request.query[property]?
    ctx.body = JSON.stringify {response: 'error', error: 'Need ' + property}
    return true
  return false

export expose_get_auth = (func, ...params) ->
  request_path = '/' + func.name
  app.get request_path, auth, (ctx) ->>
    ctx.type = 'json'
    data = ctx.request.query
    for param in params
      if need_query_property(ctx, param)
        return
    data_array = [data[param] for param in params]
    results = await func(...data_array)
    ctx.body = JSON.stringify results

export fix_object = (obj) ->
  if Array.isArray(obj)
    return obj.map(fix_object)
  if typeof(obj) != 'object'
    return obj
  output = {}
  for k,v of obj
    if typeof(k) == 'string'
      if k.includes('.')
        k = k.split('.').join('\u2024')
      if k[0] == '$'
        k = '\ufe69' + k.substr(1)
    output[k] = fix_object(v)
  return output

/**
 * This function validates the from parameter to ensure it falls under the supported device types.
 */
export valid_from = (from) ->
  return from in SUPPORTED_DEVICES

export const SUPPORTED_DEVICES = ['android', 'browser']
require('libs/globals').add_globals(module.exports)
