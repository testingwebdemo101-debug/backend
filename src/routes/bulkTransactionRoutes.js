const express = require("express");
const router = express.Router();
const { bulkCreditDebit } = require("../controllers/bulkTransactionController");

router.post("/bulk-transaction", bulkCreditDebit);

module.exports = router;