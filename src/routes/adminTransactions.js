const express = require("express");
const router = express.Router();

const {
  getPendingTransactions,
  updateTransactionStatus
} = require("../controllers/adminTransactions.controller");

router.get("/pending-transactions", getPendingTransactions);

// 🔥 NEW
router.put("/transaction/:id/status", updateTransactionStatus);

module.exports = router;
