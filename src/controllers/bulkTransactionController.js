const User = require("../models/User");
const coinMap = require("../utils/coinMap");

const BATCH_SIZE = 100;

exports.bulkCreditDebit = async (req, res) => {
  try {
    const { type, coin, amount } = req.body;

    // Basic validation
    if (!type || !coin || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: "type, coin and amount are required",
      });
    }

    if (!["CREDIT", "DEBIT"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid type",
      });
    }

    if (!coinMap[coin]) {
      return res.status(400).json({
        success: false,
        error: "Invalid coin",
      });
    }

    const dbCoin = coinMap[coin];
    const numericAmount = Number(amount);

    if (numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Amount must be greater than 0",
      });
    }

    // Fetch all users
    const users = await User.find().select("_id walletBalances");

    if (!users.length) {
      return res.status(404).json({
        success: false,
        error: "No users found",
      });
    }

    let success = 0;
    let failed = 0;

    // Process in batches of 100
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (user) => {
          try {
            const current = user.walletBalances[dbCoin] || 0;

            if (type === "DEBIT" && current < numericAmount) {
              throw new Error("Insufficient balance");
            }

            user.walletBalances[dbCoin] =
              type === "CREDIT"
                ? current + numericAmount
                : current - numericAmount;

            await user.save();
            success++;
          } catch {
            failed++;
          }
        })
      );
    }

    return res.status(200).json({
      success: true,
      message: "Bulk transaction completed",
      totalUsers: users.length,
      success,
      failed,
      batches: Math.ceil(users.length / BATCH_SIZE),
    });
  } catch (err) {
    console.error("Bulk transaction error:", err);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};