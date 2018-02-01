process.on 'unhandledRejection', (reason, p) ->
  throw new Error(reason)

require('app-module-path').addPath(__dirname)

require! {
  levn
  getsecret
  #bluebird
}

#fs = bluebird.promisifyAll(require('fs'))

roles_list = ['logging', 'viewdata']
if getsecret('roles')?
  roles_list = levn.parse '[String]', getsecret('roles')
roles = {}
for role in roles_list
  roles[role] = true

if roles.debug?
  require('libs/globals').enable_globals()
else
  require('libs/globals').disable_globals()

{
  kapp
  app
  auth
} = require 'libs/server_common'

app.use (ctx, next) ->>
  ip_addr = ctx.request.headers["x-forwarded-for"]
  if ip_addr
    list = ip_addr.split(",")
    ip_addr = list[list.length-1]
  else
    ip_addr = ctx.request.ip
  ctx.request.ip_address_fixed = ip_addr
  await next()

if roles.https?
  app.use(require('koa-sslify')({trustProtoHeader: true}))

require('routes/common_routes')
if roles.logging?
  require('routes/logging_routes')
if roles.viewdata?
  require('routes/viewdata_routes')

if roles.debug?
  do ->
    console.log 'go to chrome://inspect to debug'
    # https://medium.com/@paul_irish/debugging-node-js-nightlies-with-chrome-devtools-7c4a1b95ae27
    for k,v of require('libs/globals').get_globals()
      global[k] = v
    global.printcb = (err, x) ->
      console.log err
      if x?
        console.log(x)
    setInterval ->
      # seems to be necessary so that async calls resolve in the inspector
    , 100

kapp.use(app.routes())
kapp.use(app.allowedMethods())

if roles.viewdata?
  kapp.use(require('koa-static')(__dirname + '/www'))

port = process.env.PORT ? 5000
kapp.listen(port)
console.log "listening to port #{port} visit http://localhost:#{port}"

