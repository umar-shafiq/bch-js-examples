/*
  Send all BCH from one address to another. Similar to consolidating UTXOs.
*/

// Set NETWORK to either testnet or mainnet
const NETWORK = `mainnet`

// REST API servers.
const MAINNET_API = `http://api.bchjs.cash/v3/`
const TESTNET_API = `http://testnet.bchjs.cash/v3/`

//bch-js-examples require code from the main bch-js repo
const BCHJS = require('@chris.troutner/bch-js')

// Instantiate bch-js based on the network.
let bchjs
if (NETWORK === `mainnet`) bchjs = new BCHJS({ restURL: MAINNET_API })
else bchjs = new BCHJS({ restURL: TESTNET_API })

// Open the wallet generated with create-wallet.
try {
  var walletInfo = require(`../create-wallet/wallet.json`)
} catch (err) {
  console.log(
    `Could not open wallet.json. Generate a wallet with create-wallet first.`
  )
  process.exit(0)
}

const SEND_ADDR = walletInfo.cashAddress
const SEND_MNEMONIC = walletInfo.mnemonic

// Send the money back to the same address. Edit this if you want to send it
// somewhere else.
const RECV_ADDR = 'qzlfaxdq9s09qd70fkaaksmdl7n4d6quxgs02d83s9' //walletInfo.cashAddress

async function sendAll() {
  try {
    // instance of transaction builder
    if (NETWORK === `mainnet`)
      var transactionBuilder = new bchjs.TransactionBuilder()
    else var transactionBuilder = new bchjs.TransactionBuilder("testnet")

    let sendAmount = 0
    const inputs = []

    const utxos = await bchjs.Blockbook.utxo(SEND_ADDR)

    // Loop through each UTXO assigned to this address.
    for (let i = 0; i < utxos.length; i++) {
      const thisUtxo = utxos[i]

      inputs.push(thisUtxo)

      sendAmount += thisUtxo.satoshis

      // ..Add the utxo as an input to the transaction.
      transactionBuilder.addInput(thisUtxo.txid, thisUtxo.vout)
    }

    // get byte count to calculate fee. paying 1.2 sat/byte
    const byteCount = bchjs.BitcoinCash.getByteCount(
      { P2PKH: inputs.length },
      { P2PKH: 1 }
    )
    console.log(`byteCount: ${byteCount}`)

    const satoshisPerByte = 1.0
    const txFee = Math.ceil(satoshisPerByte * byteCount)
    console.log(`txFee: ${txFee}`)

    // Exit if the transaction costs too much to send.
    if (sendAmount - txFee < 0) {
      console.log(
        `Transaction fee costs more combined UTXOs. Can't send transaction.`
      )
      return
    }

    // add output w/ address and amount to send
    transactionBuilder.addOutput(RECV_ADDR, sendAmount - txFee)

    // Generate a change address from a Mnemonic of a private key.
    const change = await changeAddrFromMnemonic(SEND_MNEMONIC)

    // Generate a keypair from the change address.
    const keyPair = bchjs.HDNode.toKeyPair(change)

    // sign w/ HDNode
    let redeemScript
    inputs.forEach((input, index) => {
      transactionBuilder.sign(
        index,
        keyPair,
        redeemScript,
        transactionBuilder.hashTypes.SIGHASH_ALL,
        input.satoshis
      )
    })

    // build tx
    const tx = transactionBuilder.build()
    // output rawhex
    const hex = tx.toHex()
    //console.log(`TX hex: ${hex}`)
    console.log(` `)

    // Broadcast transation to the network
    const txid = await bchjs.RawTransactions.sendRawTransaction([hex])
    const util = require("../util.js")
    console.log(`Transaction ID: ${txid}`)
    console.log(`Check the status of your transaction on this block explorer:`)
    util.transactionStatus(txid, NETWORK)
  } catch (err) {
    console.log(`error: `, err)
  }
}
sendAll()

// Generate a change address from a Mnemonic of a private key.
async function changeAddrFromMnemonic(mnemonic) {
  // root seed buffer
  const rootSeed = await bchjs.Mnemonic.toSeed(mnemonic)

  // master HDNode
  let masterHDNode
  if (NETWORK === `mainnet`) masterHDNode = bchjs.HDNode.fromSeed(rootSeed)
  else masterHDNode = bchjs.HDNode.fromSeed(rootSeed, "testnet")

  // HDNode of BIP44 account
  const account = bchjs.HDNode.derivePath(masterHDNode, "m/44'/145'/0'")

  // derive the first external change address HDNode which is going to spend utxo
  const change = bchjs.HDNode.derivePath(account, "0/0")

  return change
}
