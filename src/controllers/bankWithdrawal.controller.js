const Transfer = require("../models/Transfer");
const User = require("../models/User");
const DebitCardApplication = require("../models/DebitCardApplication");
const crypto = require("crypto");
const sendTransactionMail = require("../utils/sendZeptoTemplateMail");

/**
 * =========================================
 * CREATE BANK WITHDRAWAL (OTP STEP)
 * =========================================
 */
exports.createBankWithdrawal = async (req, res) => {
  try {
    const {
      asset,
      usdAmount,
      coinAmount,
      bankName,
      accountNumber,
      swiftCode,
      fullName
    } = req.body;

    const user = await User.findById(req.user._id);

    // =====================
    // BASIC VALIDATIONS
    // =====================
    if (!asset || !coinAmount || coinAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid withdrawal details"
      });
    }

    if (!user.walletBalances[asset] || user.walletBalances[asset] < coinAmount) {
      return res.status(400).json({
        success: false,
        error: `Insufficient ${asset.toUpperCase()} balance`
      });
    }

    // =====================
    // GENERATE OTP
    // =====================
   const otp = crypto.randomInt(100000, 999999).toString();

user.transferOTP = crypto
  .createHash("sha256")
  .update(otp)
  .digest("hex");

user.transferOTPExpires = Date.now() + 10 * 60 * 1000;

    user.pendingTransferData = {
      type: "BANK_WITHDRAWAL",
      asset,
      amount: coinAmount,
      bank: {
        fullName,
        bankName,
        accountNumber,
        swiftCode
      }
    };

    await user.save();

    // =====================
    // SEND OTP EMAIL (ONLY OTP)
    // =====================
    await sendTransactionMail({
      to: user.email,
      template: process.env.TPL_BANK_WITHDRAWAL_OTP,
      variables: {
        userName: user.fullName,
        otp,
        asset: asset.toUpperCase(),
        amount: coinAmount,
        bankName,
        accountNumber,
        swiftCode,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        year: new Date().getFullYear()
      }
    });

    // =====================
    // CREATE TRANSFER (OTP PENDING)
    // =====================
    const transfer = await Transfer.create({
      fromUser: user._id,
      toUser: null,
      fromAddress: user.walletAddresses[asset],
      toAddress: "BANK_WITHDRAWAL",
      asset,
      amount: coinAmount,
      value: usdAmount,
      notes: JSON.stringify({
        type: "BANK_WITHDRAWAL",
        fullName,
        bankName,
        accountNumber,
        swiftCode
      }),
      status: "pending_otp"
    });

    // =====================
    // RESPONSE
    // =====================
    res.status(200).json({
      success: true,
      data: {
        transferId: transfer._id,
        otpSent: true
      },
      message: "OTP sent to your email to confirm bank withdrawal"
    });

  } catch (err) {
    console.error("Bank withdrawal error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

/**
 * =========================================
 * VERIFY BANK WITHDRAWAL OTP
 * =========================================
 */
exports.verifyBankWithdrawalOTP = async (req, res) => {
  try {
    const { otp, transferId } = req.body;
    const user = await User.findById(req.user._id);

    // =====================
    // OTP VALIDATION
    // =====================
    if (!user.transferOTP || !user.transferOTPExpires) {
      return res.status(400).json({
        success: false,
        error: "No OTP request found"
      });
    }

    if (user.transferOTPExpires < Date.now()) {
      return res.status(400).json({
        success: false,
        error: "OTP expired"
      });
    }

   const hashedOtp = crypto
  .createHash("sha256")
  .update(otp)
  .digest("hex");

if (user.transferOTP !== hashedOtp) {
  return res.status(400).json({
    success: false,
    error: "Invalid OTP"
  });
}


    // =====================
    // FETCH TRANSFER
    // =====================
    const transfer = await Transfer.findOne({
      _id: transferId,
      fromUser: user._id,
      status: "pending_otp"
    });

    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: "Transfer not found"
      });
    }

    // =====================
    // FETCH CARD STATUS
    // =====================
    const card = await DebitCardApplication.findOne({
      email: user.email
    });

    const cardStatus = (card?.status || "INACTIVE").toUpperCase();

    // =====================
    // SELECT STATUS TEMPLATE
    // =====================
  const templateKey =
  ["ACTIVE", "ACTIVATE", "PENDING"].includes(cardStatus)
    ? process.env.TPL_BANK_WITHDRAWAL_PENDING
    : process.env.TPL_BANK_WITHDRAWAL_FAILED;


    // =====================
    // UPDATE STATES
    // =====================
 const isCardAllowed = ["ACTIVE", "ACTIVATE", "PENDING"].includes(cardStatus);

if (isCardAllowed) {
  user.walletBalances[transfer.asset] -= transfer.amount;
  transfer.status = "processing";
} else {
  transfer.status = "failed";
}


    // Clear OTP
    user.transferOTP = null;
    user.transferOTPExpires = null;
    user.pendingTransferData = null;

    await user.save();
    await transfer.save();

    // =====================
    // SEND STATUS EMAIL
    // =====================
    const bankInfo = JSON.parse(transfer.notes);

    await sendTransactionMail({
      to: user.email,
      template: templateKey,
      variables: {
        userName: user.fullName,
        asset: transfer.asset.toUpperCase(),
        amount: transfer.amount,
        usdAmount: transfer.value,
        bankName: bankInfo.bankName,
        accountNumber: bankInfo.accountNumber,
        swiftCode: bankInfo.swiftCode,
        transactionId: transfer._id,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        year: new Date().getFullYear()
      }
    });

    // =====================
    // RESPONSE
    // =====================
  // =====================
// RESPONSE (FIXED)
// =====================
res.status(200).json({
  success: true,
  data: {
    transferId: transfer._id,
    asset: transfer.asset,
    amount: transfer.amount,
    usdAmount: transfer.value,
    bankName: bankInfo.bankName,
    accountNumber: bankInfo.accountNumber,
    swiftCode: bankInfo.swiftCode,
    fullName: bankInfo.fullName,
    cardStatus,
    transferStatus: transfer.status,
    confirmations: transfer.confirmations // ✅ ADD THIS
  },
  message:
    transfer.status === "processing"
      ? "OTP verified. Bank withdrawal processing."
      : "OTP verified. Bank withdrawal failed."
});

  } catch (err) {
    console.error("OTP verify error:", err);
    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
};
