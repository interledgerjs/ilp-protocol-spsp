const { createConnection } = require('ilp-protocol-stream')
const { sendSingleChunk } = require('ilp-protocol-psk2')
const { URL } = require('url')
const camelCase = require('lodash.camelcase')
const fetch = require('node-fetch')
const logger = require('ilp-logger')('ilp-protocol-spsp')
const MAX_SEND_AMOUNT = '18446744073709551615'

class PaymentError extends Error {
  constructor (message, { totalSent, totalReceived }) {
    super(message)
    this.totalSent = totalSent
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
  json.content_type = response.headers.get('content-type')

  return json
}

async function pay (plugin, {
  receiver,
  pointer = receiver,
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

  if (response.content_type.indexOf('application/spsp4+json') !== -1) {
    const ilpConn = await createConnection({
      plugin,
      destinationAccount: response.destination_account,
      sharedSecret: Buffer.from(response.shared_secret, 'base64'),
      ...streamOpts
    })

    const payStream = ilpConn.createStream()

    try {
      await payStream.sendTotal(sendAmount, { timeout: streamOpts.timeout })
    } catch (err) {
      const totalSent = payStream.totalSent
      try {
        await ilpConn.end()
      } catch (err) {
        logger.debug('Error while ending connection:', err)
      }
      throw new PaymentError('Failed to send specified amount', { totalSent })
    }

    const totalSent = payStream.totalSent
    await ilpConn.end()
    return { totalSent }
  // } else if (response.contentType.indexOf('application/spsp+json') !== -1) {
  // This should technically check for application/spsp+json but due to a bug the old
  // ilp-spsp-server was returning application/json instead, and this code should stay
  // compatible with it.
  } else {
    return sendSingleChunk(plugin, {
      destinationAccount: response.destination_account,
      sharedSecret: Buffer.from(response.shared_secret, 'base64'),
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

  const response = await query(pointer)

  if (response.content_type.indexOf('application/spsp4+json') !== -1) {
    const ilpConn = await createConnection({
      plugin,
      destinationAccount: response.destination_account,
      sharedSecret: Buffer.from(response.shared_secret, 'base64'),
      ...streamOpts
    })

    const stream = await ilpConn.createStream()

    try {
      await stream.receiveTotal(receiveMax, { timeout: streamOpts.timeout })
    } catch (err) {
      const totalReceived = stream.totalReceived
      try {
        await ilpConn.end()
      } catch (err) {
        logger.debug('Error while ending connection:', err)
      }
      throw new PaymentError('Failed to receive specified amount', { totalReceived })
    }

    const totalReceived = stream.totalReceived
    await ilpConn.end()
    return {
      totalReceived: totalReceived
    }
  } else {
    throw new Error('Pull method is only supported by SPSP version 4 using STREAM.')
  }
}

module.exports = {
  query,
  pay,
  pull,
  PaymentError
}
