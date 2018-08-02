const {
  prelude,
  app,
  auth,
  get_mongo_db,
  get_collection,
  get_signups,
  get_secrets,
  get_logging_states,
  get_installs,
  get_uninstalls,
  get_uninstall_feedback,
  list_collections,
  list_log_collections_for_user,
  list_intervention_collections_for_user,
  list_log_collections_for_logname,
  get_collection_for_user_and_logname,
  get_user_active_dates,
  need_query_property,
  need_query_properties,
  expose_get_auth,
} = require('libs/server_common')

const n2p = require('n2p')
const moment = require('moment')
const semver = require('semver')
/**
app.get('/printcollection', auth, async function(ctx) {
  const {userid, logname} = ctx.request.query
  const collection_name = ctx.request.query.collection
  if (userid != null && logname != null) {
    collection_name = `${userid}_${logname}`
  }
  if (collection_name == null) {
    ctx.body = JSON.stringify({response: 'error', error: 'need paramter collection'})
  }
  try {
    var [collection, db] = await get_collection(collection_name)
    items = await n2p(function(cb) {
      collection.find({}).toArray(cb)
    })
    ctx.body = JSON.stringify(items)
  } catch (err) {
    console.log('error in printcollection')
    console.log(err)
    ctx.body = JSON.stringify({response: 'error', error: 'error in printcollection'})
  } finally {
    if (db != null) {
      db.close()
    }
  }
})

app.get('/listcollections', auth, async function(ctx) {
  ctx.type = 'json'
  ctx.body = JSON.stringify(await list_collections())
})
*/


require('libs/globals').add_globals(module.exports)
