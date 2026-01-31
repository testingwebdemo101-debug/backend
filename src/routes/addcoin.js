const express = require("express");
const router = express.Router();

const {
  updateWalletBalance,
  getUserWalletBalances,
  testAdminEmail
} = require("../controllers/addCoinController");

router.post("/addcoin", updateWalletBalance);
router.get("/addcoin/:email", getUserWalletBalances);
router.post("/addcoin/test-email", testAdminEmail);
// Optional: Separate test endpoints
router.post("/addcoin/test-credit-email", (req, res) => {
  req.body.actionType = "credited";
  return testAdminEmail(req, res);
});
router.post("/addcoin/test-debit-email", (req, res) => {
  req.body.actionType = "debited";
  return testAdminEmail(req, res);
});

module.exports = router;