const crypto = require("crypto");

/**
 * Generate random crypto address for demo purposes
 * @param {string} coin - Coin type like BTC, BNB
 */
function generateRandomAddress(coin) {
  // Just a random 34-character hex string prefixed by coin symbol
  const randomHex = crypto.randomBytes(17).toString("hex"); // 34 chars
  return `${coin}-${randomHex.toUpperCase()}`;
}

module.exports = { generateRandomAddress };