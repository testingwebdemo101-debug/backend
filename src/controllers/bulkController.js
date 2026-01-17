const User = require("../models/User");

/**
 * BULK CREDIT / DEBIT FOR ALL USERS
 * body: { asset: "btc", amount: 10 }
 */
exports.bulkUpdateWallet = async (req, res) => {
  try {
    const { asset, amount } = req.body;

    if (!asset || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: "Asset and amount are required",
      });
    }

    const numericAmount = Number(amount);

    if (isNaN(numericAmount)) {
      return res.status(400).json({
        success: false,
        error: "Invalid amount",
      });
    }

    // Ensure asset exists in schema
    const sampleUser = await User.findOne();
    if (!sampleUser || !sampleUser.walletBalances.hasOwnProperty(asset)) {
      return res.status(400).json({
        success: false,
        error: "Invalid asset",
      });
    }

    // Update ALL users
    const result = await User.updateMany(
      {},
      { $inc: { [`walletBalances.${asset}`]: numericAmount } }
    );

    res.status(200).json({
      success: true,
      message: "Bulk wallet update successful",
      asset,
      amount: numericAmount,
      usersAffected: result.modifiedCount,
    });
  } catch (error) {
    console.error("Bulk update error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};
