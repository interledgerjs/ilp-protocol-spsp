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

class PullError extends Error {
  constructor (message, totalReceived) {
    super(message)
    this.totalReceived = totalReceived
  }
}

async function query (pointer) {
  // TODO: further validation required on payment-pointer?
  // TODO: continue to support the old webfinger acct style?
  const endpoint = new URL(pointer.startsWith('$')
    ? 'https://' + pointer.substring(1)
    : pointer)

  endpoint.pathname = endpoint.pathname === '/'
    ? '/.well-known/pay'
    : endpoint.pathname

  // TODO: make sure that this fetch can never crash this node process. because
  // this could be called from autonomous code, that would pose big problems.
  const response = await fetch(endpoint.href, {
    headers: { accept: 'application/spsp4+json, application/spsp+json' }
  })

  if (response.status !== 200) {
    throw new Error('got error response from spsp payment pointer.' +
      ' endpoint="' + endpoint.href + '"' +
      ' status=' + response.status +
      ' message="' + (await response.text()) + '"')
  }

  const json = await response.json()
  json.shared_secret = Buffer.from(json.shared_secret, 'base64')
  json.content_type = response.headers.get('content-type')

  return toCamelCase(json)
}

async function pay (plugin, {
  pointer,
  sourceAmount,
  streamOpts = {}
  // TODO: do we need destinationAmount?
  // TODO: do we need application data?
}) {
  await plugin.connect()
  const response = await query(pointer)

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
    await payStream.sendTotal(sendAmount)

    await ilpConn.end()
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

async function pull (plugin, {
  pointer,
  amount,
  streamOpts = {}
}) {
  await plugin.connect()
  const receiveMax = amount || Infinity

  let response
  try {
    response = await query(pointer)
  } catch (err) {
    const endpoint = new URL(pointer.startsWith('$')
      ? 'https://' + pointer.substring(1)
      : pointer)
    const postResponse = await fetch(endpoint.href, {
      method: 'post'
    })
    if (postResponse.status !== 200) {
      throw new Error('got error response from spsp server.' +
        ' endpoint="' + endpoint.href + '"' +
        ' status=' + postResponse.status +
        ' message="' + (await postResponse.text()) + '"')
    }
    response = await query(pointer)
  }

  if (response.contentType.indexOf('application/spsp4+json') !== -1) {
    const ilpConn = await createConnection({
      plugin,
      destinationAccount: response.destinationAccount,
      sharedSecret: response.sharedSecret,
      ...streamOpts
    })

    const stream = await ilpConn.createStream()

    try {
      await stream.receiveTotal(receiveMax, { timeout: streamOpts.timeout })
    } catch (err) {
      const totalReceived = stream.totalReceived
      await ilpConn.end()
      throw new PullError('Failed to receive specified amount', totalReceived)
    }

    const totalReceived = stream.totalReceived
    await ilpConn.end()
    return totalReceived
  } else {
    // PSK2 Solution?
  }
}

module.exports = {
  query,
  pay,
  pull,
  PullError
}
