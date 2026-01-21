require('dotenv').config();
const axios = require('axios');

console.log("\n" + "=".repeat(50));
console.log("🔑 TESTING NEW ZEPTOMAIL API KEY");
console.log("=".repeat(50) + "\n");

// Check if .env is loaded
const apiKey = process.env.ZEPTOMAIL_API_KEY;
const fromEmail = process.env.ZEPTOMAIL_FROM;
const template = process.env.TPL_TRANSACTION_FAILED;

console.log("Step 1: Environment Variables Check");
console.log("-".repeat(50));
console.log("✓ API Key found:", apiKey ? "YES" : "❌ NO");
console.log("✓ API Key format:", apiKey?.startsWith('Zoho-enczapikey') ? "✅ CORRECT" : "❌ WRONG");
console.log("✓ From Email:", fromEmail || "❌ MISSING");
console.log("✓ Template Key:", template ? "YES" : "❌ MISSING");

if (!apiKey) {
    console.log("\n❌ API key not found!");
    console.log("💡 Make sure you:");
    console.log("   1. Saved your .env file");
    console.log("   2. Restarted your server/terminal");
    console.log("   3. Run this from the same directory as .env");
    process.exit(1);
}

if (!apiKey.startsWith('Zoho-enczapikey')) {
    console.log("\n❌ API key format is wrong!");
    console.log("💡 It should start with: Zoho-enczapikey");
    console.log("💡 Current value starts with:", apiKey.substring(0, 20));
    process.exit(1);
}

console.log("\n✅ All environment variables look good!\n");

// Test API connection
console.log("Step 2: Testing API Connection");
console.log("-".repeat(50));

async function testConnection() {
    try {
        console.log("🚀 Sending test request to ZeptoMail...");
        console.log("📧 Test email will be sent to: your-test@email.com\n");
        
        const payload = {
            mail_template_key: template,
            from: {
                address: fromEmail,
                name: "InstaCoinXPay Test"
            },
            to: [{
                email_address: {
                    address: "test@example.com", // Change this to your email
                    name: "Test User"
                }
            }],
            merge_info: {
                userName: "Test User",
                asset: "BTC",
                amount: "0.001",
                walletAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
            }
        };

        console.log("Request Details:");
        console.log("  Endpoint: https://api.zeptomail.in/v1.1/email/template");
        console.log("  From:", fromEmail);
        console.log("  Template:", template.substring(0, 40) + "...");
        console.log("  API Key:", apiKey.substring(0, 30) + "...\n");

        const response = await axios.post(
            "https://api.zeptomail.in/v1.1/email/template",
            payload,
            {
                headers: {
                    "Authorization": apiKey,
                    "Content-Type": "application/json"
                },
                timeout: 15000
            }
        );

        console.log("=".repeat(50));
        console.log("✅✅✅ SUCCESS! EMAIL SENT! ✅✅✅");
        console.log("=".repeat(50));
        console.log("\n📬 Check your inbox at: test@example.com");
        console.log("📊 Response Data:", JSON.stringify(response.data, null, 2));
        console.log("\n🎉 Your ZeptoMail setup is working perfectly!");
        
    } catch (error) {
        console.log("\n" + "=".repeat(50));
        console.log("❌ TEST FAILED");
        console.log("=".repeat(50));
        
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;
            
            console.log("\n📋 Error Details:");
            console.log("  HTTP Status:", status);
            console.log("  Error Code:", errorData?.error?.code);
            console.log("  Error Message:", errorData?.error?.message);
            console.log("  Error Details:", JSON.stringify(errorData?.error?.details, null, 2));
            
            console.log("\n🔍 DIAGNOSIS:");
            
            if (status === 401) {
                console.log("❌ Authentication Failed (401)");
                console.log("\n💡 FIX:");
                console.log("  1. Your new API key might not be correct");
                console.log("  2. Go back to ZeptoMail → Setup → Mail Agents");
                console.log("  3. Click to reveal your Send Mail token");
                console.log("  4. Copy the ENTIRE string (including 'Zoho-enczapikey')");
                console.log("  5. Update .env file (no quotes, no extra spaces)");
                console.log("  6. Save and restart this script");
            } else if (errorData?.error?.code === 'TM_1002') {
                console.log("❌ Template Not Found");
                console.log("\n💡 FIX:");
                console.log("  1. Go to ZeptoMail → Templates");
                console.log("  2. Find your 'Transaction Failed' template");
                console.log("  3. Copy the exact template key");
                console.log("  4. Update TPL_TRANSACTION_FAILED in .env");
            } else if (errorData?.error?.code === 'TM_3001') {
                console.log("❌ From Email Not Verified");
                console.log("\n💡 FIX:");
                console.log("  1. Go to ZeptoMail → Setup → From Addresses");
                console.log("  2. Verify", fromEmail);
                console.log("  3. Check your email for verification link");
            } else {
                console.log("❌ Unknown Error:", errorData?.error?.message);
            }
        } else {
            console.log("\n❌ Network Error:");
            console.log("  ", error.message);
            console.log("\n💡 Check your internet connection");
        }
        
        console.log("\n" + "=".repeat(50));
    }
}

testConnection();