# ILP Protocol SPSP

## Description

Implements version 3 of the [Simple Payment Setup Protocol](https://github.com/interledger/rfcs/pull/367).
Based on [PSK2](https://github.com/emschwartz/ilp-protocol-psk2).

## Example

### Simple Usage

Sends a single-chunk PSK payment. Great for micro-payments or micro-donations inside of a script.

```js
await SPSP.pay(plugin, {
  receiver: '$bob.example.com',
  sourceAmount: '1000'
})
```

### Advanced Usage

```js
// query the endpoint first
const query = await SPSP.query('$bob.example.com')
console.log(query)
// {
//   destinationAccount: 'test.example.bob.LwNAw4ZEjlOwkc8xmaQRaRd37YRl8sixSCBPgEEqo8I',
//   sharedSecret: <Buffer 55 67 75 65 67 63 52 45 58 36 66 78 37 6f 70 56 ...>,
//   balance: {
//     maximum: '1000000',
//     current: '0'
//   },
//   ledgerInfo: {
//     currencyCode: 'XRP',
//     currencyScale: 6
//   },
//   receiverInfo: {
//     name: 'Bob Dylan'
//   }
// }

// you can send by destination amount with PSK2, for invoice behavior...
await PSK2.sendDestinationAmount({
  ...query, // for destinationAccount and sharedSecret
  destinationAmount: query.balance.maximum
})

// ...or send by source amount with PSK2, if you want to do a chunked payment...
await PSK2.sendSourceAmount({
  ...query, // for destinationAccount and sharedSecret
  sourceAmount: '10000000'
})

// ...or send one chunk at a time, for a streaming payment
let sequence = 0
const id = crypto.randomBytes(16)
while (true) {
  await PSK2.sendSingleChunk({
    ...query,
    sourceAmount: '200',
    id,
    sequence: sequence++
  })
}
```
