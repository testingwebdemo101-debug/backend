const express = require('express');
const router = express.Router();
const {
    getTransactionHistory,
    getTransactionById,
    getGroupedTransactions,
    getTransactionStats,
    getAssetTransactionHistory,
    getRecentTransactions
} = require('../controllers/historyController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Get user's transaction history
router.get('/', getTransactionHistory);

// Get transaction by ID
router.get('/:id', getTransactionById);

// Get grouped transactions by date (for AllTransactions component)
router.get('/grouped/all', getGroupedTransactions);

// Get transaction statistics
router.get('/stats/summary', getTransactionStats);

// Get asset-specific transaction history
router.get('/asset/:asset', getAssetTransactionHistory);

// Get recent transactions for dashboard
router.get('/recent/list', getRecentTransactions);

module.exports = router;