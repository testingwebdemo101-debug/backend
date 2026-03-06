const express = require("express");
const { 
  creditSpinReward,
  checkSpinAvailability 
} = require("../controllers/spin.controller");

const router = express.Router();

router.post("/credit-spin-reward", creditSpinReward);
router.get("/check-availability/:userId", checkSpinAvailability);

module.exports = router;