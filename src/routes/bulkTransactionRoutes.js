const express = require("express");
const router = express.Router();

const {
  bulkCreditDebit,
  getBulkGroups,
  getUsersByGroup,
} = require("../controllers/bulkTransactionController");

/* ORIGINAL ROUTES (UNCHANGED) */
router.get("/bulk-groups", getBulkGroups);
router.post("/bulk-transaction", bulkCreditDebit);

/* ✅ NEW ROUTE: 100 INDIVIDUAL USERS PER GROUP */
router.get("/bulk-group/:group/users", getUsersByGroup);

module.exports = router;