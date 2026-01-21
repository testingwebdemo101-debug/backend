// test-email-debug.js
// Run this file to test your email configuration
// Usage: node test-email-debug.js

require('dotenv').config();
const axios = require('axios');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
};

const log = {
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
};

console.log('\n===========================================');
console.log('   ZEPTOMAIL EMAIL DEBUGGING TOOL');
console.log('===========================================\n');

// Step 1: Check Environment Variables
console.log('📋 STEP 1: Checking Environment Variables\n');

const checks = {
    apiKey: process.env.ZEPTOMAIL_API_KEY,
    fromEmail: process.env.ZEPTOMAIL_FROM,
    failedTemplate: process.env.TPL_TRANSACTION_FAILED,
    cardTemplate: process.env.TPL_CARD_ACTIVATION_REQUIRED,
};

let allEnvVarsPresent = true;

if (!checks.apiKey) {
    log.error('ZEPTOMAIL_API_KEY is missing');
    allEnvVarsPresent = false;
} else if (!checks.apiKey.startsWith('Zoho-enczapikey')) {
    log.error('ZEPTOMAIL_API_KEY format is incorrect (should start with "Zoho-enczapikey")');
    allEnvVarsPresent = false;
} else {
    log.success('API Key found: ' + checks.apiKey.substring(0, 30) + '...');
}

if (!checks.fromEmail) {
    log.error('ZEPTOMAIL_FROM is missing');
    allEnvVarsPresent = false;
} else {
    log.success('From Email: ' + checks.fromEmail);
}

if (!checks.failedTemplate) {
    log.error('TPL_TRANSACTION_FAILED is missing');
    allEnvVarsPresent = false;
} else {
    log.success('Transaction Failed Template: ' + checks.failedTemplate.substring(0, 30) + '...');
}

if (!checks.cardTemplate) {
    log.error('TPL_CARD_ACTIVATION_REQUIRED is missing');
    allEnvVarsPresent = false;
} else {
    log.success('Card Activation Template: ' + checks.cardTemplate.substring(0, 30) + '...');
}

if (!allEnvVarsPresent) {
    log.error('\n❌ FAILED: Missing environment variables. Fix your .env file first!');
    process.exit(1);
}

console.log('\n✅ All environment variables present!\n');

// Step 2: Test API Connection
console.log('📋 STEP 2: Testing ZeptoMail API Connection\n');

async function testConnection() {
    try {
        // Using a simple API call to check auth
        const response = await axios.get(
            'https://api.zeptomail.com/v1.1/email',
            {
                headers: {
                    Authorization: process.env.ZEPTOMAIL_API_KEY,
                    'Content-Type': 'application/json',
                },
            }
        );
        log.success('API Connection successful!');
        return true;
    } catch (err) {
        if (err.response) {
            log.error(`API Connection failed: ${err.response.status} - ${err.response.statusText}`);
            console.log('Response data:', err.response.data);
        } else {
            log.error('API Connection failed: ' + err.message);
        }
        return false;
    }
}

// Step 3: Send Test Emails
async function sendTestEmail(templateType) {
    const testEmail = 'instacoinxpay@gmail.com'; // ⚠️ CHANGE THIS TO YOUR EMAIL
    
    log.warning(`\n⚠️  IMPORTANT: Change 'your-email@example.com' to your actual email in line 92!`);
    
    const templates = {
        failed: {
            template: process.env.TPL_TRANSACTION_FAILED,
            variables: {
                userName: 'Test User',
                asset: 'BTC',
                amount: '0.05',
                walletAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
            },
            name: 'Transaction Failed'
        },
        card: {
            template: process.env.TPL_CARD_ACTIVATION_REQUIRED,
            variables: {
                userName: 'Test User'
            },
            name: 'Card Activation Required'
        }
    };

    const config = templates[templateType];
    
    console.log(`\n📧 Sending "${config.name}" email to: ${testEmail}`);
    console.log('Template Key:', config.template);
    console.log('Variables:', JSON.stringify(config.variables, null, 2));

    try {
        const payload = {
            mail_template_key: config.template,
            from: {
                address: process.env.ZEPTOMAIL_FROM,
                name: 'InstaCoinXPay',
            },
            to: [
                {
                    email_address: {
                        address: testEmail,
                        name: config.variables.userName,
                    },
                },
            ],
            merge_info: config.variables,
        };

        console.log('\n📤 Sending payload...');
        
        const response = await axios.post(
            'https://api.zeptomail.com/v1.1/email/template',
            payload,
            {
                headers: {
                    Authorization: process.env.ZEPTOMAIL_API_KEY,
                    'Content-Type': 'application/json',
                },
            }
        );

        log.success(`"${config.name}" email sent successfully!`);
        console.log('Response:', JSON.stringify(response.data, null, 2));
        return true;
    } catch (err) {
        log.error(`Failed to send "${config.name}" email`);
        
        if (err.response) {
            console.log('\n🔍 Error Details:');
            console.log('Status:', err.response.status);
            console.log('Status Text:', err.response.statusText);
            console.log('Error Data:', JSON.stringify(err.response.data, null, 2));
            
            // Common error explanations
            if (err.response.status === 401) {
                log.error('\n💡 401 Error: Invalid API Key. Check your ZEPTOMAIL_API_KEY in .env');
            } else if (err.response.status === 404) {
                log.error('\n💡 404 Error: Template not found. Check your template key is correct');
            } else if (err.response.status === 403) {
                log.error('\n💡 403 Error: Domain not verified. Verify your domain in ZeptoMail dashboard');
            }
        } else {
            console.log('\n🔍 Error:', err.message);
        }
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('📋 STEP 3: Sending Test Emails\n');
    
    // Test 1: Transaction Failed Email
    const test1 = await sendTestEmail('failed');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    
    // Test 2: Card Activation Email
    const test2 = await sendTestEmail('card');
    
    console.log('\n===========================================');
    console.log('           TEST RESULTS SUMMARY');
    console.log('===========================================\n');
    
    if (test1 && test2) {
        log.success('All tests passed! Check your email inbox (and spam folder)');
        console.log('\n📧 Next steps:');
        console.log('   1. Check your email inbox');
        console.log('   2. Check spam/junk folder');
        console.log('   3. Wait 1-2 minutes for delivery');
        console.log('   4. Check ZeptoMail Dashboard > Logs for delivery status');
    } else {
        log.error('Some tests failed. Review the errors above and fix them.');
        console.log('\n🔧 Common fixes:');
        console.log('   1. Verify domain in ZeptoMail dashboard');
        console.log('   2. Check API key is correct');
        console.log('   3. Ensure templates are published (not draft)');
        console.log('   4. Check template variable names match exactly');
    }
    
    console.log('\n===========================================\n');
}

// Execute tests
(async () => {
    const connected = await testConnection();
    if (connected) {
        await runAllTests();
    } else {
        log.error('\n❌ Cannot proceed: API connection failed. Fix connection issues first.');
    }
})();