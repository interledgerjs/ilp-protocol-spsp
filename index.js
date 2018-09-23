const { createConnection } = require('ilp-protocol-stream')
const { sendSingleChunk } = require('ilp-protocol-psk2')
const { URL } = require('url')
const camelCase = require('lodash.camelcase')
const fetch = require('node-fetch')
const MAX_SEND_AMOUNT = '18446744073709551615'

// utility function for converting query response
function toCamelCase (obj) {
  if (obj === null) return null
  let res = {}
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) continue
    res[camelCase(key)] = typeof obj.key === 'object'
      ? toCamelCase(obj[key])
      : obj[key]
  }
  return res
}

async function query (receiver) {
  // TODO: further validation required on payment-pointer?
  // TODO: continue to support the old webfinger acct style?
  const endpoint = new URL(receiver.startsWith('$')
    ? 'https://' + receiver.substring(1)
    : receiver)

  endpoint.pathname = endpoint.pathname === '/'
    ? '/.well-known/pay'
    : endpoint.pathname
 
  // TODO: make sure that this fetch can never crash this node process. because
  // this could be called from autonomous code, that would pose big problems.
  const response = await fetch(endpoint.href, {
    headers: { accept: 'application/spsp4+json, application/spsp+json' }
  })

  if (response.status !== 200) {
    throw new Error('got error response from spsp receiver.' +
      ' endpoint="' + endpoint.href + '"' +
      ' status=' + response.status +
      ' message="' + (await response.text()) + '"')
  }

  const json = await response.json()

  return toCamelCase({
    destination_account: json.destination_account,
    shared_secret: Buffer.from(json.shared_secret, 'base64'),
    balance: json.balance,
    ledger_info: json.ledger_info,
    receiver_info: json.receiver_info,
    content_type: response.headers.get('content-type')
  })
}

async function pay (plugin, {
  receiver,
  sourceAmount,
  streamOpts = {}
  // TODO: do we need destinationAmount?
  // TODO: do we need application data?
}) {
  await plugin.connect()
  const response = await query(receiver)

  // TODO: should this be more explicit?
  let sendAmount = sourceAmount 
  if (response.balance && !sourceAmount) {
    sendAmount = MAX_SEND_AMOUNT
  }

  if (response.contentType.indexOf('application/spsp4+json') !== -1) {
    const ilpConn = await createConnection({
      plugin,
      destinationAccount: response.destinationAccount,
      sharedSecret: response.sharedSecret,
      ...streamOpts
    })

    const payStream = ilpConn.createStream()

    return Promise.race([
      payStream.sendTotal(sendAmount).then(() => payStream.end()),
      new Promise(resolve => payStream.on('end', resolve))
    ])
  // } else if (response.contentType.indexOf('application/spsp+json') !== -1) {
  // This should technically check for application/spsp+json but due to a bug the old
  // ilp-spsp-server was returning application/json instead, and this code should stay
  // compatible with it.
  } else {
    return sendSingleChunk(plugin, {
      destinationAccount: response.destinationAccount,
      sharedSecret: response.sharedSecret,
      minDestinationAmount: '0',
      lastChunk: true,
      sourceAmount
    })
  }
}

module.exports = {
  query,
  pay
}
