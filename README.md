# ILP Protocol SPSP

## Description

Implements version 3 of the [Simple Payment Setup Protocol](https://github.com/interledger/rfcs/pull/367).

## Example

### Simple Usage

Sends a single-chunk PSK payment or a STREAM payment, if the server supports
it. Great for micro-payments or micro-donations inside of a script.

```js
await SPSP.pay(plugin, {
  pointer: '$bob.example.com',
  sourceAmount: '1000'
})
```

### Advanced Usage

Query the endpoint manually to construct a STREAM or PSK2 payment.
```js
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
//   },
//   contentType: 'application/spsp4+json'
// }
```

Make a pull payment from a dedicated pull payment server

```js
await SPSP.pull(plugin, {
  pointer: '$subscriptions.example.com/f8095a44-c77f-4414-a19d-7aeca03f17c7'
})
```
