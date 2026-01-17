const express = require("express");
const router = express.Router();
const { bulkUpdateWallet } = require("../controllers/bulkController");

// 🔥 NO AUTH – PUBLIC ROUTE
router.post("/bulk-wallet-update", bulkUpdateWallet);

module.exports = router;
