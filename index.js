const { createConnection } = require('ilp-protocol-stream')
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
    headers: { accept: 'application/spsp+json' }
  })
  const json = await response.json()

  return toCamelCase({
    destination_account: json.destination_account,
    shared_secret: Buffer.from(json.shared_secret, 'base64'),
    balance: json.balance,
    ledger_info: json.ledger_info,
    receiver_info: json.receiver_info
  })
}

async function pay (plugin, {
  receiver,
  sourceAmount
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

  const ilpConn = await createConnection({
    plugin,
    destinationAccount: response.destinationAccount,
    sharedSecret: response.sharedSecret
  })

  const payStream = ilpConn.createStream()

  return Promise.race([
    payStream.sendTotal(sendAmount),
    new Promise(resolve => payStream.on('end', resolve))
  ])
}

module.exports = {
  query,
  pay
}
