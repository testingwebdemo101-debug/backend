const Transfer = require("../models/Transfer");
const User = require("../models/User");
const sendTransactionMail = require("../utils/zeptomail.service");


/**
 * =====================
 * GET PENDING TRANSACTIONS
 * =====================
 */
exports.getPendingTransactions = async (req, res) => {
  try {
    const transfers = await Transfer.find({
      status: { $in: ["pending", "processing", "pending_otp"] }
    })
      .populate("fromUser", "fullName email")
      .sort({ createdAt: -1 });

    const data = transfers.map((tx) => {
      let parsedNotes = {};
      try {
        parsedNotes = JSON.parse(tx.notes || "{}");
      } catch {}

      let method = "Crypto";
      if (parsedNotes.type === "BANK_WITHDRAWAL")
        method = "Bank Transfer";
      else if (parsedNotes.type === "PAYPAL_WITHDRAWAL")
        method = "Paypal";

      return {
        id: tx._id,
        name: tx.fromUser?.fullName || "—",
        email: tx.fromUser?.email || "—",
        amount: tx.amount,
        asset: tx.asset,
        method,
        txid: tx.transactionId || tx._id,
        // ✅ ADD THIS LINE - Include the recipient's crypto address
        toAddress: tx.toAddress || "—",
        confirmations:
          tx.confirmations?.length
            ? tx.confirmations
            : [false, false, false, false],
        date: tx.createdAt.toISOString().split("T")[0],
        time: tx.createdAt.toTimeString().slice(0, 5),
      };
    });

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending transactions",
    });
  }
};

/**
 * =====================
 * UPDATE TRANSACTION STATUS
 * =====================
 */
exports.updateTransactionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, confirmations } = req.body;

    if (!["pending", "approved", "rejected"].includes(status))
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });

    const tx = await Transfer.findById(id).populate("fromUser");

    if (!tx)
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });

    if (["completed", "failed"].includes(tx.status))
      return res.status(400).json({
        success: false,
        message: "Already finalized"
      });

    const user = tx.fromUser;

    /**
     * CONFIRMATION COUNT
     */
    const confirmationCount = confirmations?.filter(Boolean).length || 0;

    /**
     * METHOD & NOTES PARSING
     */
    let parsedNotes = {};
    try {
      parsedNotes = JSON.parse(tx.notes || "{}");
    } catch {}

    let method = "Crypto";
    if (parsedNotes.type === "BANK_WITHDRAWAL")
      method = "Bank Transfer";
    else if (parsedNotes.type === "PAYPAL_WITHDRAWAL")
      method = "Paypal";

    /**
     * COMMON VARIABLES
     */
    const commonVariables = {
      userName: user.fullName,
      amount: tx.amount,
      asset: tx.asset,
      wallet: tx.toAddress || "External Wallet",
      txid: tx.transactionId || tx._id,
      method,
      confirmations: confirmationCount,
      date: tx.createdAt.toISOString().split("T")[0],
      time: tx.createdAt.toTimeString().slice(0, 5),
      dashboardLink: "https://instacoinxpay.com/dashboard"
    };

    /**
     * =====================
     * PENDING
     * =====================
     */
    if (status === "pending") {
      tx.confirmations = confirmations;
      tx.status = "processing";
      await tx.save();

      await sendTransactionMail({
        to: user.email,
        templateKey: process.env.TPL_ADMIN_TX_PENDING,
        mergeInfo: {
          ...commonVariables,
          status: "Pending"
        }
      });

      return res.json({
        success: true,
        message: "Pending Mail Sent"
      });
    }

    /**
     * =====================
     * SUCCESS (APPROVED)
     * =====================
     */
    if (status === "approved") {
      tx.status = "completed";
      tx.completedAt = new Date();
      await tx.save();

      await sendTransactionMail({
        to: user.email,
        templateKey: process.env.TPL_ADMIN_TX_SUCCESS,
        mergeInfo: {
          ...commonVariables,
          status: "Completed"
        }
      });
    }

    /**
     * =====================
     * REJECT
     * =====================
     */
    if (status === "rejected") {
      const refundUser = await User.findById(user._id);

      if (refundUser) {
        // Check if this is a PayPal withdrawal to refund the amount
        if (parsedNotes.type === "PAYPAL_WITHDRAWAL") {
          // Refund the amount back to user's balance
          refundUser.walletBalances[tx.asset] = 
            (refundUser.walletBalances[tx.asset] || 0) + Number(tx.amount);
          await refundUser.save();

          await sendTransactionMail({
            to: refundUser.email,
            templateKey: process.env.TPL_ADMIN_TX_REJECT,
            mergeInfo: {
              ...commonVariables,
              status: "Rejected",
              refundAmount: tx.amount,
              refundAsset: tx.asset
            }
          });
        } else {
          // For other types (like bank withdrawal), maintain existing logic
          refundUser.walletBalances[tx.asset] += Number(tx.amount);
          await refundUser.save();

          await sendTransactionMail({
            to: refundUser.email,
            templateKey: process.env.TPL_ADMIN_TX_REJECT,
            mergeInfo: {
              ...commonVariables,
              status: "Rejected"
            }
          });
        }
      }

      tx.status = "failed";
      await tx.save();
    }

    res.json({
      success: true,
      message: `Transaction ${status} successful`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};