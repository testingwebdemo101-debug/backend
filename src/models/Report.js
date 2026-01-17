const mongoose = require("mongoose");

const ReportSchema = new mongoose.Schema(
  {
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    reportedEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    attachment: {
      type: String, // optional (image/file name only)
      default: null
    },
    status: {
      type: String,
      enum: ["OPEN", "RESOLVED"],
      default: "OPEN"
    },
    actionTaken: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", ReportSchema);
