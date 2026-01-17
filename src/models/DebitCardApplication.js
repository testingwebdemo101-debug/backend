const mongoose = require("mongoose");

const DebitCardApplicationSchema = new mongoose.Schema(
  {
    cardType: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },

    // Card details (added)
    cardNumber: String,
    expiry: String,
    cvv: String,

    whatsapp: String,
    address: String,
    zipcode: String,
    country: String,

    status: {
      type: String,
      enum: ["PENDING", "ACTIVATE", "INACTIVE"],
      default: "INACTIVE",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "DebitCardApplication",
  DebitCardApplicationSchema
);