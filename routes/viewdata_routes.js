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
  let collection_name = ctx.request.query.collection
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
        frequent: freq == "freq" ? true : false,
      }).toArray(cb)
    })
    for (session of sessions) {
      if (session.interventions && session.interventions.length > 0) {
        if (session.isoWeek != null) {
          isoWeeks.add(session.isoWeek)
          if (goals[session.isoWeek] == null) {
            goals[session.isoWeek] = {'freq': new Set(), 'infreq': new Set()}
          }
          goals[session.isoWeek][freq].add(session.domain)
        }
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

let browser_freq = 0
let browser_infreq = 0

app.get('/freq_stats_for_user_browser', auth, async function(ctx) {
  const {id} = ctx.request.query
  const [collection, db] = await get_habitlab_collection(id + "_synced:goal_frequencies")
  const goal_logs = await n2p(function(cb) {
    collection.find({}).toArray(cb)
  })
  let goals = {}

  for (let goal_log of goal_logs) {
    // FREQ: isoWeeks() % 2 == onWeek
    const isoWeek = moment(goal_log["timestamp"]).isoWeek()
    let log = JSON.parse(goal_log['val'])
    if (log['algorithm'] === 'isoweek_random'){
      // New algorithm: array of 0 vs 1 for each week of the year.
      // 0 is infrequent, 1 is frequent
      let curIsoWeek = moment().isoWeek() + 1
      for (let week = isoWeek; week <= curIsoWeek; week++) {
        //First, check if algorithm is alternating.
        if (goals[week] == null) {
          goals[week] = {'freq': [], 'infreq': []}
        }
        if (log.onweeks[week] == 1) {
          browser_freq++
          goals[week]["freq"].push(goal_log['key'])
        } else {
          browser_infreq++
          goals[week]["infreq"].push(goal_log['key'])
        }
      }
    }

  }
  ctx.type = 'json'
  ctx.body = goals
})




require('libs/globals').add_globals(module.exports)
