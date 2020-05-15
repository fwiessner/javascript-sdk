const _ = require("lodash");
const Env = require("./static/env").env
const kavaUtils = require("../src/utils").utils;
const KavaClient = require("../src/client").KavaClient;
const BnbApiClient = require("@binance-chain/javascript-sdk");
const bnbCrypto = BnbApiClient.crypto;

const BNB_CONVERSION_FACTOR = 10 ** 8;

var main = async () => {
  await incomingSwap()
}

var incomingSwap = async () => {
  // Start new Kava client
  kavaClient = new KavaClient(Env.KavaEndpoints.Testnet5000);
  kavaClient.setWallet(Env.KavaAccount.Testnet5000.Mnemonic);
  await kavaClient.initChain();

  // Start Binance Chain client
  const bnbClient = await new BnbApiClient(Env.BinanceEndpoints.Testnet);
  bnbClient.chooseNetwork("testnet");
  const privateKey = bnbCrypto.getPrivateKeyFromMnemonic(Env.BinanceAccount.Testnet.Mnemonic);
  bnbClient.setPrivateKey(privateKey);
  await bnbClient.initChain();

  // -------------------------------------------------------------------------------
  //                       Binance Chain blockchain interaction
  // -------------------------------------------------------------------------------
  // Assets involved in the swap
  const asset = "BNB";
  const amount = 1 * BNB_CONVERSION_FACTOR;

  // Addresses involved in the swap
  const sender = Env.BinanceAccount.Testnet.Address; // user's address on Binance Chain
  const recipient = Env.BinanceDeputy.Testnet; // deputy's address on Binance Chain
  const senderOtherChain = Env.KavaDeputy.Testnet5000; // deputy's address on Kava
  const recipientOtherChain = Env.KavaAccount.Testnet5000.Address; // user's address on Kava

  // Format asset/amount parameters as tokens, expectedIncome
  const tokens = [
    {
      denom: asset,
      amount: amount
    }
  ];
  const expectedIncome = [String(amount), ":", asset].join("");

  // Number of blocks that swap will be active
  const heightSpan = 10005;

  // Generate random number hash from timestamp and hex-encoded random number
  const randomNumber = kavaUtils.generateRandomNumber();
  const timestamp = Math.floor(Date.now() / 1000);
  const randomNumberHash = kavaUtils.calculateRandomNumberHash(
    randomNumber,
    timestamp
  );
  console.log("Secret random number:", randomNumber);

  printSwapIDs(randomNumberHash, sender, senderOtherChain)

  // Send create swap tx using Binance Chain client
  const res = await bnbClient.swap.HTLT(
    sender,
    recipient,
    recipientOtherChain,
    senderOtherChain,
    randomNumberHash,
    timestamp,
    tokens,
    expectedIncome,
    heightSpan,
    true
  );

  if (res && res.status == 200) {
    console.log(
      "\nCreate swap tx hash (Binance Chain): ",
      res.result[0].hash
    );
  } else {
    console.log("Tx error:", res);
    return;
  }

  // Wait for deputy to see the new swap on Binance Chain and relay it to Kava
  console.log("Waiting for deputy to witness and relay the swap...")
  await sleep(30000); // 30 seconds

  // -------------------------------------------------------------------------------
  //                           Kava blockchain interaction
  // -------------------------------------------------------------------------------
   // Calculate the expected swap ID on Kava
   const expectedKavaSwapID = kavaUtils.calculateSwapID(
    randomNumberHash,
    senderOtherChain,
    sender
  );

  // Send claim swap tx using Kava client
  const txHashClaim = await kavaClient.claimSwap(
    expectedKavaSwapID,
    randomNumber
  );
  console.log("Claim swap tx hash (Kava): ".concat(txHashClaim));
}

// Print swap IDs
var printSwapIDs = (randomNumberHash, sender, senderOtherChain) => {
  // Calculate the expected swap ID on origin chain
  const originChainSwapID = kavaUtils.calculateSwapID(
    randomNumberHash,
    sender,
    senderOtherChain
  );

  // Calculate the expected swap ID on destination chain
  const destChainSwapID = kavaUtils.calculateSwapID(
    randomNumberHash,
    senderOtherChain,
    sender
  );

  console.log("Expected Kava swap ID:", originChainSwapID);
  console.log("Expected Bnbchain swap ID:", destChainSwapID);
};

// Sleep is a wait function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main();