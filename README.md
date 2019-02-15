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

Make a pull payment from a designated pull payment payment pointer.

```js
await SPSP.pull(plugin, {
  pointer: '$bob.example.com/4139fb24-3ab6-4ea1-a6de-e8d761ff7569',
  amount: '1000',
  callback: function (pulledAmount) {
    console.log('pulled ' + pulledAmount + ' units!')
  }
})
```

### Advanced Usage

Query the endpoint manually to construct a STREAM or PSK2 payment.
```js
const query = await SPSP.query('$bob.example.com')
console.log(query)
// {
//   destinationAccount: "test.example.bob.LwNAw4ZEjlOwkc8xmaQRaRd37YRl8sixSCBPgEEqo8I",
//   sharedSecret: "gk2jeNSwidKLeVq0f+QrOyemV8EHINNwQsw7b2GI9kg="
// }
```

The query may contain additional information. 