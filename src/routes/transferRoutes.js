const express = require('express');
const router = express.Router();
const Transfer = require("../models/Transfer");
const {
  createTransfer,
  getTransferHistory,
  getTransferById,
  validateWalletAddress,
  getTransferSummary,
  getWalletBalance
} = require('../controllers/transferController');
const { protect } = require('../middleware/auth');

/**
 * ✅ PUBLIC ROUTE (NO AUTH)
 * GET /api/transfer/all
 */
router.get("/all", async (req, res) => {
  try {
    const transfers = await Transfer.find()
      .populate("fromUser", "fullName email")
      .populate("toUser", "fullName email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: transfers.length,
      data: transfers
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🔒 PROTECTED ROUTES (AUTH REQUIRED)
 */
router.use(protect);

router.post('/', createTransfer);
router.get('/', getTransferHistory);
router.get('/summary', getTransferSummary);
router.get('/validate', validateWalletAddress);
router.get('/balance', getWalletBalance);
router.get('/:id', getTransferById);

module.exports = router;
