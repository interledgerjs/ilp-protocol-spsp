const { createSocket } = require('ilp-protocol-paystream')
const { URL } = require('url')
const BigNumber = require('bignumber.js')
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
  const endpoint = new URL(receiver.startsWith('$')
    ? 'https://' + receiver.substring(1)
    : receiver)

  endpoint.pathname = endpoint.pathname === '/'
    ? '/.well-known/pay'
    : endpoint.pathname

  // TODO: make sure that this fetch can never crash this node process. because
  // this could be called from autonomous code, that would pose big problems.
  const response = await fetch(endpoint.href, {
    headers: { accept: 'application/spsp4+json' }
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
  const response = await query(receiver)

  let amount = sourceAmount
  if (!amount) {
    if (!response.balance && typeof response.balance === 'object') {
      throw new Error('receiver must be an invoice ' +
        'OR sourceAmount must be specified. ' +
        'response=' + JSON.stringify(response))
    }

    amount = response.balance.minimum
      ? response.balance.minimum + response.balance.current
      : response.balance.maximum - response.balance.current
  }

  const desiredBalance = new BigNumber(amount).negated()

  await plugin.connect()
  const socket = await createSocket({
    plugin,
    destinationAccount: response.destinationAccount,
    sharedSecret: response.sharedSecret
  })

  socket.setMinAndMaxBalance(desiredBalance.toString())
  return new Promise(resolve => {
    socket.on('chunk', () => {
      if (desiredBalance.gte(socket.balance)) {
        socket.close()
        resolve()
      }
    })
  })
}

module.exports = {
  query,
  pay
}
