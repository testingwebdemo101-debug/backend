const generateRandomAddress = require("./generateRandomAddress");

module.exports = () => ({
  btc: `bc1q${generateRandomAddress(34)}`,
  bnb: `0x${generateRandomAddress(40)}`,
  usdtTron: `T${generateRandomAddress(33)}`,
  trx: `https://yourdomain.com/wallet/${generateRandomAddress(20)}`,
  usdtBnb: `0x${generateRandomAddress(40)}`,
  eth: `0x${generateRandomAddress(40)}`,
  sol: generateRandomAddress(44),
  xrp: `r${generateRandomAddress(33)}`,
  doge: `D${generateRandomAddress(33)}`,
  ltc: `L${generateRandomAddress(33)}`
});