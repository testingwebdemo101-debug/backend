const express = require("express");
const router = express.Router();

const {
  updateWalletBalance,
  getUserWalletBalances,
} = require("../controllers/addCoinController");

router.post("/addcoin", updateWalletBalance);
router.get("/addcoin/:email", getUserWalletBalances);

module.exports = router;