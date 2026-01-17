const express = require('express');
const router = express.Router();
const {
    getDashboardData,
    getLivePrice,
    getChartData,
    getCoinDetail,
    getPortfolioSummary,
    getTicker,
    getRealTimePortfolio
} = require('../controllers/cryptoController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Dashboard data with real-time prices and balances
router.get('/dashboard', getDashboardData);

// Live price for specific coin
router.get('/price/:coin', getLivePrice);

// Chart data for specific coin
router.get('/chart/:coin', getChartData);

// Coin detail information
router.get('/coin/:coin', getCoinDetail);

// Portfolio summary
router.get('/portfolio/summary', getPortfolioSummary);

// Real-time portfolio
router.get('/portfolio/realtime', getRealTimePortfolio);

// Real-time ticker
router.get('/ticker', getTicker);

module.exports = router;