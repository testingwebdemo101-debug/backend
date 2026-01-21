require('dotenv').config();
const axios = require('axios');

async function testZeptoMailSetup() {
    console.log("\n=================================");
    console.log("📋 ZEPTOMAIL DIAGNOSTIC TEST");
    console.log("=================================\n");

    // Step 1: Check environment variables
    console.log("STEP 1: Checking Environment Variables");
    console.log("----------------------------------------");
    
    const apiKey = process.env.ZEPTOMAIL_API_KEY;
    const fromEmail = process.env.ZEPTOMAIL_FROM;
    const tplFailed = process.env.TPL_TRANSACTION_FAILED;
    const tplCard = process.env.TPL_CARD_ACTIVATION_REQUIRED;
    
    console.log("✓ API Key:", apiKey ? `${apiKey.substring(0, 30)}...` : "❌ MISSING");
    console.log("✓ From Email:", fromEmail || "❌ MISSING");
    console.log("✓ Transaction Failed Template:", tplFailed ? `${tplFailed.substring(0, 30)}...` : "❌ MISSING");
    console.log("✓ Card Activation Template:", tplCard ? `${tplCard.substring(0, 30)}...` : "❌ MISSING");
    
    if (!apiKey || !fromEmail || !tplFailed || !tplCard) {
        console.log("\n❌ Missing required environment variables!");
        return;
    }
    
    console.log("\n✅ All environment variables present!\n");

    // Step 2: Test API Connection
    console.log("STEP 2: Testing ZeptoMail API Connection");
    console.log("----------------------------------------");
    
    try {
        const testPayload = {
            mail_template_key: tplFailed,
            from: {
                address: fromEmail,
                name: "InstaCoinXPay Test"
            },
            to: [
                {
                    email_address: {
                        address: "test@example.com", // Change this to your email
                        name: "Test User"
                    }
                }
            ],
            merge_info: {
                userName: "Test User",
                asset: "BTC",
                amount: "0.001",
                walletAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
            }
        };

        console.log("Sending test request to ZeptoMail...");
        console.log("Endpoint: https://api.zeptomail.in/v1.1/email/template");
        console.log("Template Key:", tplFailed.substring(0, 40) + "...");
        
        const response = await axios.post(
            "https://api.zeptomail.in/v1.1/email/template",
            testPayload,
            {
                headers: {
                    "Authorization": apiKey,
                    "Content-Type": "application/json"
                },
                timeout: 10000
            }
        );

        console.log("\n✅ SUCCESS! ZeptoMail is working correctly!");
        console.log("Response:", JSON.stringify(response.data, null, 2));
        
    } catch (err) {
        console.log("\n❌ API Connection failed!");
        console.log("Status:", err.response?.status);
        console.log("Status Text:", err.response?.statusText);
        console.log("Error Code:", err.response?.data?.error?.code);
        console.log("Error Message:", err.response?.data?.error?.message);
        console.log("Error Details:", JSON.stringify(err.response?.data?.error?.details, null, 2));
        
        console.log("\n📝 TROUBLESHOOTING STEPS:");
        
        if (err.response?.status === 401) {
            console.log("1. Your API key might be incorrect or expired");
            console.log("2. Go to: https://www.zoho.com/zeptomail/");
            console.log("3. Navigate to: Setup > Mail Agents");
            console.log("4. Click on your mail agent");
            console.log("5. Copy the 'Send Mail Token' (not Account Token)");
            console.log("6. Format should be: Zoho-enczapikey XXXXX...");
            console.log("7. Update your .env file with the correct key");
        }
        
        if (err.response?.data?.error?.code === 'TM_1002') {
            console.log("1. Template key is invalid");
            console.log("2. Go to: ZeptoMail Dashboard > Templates");
            console.log("3. Find your template and copy the exact template key");
            console.log("4. Update your .env file");
        }
        
        if (err.response?.data?.error?.code === 'TM_3001') {
            console.log("1. From email address not verified");
            console.log("2. Go to: ZeptoMail Dashboard > From Addresses");
            console.log("3. Verify your from email address");
            console.log("4. Check your email for verification link");
        }
    }

    console.log("\n=================================");
    console.log("Test Complete");
    console.log("=================================\n");
}

// Run the test
testZeptoMailSetup();