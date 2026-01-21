const axios = require("axios");

const sendTransactionMail = async ({ to, template, variables }) => {
    try {
        console.log("📧 Attempting to send email:", {
            to,
            template: template ? template.substring(0, 20) + "..." : "MISSING",
            variables
        });

        // Validate inputs
        if (!to || !template || !variables) {
            console.error("❌ Missing required email parameters:", {
                to: !!to,
                template: !!template,
                variables: !!variables
            });
            return null;
        }

        // Validate environment variables
        if (!process.env.ZEPTOMAIL_API_KEY) {
            console.error("❌ ZEPTOMAIL_API_KEY not found in environment");
            return null;
        }

        if (!process.env.ZEPTOMAIL_FROM) {
            console.error("❌ ZEPTOMAIL_FROM not found in environment");
            return null;
        }

        const payload = {
            mail_template_key: template,
            from: {
                address: process.env.ZEPTOMAIL_FROM,
                name: "InstaCoinXPay",
            },
            to: [
                {
                    email_address: {
                        address: to,
                        name: variables.userName || "User",
                    },
                },
            ],
            merge_info: variables,
        };

        console.log("📨 Sending to ZeptoMail:", {
            endpoint: "https://api.zeptomail.in/v1.1/email/template",
            to: to,
            from: process.env.ZEPTOMAIL_FROM,
            templateKey: template.substring(0, 30) + "...",
        });

        const res = await axios.post(
            "https://api.zeptomail.in/v1.1/email/template", // ✅ Correct endpoint
            payload,
            {
                headers: {
                    Authorization: process.env.ZEPTOMAIL_API_KEY,
                    "Content-Type": "application/json",
                },
                timeout: 10000 // 10 second timeout
            }
        );

        console.log("✅ ZEPTOMAIL SENT SUCCESSFULLY:", {
            to,
            status: res.status,
            messageId: res.data?.data?.[0]?.message_id || "N/A"
        });
        
        return res.data;
    } catch (err) {
        console.error("❌ ZEPTOMAIL ERROR DETAILS:", {
            to,
            template: template?.substring(0, 30),
            status: err.response?.status,
            statusText: err.response?.statusText,
            errorCode: err.response?.data?.error?.code,
            errorMessage: err.response?.data?.error?.message,
            errorDetails: err.response?.data?.error?.details,
            fullError: err.response?.data,
        });
        
        // Don't throw error - just log it so transaction can continue
        return null;
    }
};

module.exports = sendTransactionMail;