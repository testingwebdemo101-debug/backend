const mongoose = require("mongoose");

const referralRewardSchema = new mongoose.Schema({
  referrerEmail: {
    type: String,
    required: true,
    index: true
  },
  referredEmail: {
    type: String,
    required: true,
    unique: true // ❗ prevents double rewards
  },
  amount: {
    type: Number,
    default: 25
  },
  currency: {
    type: String,
    default: "usdtBnb"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("ReferralReward", referralRewardSchema);
