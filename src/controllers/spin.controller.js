const User = require("../models/User");
const Transfer = require("../models/Transfer");
const cryptoDataService = require("../services/cryptoDataService"); // ✅ Use your existing service

const COOLDOWN_HOURS = 84;
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

/* =====================================
   CHECK SPIN AVAILABILITY
====================================== */
exports.checkSpinAvailability = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const now = Date.now();
    let canSpin = true;
    let timeRemaining = null;

    if (user.lastSpinTime) {
      const lastSpinTime = new Date(user.lastSpinTime).getTime();
      const timeSinceLastSpin = now - lastSpinTime;

      if (timeSinceLastSpin < COOLDOWN_MS) {
        canSpin = false;
        timeRemaining = COOLDOWN_MS - timeSinceLastSpin;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        canSpin,
        timeRemaining,
        lastSpinTime: user.lastSpinTime,
      },
    });
  } catch (error) {
    console.error("CHECK SPIN AVAILABILITY ERROR 🔴", error);
    res.status(500).json({
      success: false,
      error: "Failed to check spin availability",
    });
  }
};

/* =====================================
   CREDIT SPIN REWARD (ADD BTC BALANCE)
====================================== */
exports.creditSpinReward = async (req, res) => {
  console.log("🆕 NEW spin.controller.js is running — amount:", req.body.amount); // ✅ DEBUG LOG
  try {
    const { userId, amount, prizeLabel } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // ✅ Server-side cooldown check (only for winning spins)
    if (amount > 0) {
      const now = Date.now();
      if (user.lastSpinTime) {
        const lastSpinTime = new Date(user.lastSpinTime).getTime();
        const timeSinceLastSpin = now - lastSpinTime;

        if (timeSinceLastSpin < COOLDOWN_MS) {
          const remainingHours = Math.ceil(
            (COOLDOWN_MS - timeSinceLastSpin) / (60 * 60 * 1000)
          );
          return res.status(400).json({
            success: false,
            error: `Please wait ${remainingHours} hours before spinning again`,
          });
        }
      }
    }

    // Update last spin time for both win and lose
    user.lastSpinTime = new Date();

    if (amount > 0) {
      // ✅ Get live BTC price from your existing CryptoDataService
      // This uses the SAME price source your wallet uses to display balances — no mismatch
      const btcPriceData = await cryptoDataService.getCoinPrice("btc");
      const liveBtcPrice = btcPriceData?.price;

      if (!liveBtcPrice || liveBtcPrice <= 0) {
        return res.status(500).json({
          success: false,
          error: "Could not fetch live BTC price. Please try again in a moment.",
        });
      }

      console.log(`💰 Live BTC price from CryptoDataService: $${liveBtcPrice}`);

      // ✅ Convert USD prize → BTC using the SAME live price your wallet displays
      const btcAmount = Number(amount) / liveBtcPrice;

      console.log(
        `🎰 Crediting: $${amount} USD = ${btcAmount} BTC @ $${liveBtcPrice}/BTC`
      );

      // Initialize btc balance if not exists
      if (!user.walletBalances.btc) {
        user.walletBalances.btc = 0;
      }

      // Add BTC reward
      user.walletBalances.btc += btcAmount;

      await user.save();

      // ✅ Create Transfer record with the live price used
      const transactionId =
        "SPIN_" +
        Date.now() +
        "_" +
        Math.random().toString(36).substring(2, 10);

      const transfer = new Transfer({
        transactionId: transactionId,
        fromUser: userId,
        toUser: userId,
        fromAddress: "Spin Wheel Reward",
        toAddress: user.walletAddresses?.btc || "User Wallet",
        amount: btcAmount,
        asset: "btc",
        value: Number(amount),
        type: "Receive",
        status: "completed",
        completedAt: new Date(),
        notes: JSON.stringify({
          type: "SPIN_REWARD",
          prizeLabel: prizeLabel || `$${amount}`,
          usdAmount: amount,
          btcPriceAtReward: liveBtcPrice, // ✅ Stored for accurate history display
          isSpinReward: true,
        }),
        networkFee: 0,
        fee: 0,
        currentPrice: liveBtcPrice, // ✅ Same price used for conversion
      });

      await transfer.save();

      res.status(200).json({
        success: true,
        message: "Spin reward credited successfully",
        data: {
          usdWon: amount,
          btcCredited: btcAmount,
          btcPriceUsed: liveBtcPrice,
          totalBtcBalance: user.walletBalances.btc,
          transactionId: transactionId,
          transfer: transfer,
          lastSpinTime: user.lastSpinTime,
        },
      });
    } else {
      // For lose spins, just update the last spin time
      await user.save();

      res.status(200).json({
        success: true,
        message: "Spin completed",
        data: {
          lastSpinTime: user.lastSpinTime,
        },
      });
    }
  } catch (error) {
    console.error("SPIN REWARD ERROR 🔴", error);
    res.status(500).json({
      success: false,
      error: "Failed to credit spin reward",
    });
  }
};