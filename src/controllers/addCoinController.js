const User = require("../models/User");

exports.updateWalletBalance = async (req, res) => {
  try {
    const { email, asset, amount } = req.body;

    if (!email || !asset || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: "Email, asset and amount are required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (!user.walletBalances.hasOwnProperty(asset)) {
      return res.status(400).json({
        success: false,
        error: "Invalid asset",
      });
    }

    user.walletBalances[asset] = Number(amount);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Wallet balance updated",
      walletBalances: user.walletBalances,
    });
  } catch (error) {
    console.error("Add coin error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};
exports.getUserWalletBalances = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    const user = await User.findOne({ email }).select("walletBalances");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      walletBalances: user.walletBalances,
    });
  } catch (error) {
    console.error("Fetch wallet error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};