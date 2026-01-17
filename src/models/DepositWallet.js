const mongoose = require("mongoose");

const depositWalletSchema = new mongoose.Schema(
  {
    currency: {
      type: String,
      required: true,
      unique: true
    },
    address: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("DepositWallet", depositWalletSchema);
