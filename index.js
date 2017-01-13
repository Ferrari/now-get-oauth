const path = require('path')
const url = require('url')
const fs = require('fs')
const qs = require('querystring')

const micro = require('micro')
const typer = require('media-typer')
const rawBody = require('raw-body')
const got = require('got')
const debug = require('debug')('get-dev-oauth')

const OAUTH_REQ = process.env.OAUTH_REQ || 'https://getpocket.com/v3/oauth/request'
const OAUTH_AUTH = process.env.OAUTH_AUTH || 'https://getpocket.com/v3/oauth/authorize'
const REDIRECT = process.env.REDIRECT || 'https://getpocket.com/auth/authorize'
const COMSUMER_KEY = process.env.COMSUMER_KEY || '62472-b2317094c3988dd3fe9aba62'
const ENDPOINT = `${process.env.ENDPOINT}/oauth/callback` || ''
const LIMIT = process.env.LIMIT || '1mb'

const prepareView = (tmplPath) => {
  let viewContent = false
  const viewPath = path.normalize(path.join(__dirname, tmplPath))

  try {
    viewContent = fs.readFileSync(viewPath, 'utf8')
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
  const method = String(req.method).toUpperCase()
  const { pathname } = url.parse(req.url, true)
  let reqCode = ''

  if (method === 'GET' &&
      pathname === '/oauth/callback') {
    // Receive callback from service vendor
    // let oauthBody = await _parseUrlEncoded(req)
    console.log(req.url, '!!!')
    let tokenData = await got.post(OAUTH_AUTH, {
      body: {
        consumer_key: COMSUMER_KEY,
        code: reqCode
      }
    })
    console.log("!!@@")
    console.log('token', url.parse(tokenData.body))
    micro.send(res, 200, prepareView('/views/token.html'))
  } else if (method === 'POST' &&
             pathname === '/oauth/request') {
    // Get comsumer key from user and start authentication process
    // let input = await micro.json(req)

    let bodyContent = await _parseUrlEncoded(req)
    let reqData = await got.post(OAUTH_REQ, {
      body: {
        consumer_key: bodyContent.key,
        redirect_uri: ENDPOINT
      }
    })
    let reqContent = qs.parse(reqData.body, true)
    reqCode = reqContent.code
    res.writeHead(302, {
      'Location': `${REDIRECT}?request_token=${reqContent.code}&redirect_uri=${ENDPOINT}`
    })
    res.end()
  } else {
    return (req.session)
      ? micro.send(res, 200, prepareView('/views/index.html'))
      : micro.send(res, 400, 'OAuth authentication requires session support')
  }
}
