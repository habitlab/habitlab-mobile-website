const {
  prelude,
  app,
  auth,
  get_mongo_db,
  get_collection,
  get_habitlab_collection,
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

/**
 * Gets list of users who have both android and browser installs.
 * @return [{_id: <email_hash>, android: [], browser: []}]
 */
app.get('/synced_emails', auth, async function(ctx){
  const [collection, db] = await get_collection('email_to_user')
  //Find users who have BOTH Android and Browser data.
  const emails = await n2p(function(cb) {
    collection.find(
      {$or:
        [
          {android: {$exists: true, $not: {$size: 0}}},
          {browser: {$exists: true, $not: {$size: 0}}}
        ]
      }
    ).toArray(cb)
  })
  for (let email of emails) {
    if (email.android == null){
      email.android = []
    } else if (email.browser == null) {
      email.browser = []
    }
  }
  ctx.type = 'json'
  ctx.body = JSON.stringify(emails)
})

/**
 * Figures out number of enabled frequent and infrequent domains.
 */
app.get('/freq_stats_for_user', auth, async function(ctx) {
  const {id} = ctx.request.query
  const [collection, db] = await get_collection_for_user_and_logname(id, "sessions")
  // Go thru and count em.
  const options = ['freq', 'infreq']
  let goals = {}
  const isoWeeks = new Set()
  for (let freq of options) {
    const sessions = await n2p(function(cb){
      collection.find({
        enabled: true,
        frequent: freq == "freq" ? true : false
      }).toArray(cb)
    })
    for (session of sessions) {
      if (session.isoWeek != null) {
        isoWeeks.add(session.isoWeek)
        if (goals[session.isoWeek] == null) {
          goals[session.isoWeek] = {'freq': new Set(), 'infreq': new Set()}
        }
        goals[session.isoWeek][freq].add(session.domain)
      }
    }
  }
  //Convert these sets into lists.
  for (let iso of isoWeeks) {
    goals[iso] = {'freq': Array.from(goals[iso]['freq']), 'infreq': Array.from(goals[iso]['infreq'])}
  }
  ctx.body = goals
  ctx.type = 'json'
})

app.get('/freq_stats_for_user_browser', auth, async function(ctx) {
  const {id} = ctx.request.query
  const [collection, db] = await get_habitlab_collection(id + "_synced:goal_frequencies")
  const goal_logs = await n2p(function(cb) {
    collection.find({}).toArray(cb)
  })
  let goals = {}
  
  for (let goal_log of goal_logs) {
    // FREQ: isoWeeks() % 2 == onWeek
    const isoWeek = moment(goal_log["timestamp_local"]).isoWeek()
    if (goals[isoWeek] == null) {
      goals[isoWeek] = {'freq': [], 'infreq': []}  
    }
    
    
    let log = JSON.parse(goal_log['val'])
    let freq = false
    console.log(goal_log['val'])
    if (log['algorithm'] === 'isoweek_alternating') {
      console.log('isoweek_alternating')
      //Old algorithm: onweeks == isoWeek %  2
      freq = log.onweeks == isoWeek % 2
    } else {
      console.log('isoweek_random')
      // New algorithm: array of 0 vs 1 for each week of the year.
      // 0 is infrequent, 1 is frequent
      freq = log.onweeks[isoWeek] == 1
    }
    if (freq) {
      goals[isoWeek]["freq"].push(goal_log['key'])
    } else {
      goals[isoWeek]["infreq"].push(goal_log['key'])
    }
  }
  ctx.type = 'json'
  ctx.body = goals
})




require('libs/globals').add_globals(module.exports)
