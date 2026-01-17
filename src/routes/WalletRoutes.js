const express = require("express");
const router = express.Router();
const DepositWallet = require("../models/DepositWallet");

/**
 * SAVE / UPDATE WALLET
 * POST /api/deposit-wallet
 */
router.post("/deposit-wallet", async (req, res) => {
  try {
    const { currency, address } = req.body;

    if (!currency || !address) {
      return res.status(400).json({
        success: false,
        message: "Currency and address are required"
      });
    }

    const wallet = await DepositWallet.findOneAndUpdate(
      { currency },
      { address },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: "Wallet saved successfully",
      wallet
    });
  } catch (error) {
    console.error("Save wallet error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/**
 * GET SINGLE WALLET
 * GET /api/deposit-wallet/:currency
 */
router.get("/deposit-wallet/:currency", async (req, res) => {
  try {
    const wallet = await DepositWallet.findOne({
      currency: req.params.currency
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found"
      });
    }

    res.json({
      success: true,
      wallet
    });
  } catch (error) {
    console.error("Get wallet error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/**
 * GET ALL WALLETS
 * GET /api/deposit-wallets
 */
router.get("/deposit-wallets", async (req, res) => {
  try {
    const wallets = await DepositWallet.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      wallets
    });
  } catch (error) {
    console.error("Get wallets error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;
