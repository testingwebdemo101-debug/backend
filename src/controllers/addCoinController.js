const User = require("../models/User");
const Transfer = require("../models/Transfer");
const sendTransactionMail = require("../utils/sendZeptoTemplateMail");
const { generateRandomAddress } = require("../utils/cryptoAddress");
const cryptoDataService = require("../services/cryptoDataService");

exports.updateWalletBalance = async (req, res) => {
  try {
    const { email, asset, amount } = req.body;

    console.log("🔧 updateWalletBalance called with:", {
      email,
      asset,
      amount: Number(amount),
      timestamp: new Date().toISOString()
    });

    if (!email || !asset || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: "Email, asset and amount are required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      console.log("❌ User not found:", email);
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    console.log("👤 User found:", {
      email: user.email,
      name: user.name,
      username: user.username,
      currentBalance: user.walletBalances?.[asset],
      newBalance: Number(amount)
    });

    if (!user.walletBalances.hasOwnProperty(asset)) {
      console.log("❌ Invalid asset:", asset);
      return res.status(400).json({
        success: false,
        error: "Invalid asset",
      });
    }

    // Calculate the difference (credit/debit amount)
    const oldBalance = user.walletBalances[asset] || 0;
    const newBalance = Number(amount);
    const difference = newBalance - oldBalance;
    
    // Determine if it's credit or debit
    const actionType = difference >= 0 ? "credited" : "debited";
    const actionAmount = Math.abs(difference);

    console.log("📊 Transaction details:", {
      oldBalance,
      newBalance,
      difference,
      actionType,
      actionAmount
    });

    // Update the balance
    user.walletBalances[asset] = newBalance;
    await user.save();

    console.log("✅ Balance updated in database");

    // ✅ CREATE TRANSFER RECORD FOR USER HISTORY
    if (actionAmount > 0) {
      try {
        // Get current crypto prices
        const prices = await cryptoDataService.getAllCoinPrices();
        const currentPrice = prices?.[asset]?.currentPrice || 0;
        const usdValue = actionAmount * currentPrice;

        const randomAddress = generateRandomAddress(asset.toUpperCase());
        const userWalletAddress = user.walletAddresses?.[asset] || randomAddress;

        await Transfer.create({
          fromUser: user._id,
          toUser: user._id,
          fromAddress: actionType === "credited" ? "Admin Wallet" : userWalletAddress,
          toAddress: actionType === "credited" ? userWalletAddress : randomAddress,
          asset: asset,
          amount: actionAmount,
          value: usdValue,
          currentPrice: currentPrice,
          status: "completed",
          notes: `Admin ${actionType} balance`,
          createdAt: new Date(),
          completedAt: new Date(),
        });

        console.log("✅ Transfer record created");
      } catch (transferError) {
        console.error("❌ Failed to create transfer record:", transferError);
      }
    }

    // Send email notification to user (async - don't wait for response)
    if (actionAmount > 0) {
      console.log("📧 Preparing to send email...");
      sendBalanceUpdateEmail(user, asset, actionType, actionAmount, newBalance);
    } else {
      console.log("⚠️ No amount change, skipping email");
    }

    res.status(200).json({
      success: true,
      message: "Wallet balance updated",
      walletBalances: user.walletBalances,
    });

  } catch (error) {
    console.error("❌ Add coin error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

// Helper function to send balance update email
const sendBalanceUpdateEmail = async (user, asset, actionType, amount, newBalance) => {
  try {
    console.log("🚀 sendBalanceUpdateEmail called with:", {
      userEmail: user.email,
      asset,
      actionType,
      amount,
      newBalance
    });

    // Map asset keys to display names
    const cryptoDisplayNames = {
      btc: "Bitcoin (BTC)",
      eth: "Ethereum (ETH)",
      usdtTron: "USDT (TRON)",
      usdtBnb: "USDT (BNB)",
      bnb: "Binance Coin (BNB)",
      trx: "TRON (TRX)",
      sol: "Solana (SOL)",
      xrp: "Ripple (XRP)",
      doge: "Dogecoin (DOGE)",
      ltc: "Litecoin (LTC)"
    };

    // Choose template based on action type
    let templateKey;
    if (actionType === "credited") {
      templateKey = process.env.TPL_ADMIN_BALANCE_UPDATE;
    } else if (actionType === "debited") {
      templateKey = process.env.TPL_ADMIN_BALANCE_DEBIT;
    }
    
    console.log("📋 Email configuration:", {
      actionType,
      templateKey: templateKey ? `${templateKey.substring(0, 20)}...` : 'MISSING',
      hasZeptoAPIKey: !!process.env.ZEPTOMAIL_API_KEY,
      hasZeptoFrom: !!process.env.ZEPTOMAIL_FROM
    });

    if (!templateKey) {
      console.error(`❌ Template key for ${actionType} is not set in environment variables`);
      console.log("Current env variables starting with TPL_:");
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('TPL_')) {
          console.log(`  ${key}=${process.env[key]?.substring(0, 30)}...`);
        }
      });
      return null;
    }

    const emailVariables = {
      userName: user.name || user.username || user.email.split('@')[0] || "Valued Customer",
      action: actionType,
      cryptoName: cryptoDisplayNames[asset] || asset.toUpperCase(),
      amount: amount.toFixed(8),
      newBalance: newBalance.toFixed(8),
      date: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      adminEmail: "admin@instacoinxpay.com",
      transactionId: `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`,
      transactionType: actionType === "credited" ? "Deposit" : "Withdrawal",
      symbol: actionType === "credited" ? "+" : "-"
    };

    console.log("📨 Sending email with sendTransactionMail:", {
      to: user.email,
      actionType,
      template: templateKey,
      variablesCount: Object.keys(emailVariables).length
    });

    const result = await sendTransactionMail({
      to: user.email,
      template: templateKey,
      variables: emailVariables
    });
    
    if (result) {
      console.log(`✅ ${actionType} balance update email sent successfully to ${user.email}`);
      console.log("📩 Email result:", {
        messageId: result.data?.[0]?.message_id || 'Unknown',
        status: 'Sent',
        actionType
      });
    } else {
      console.warn(`⚠️ Failed to send ${actionType} balance update email to ${user.email}`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error in sendBalanceUpdateEmail for ${user.email}:`, error);
    console.error("Error details:", error.message);
    return null;
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

// Test endpoint
exports.testAdminEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log("🧪 Testing admin balance update email...");
    
    const result = await sendTransactionMail({
      to: email || "shantanupatil.it2003@gmail.com",
      template: process.env.TPL_ADMIN_BALANCE_UPDATE,
      variables: {
        userName: "Test User",
        action: "credited",
        cryptoName: "TRON (TRX)",
        amount: "10.00000000",
        newBalance: "10.00000000",
        date: new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        adminEmail: "admin@instacoinxpay.com",
        transactionId: `TXN${Date.now()}`
      }
    });
    
    res.json({
      success: !!result,
      message: result ? "Test email sent successfully" : "Failed to send email",
      result
    });
    
  } catch (error) {
    console.error("Test email error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};