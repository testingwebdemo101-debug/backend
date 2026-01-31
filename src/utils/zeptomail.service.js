const axios = require("axios");

const sendZeptoTemplateMail = async ({ to, templateKey, mergeInfo }) => {
  try {
    console.log("📧 [DEBUG] sendZeptoTemplateMail called with:", {
      to,
      templateKey: templateKey ? `${templateKey.substring(0, 30)}...` : 'MISSING',
      mergeInfoKeys: Object.keys(mergeInfo || {})
    });

    if (!to || !templateKey || !mergeInfo) {
      console.error("❌ [DEBUG] Missing email parameters:", {
        to: !!to,
        templateKey: !!templateKey,
        mergeInfo: !!mergeInfo
      });
      return null;
    }

    if (!process.env.ZEPTOMAIL_API_KEY || !process.env.ZEPTOMAIL_FROM) {
      console.error("❌ [DEBUG] ZeptoMail env vars missing:", {
        hasApiKey: !!process.env.ZEPTOMAIL_API_KEY,
        hasFrom: !!process.env.ZEPTOMAIL_FROM
      });
      return null;
    }

    // ZeptoMail requires all merge_info values as strings
    const stringMergeInfo = {};
    for (const [key, value] of Object.entries(mergeInfo)) {
      stringMergeInfo[key] = String(value ?? "");
    }

    const payload = {
      mail_template_key: templateKey,
      from: {
        address: process.env.ZEPTOMAIL_FROM,
        name: "InstaCoinXPay",
      },
      to: [
        {
          email_address: {
            address: to,
            name: stringMergeInfo.userName || "User",
          },
        },
      ],
      merge_info: stringMergeInfo,
    };

    console.log("📤 [DEBUG] Sending to ZeptoMail API...");
    
    const response = await axios.post(
      "https://api.zeptomail.in/v1.1/email/template",
      payload,
      {
        headers: {
          Authorization: process.env.ZEPTOMAIL_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    console.log("✅ [DEBUG] ZeptoMail API Response:", {
      status: response.status,
      messageId: response.data?.data?.[0]?.message_id || 'Unknown'
    });
    
    return response.data;
    
  } catch (error) {
    console.error("❌ [DEBUG] ZeptoMail API Error:", {
      message: error.message,
      status: error.response?.status,
      errorDetails: error.response?.data,
      url: error.config?.url
    });
    
    return null;
  }
};

module.exports = sendZeptoTemplateMail;