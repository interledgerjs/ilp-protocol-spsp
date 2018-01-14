const { sendSingleChunk } = require('ilp-protocol-psk2')
const camelCase = require('lodash.camelcase')
const fetch = require('node-fetch')

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
  const endpoint = receiver.startsWith('$')
    ? 'https://' + receiver.substring(1)
    : receiver
 
  // TODO: make sure that this fetch can never crash this node process. because
  // this could be called from autonomous code, that would pose big problems.
  const response = await fetch(endpoint, {
    headers: { accept: 'application/x-spsp-response' }
  })
  const json = await response.json()

  return toCamelCase({
    destination_account: json.destination_account,
    shared_secret: json.shared_secret,
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
  const query = await query(receiver)
  return sendSingleChunk(plugin, {
    destinationAccount: query.destinationAccount,
    sharedSecret: query.sharedSecret,
    minDestinationAmount: '0',
    lastChunk: true,
    sourceAmount
  })
}
