const path = require('path')
const url = require('url')
const fs = require('fs')
const qs = require('querystring')

const micro = require('micro')
const typer = require('media-typer')
const rawBody = require('raw-body')
const got = require('got')
const uuidV1 = require('uuid/v1')
const Cookies = require('cookies')
const ejs = require('ejs')
const debug = require('debug')('get-dev-oauth')

const OAUTH_REQ = process.env.OAUTH_REQ || 'https://getpocket.com/v3/oauth/request'
const OAUTH_AUTH = process.env.OAUTH_AUTH || 'https://getpocket.com/v3/oauth/authorize'
const REDIRECT = process.env.REDIRECT || 'https://getpocket.com/auth/authorize'
// const ENDPOINT = `${process.env.ENDPOINT}/oauth/callback` || ''
const LIMIT = process.env.LIMIT || '1mb'

let simpleStorage = new Map()

const prepareView = (tmplPath, tmplData = {}) => {
  let viewContent = false
  const viewPath = path.normalize(path.join(__dirname, tmplPath))

  try {
    viewContent = ejs.render(fs.readFileSync(viewPath, 'utf8'), tmplData)
  } catch (err) {
    throw err
  }

  return viewContent
}

async function _parseUrlEncoded (req) {
  const type = req.headers['content-type']
  const length = req.headers['content-length']
  const encoding = typer.parse(type).parameters.charset
  const str = await rawBody(req, { LIMIT, length, encoding })
  const data = qs.parse(str.toString())

  debug('parseUrlEncoded %s, %o', str, data)
  return data
}

module.exports = async function (req, res) {
  const cookies = new Cookies(req, res)
  const method = String(req.method).toUpperCase()
  const { pathname } = url.parse(req.url, true)

  if (method === 'GET' &&
      pathname === '/oauth/callback') {
    // Receive callback from service vendor
    // let oauthBody = await _parseUrlEncoded(req)
    let identity = cookies.get('now-get-oauth-session')
    let oauthData = qs.parse(simpleStorage.get(identity))
    console.log('ident', identity, oauthData)
    let tokenData = await got.post(OAUTH_AUTH, {
      body: {
        consumer_key: oauthData.consumer,
        code: oauthData.code
      }
    })

    let accessTokenData = qs.parse(tokenData.body)
    console.log('step3 %o', accessTokenData)
    micro.send(res, 200, prepareView('/views/token.html', { accessToken: accessTokenData.access_token }))
  } else if (method === 'POST' &&
             pathname === '/oauth/request') {
    // Get comsumer key from user and start authentication process
    // let input = await micro.json(req)

    let bodyContent = await _parseUrlEncoded(req)
    const CALLBACK = `https://${req.headers.host}/oauth/callback`
    let reqData = await got.post(OAUTH_REQ, {
      body: {
        consumer_key: bodyContent.key,
        redirect_uri: CALLBACK
      }
    })
    let reqContent = qs.parse(reqData.body, true)

    const uniqueId = uuidV1()
    cookies.set('now-get-oauth-session', uniqueId)
    simpleStorage.set(uniqueId, qs.stringify({ consumer: bodyContent.key, code: reqContent.code }))

    res.writeHead(302, {
      'Location': `${REDIRECT}?request_token=${reqContent.code}&redirect_uri=${CALLBACK}`
    })
    res.end()
  } else {
    micro.send(res, 200, prepareView('/views/index.html'))
  }
}
