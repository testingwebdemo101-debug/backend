const express = require("express");
const router = express.Router();
const { bulkCreditDebit } = require("../controllers/bulkTransactionController");
const sendZeptoTemplateMail = require("../utils/sendZeptoTemplateMail");

/**
 * @route   POST /api/bulk-transaction
 * @desc    Existing bulk credit/debit logic
 */
router.post("/bulk-transaction", bulkCreditDebit);

/**
 * @route   POST /api/test-email
 * @desc    Test ZeptoMail integration
 */
router.post("/test-email", async (req, res) => {
  try {
    const { email } = req.body;
    
    // 1. Validation: Check if .env variable exists
    const templateId = process.env.TPL_SEND_RECIEVE_CRYPTO;
    if (!templateId) {
      console.error("❌ ERROR: TPL_SEND_RECIEVE_CRYPTO is missing in .env");
      return res.status(500).json({ 
        success: false, 
        error: "Server Config Error: TPL_SEND_RECIEVE_CRYPTO is not defined in .env" 
      });
    }

    console.log("🧪 Testing email to:", email || "tejasnikam452@gmail.com");

    // 2. Execution: Call the utility
    // Ensure sendZeptoTemplateMail is exported correctly in its file
    const result = await sendZeptoTemplateMail({
      to: email || "tejasnikam452@gmail.com",
      template: templateId,
      variables: {
        coin: "BTC",
        amount: "0.001",
        type: "CREDIT",
        platform: "InstaCoinXPay",
      },
    });

    return res.json({
      success: true,
      message: "Request processed",
      zeptoResponse: result
    });

  } catch (error) {
    // This catch block prevents the server from stopping if the email fails
    console.error("❌ ROUTE ERROR:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;