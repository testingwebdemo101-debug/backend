const axios = require("axios");

const sendZeptoTemplateMail = async ({ to, templateKey, mergeInfo }) => {
  try {
    console.log("📧 Attempting to send Zepto template mail:", {
      to,
      templateKey,
      mergeInfo,
    });

    if (!to || !templateKey || !mergeInfo) {
      console.error("❌ Missing email parameters");
      return null;
    }

    if (!process.env.ZEPTOMAIL_API_KEY || !process.env.ZEPTOMAIL_FROM) {
      console.error("❌ ZeptoMail env vars missing");
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
            name: stringMergeInfo.name || "User",
          },
        },
      ],
      merge_info: stringMergeInfo,
    };

    const res = await axios.post(
      "https://api.zeptomail.in/v1.1/email/template",
      payload,
      {
        headers: {
          Authorization: process.env.ZEPTOMAIL_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log("✅ ZEPTOMAIL SENT:", res.data);
    return res.data;
  } catch (err) {
    console.error("❌ ZEPTOMAIL ERROR:", {
      status: err.response?.status,
      message: err.response?.data,
    });
    return null; // ⛔ DO NOT THROW
  }
};

module.exports = sendZeptoTemplateMail;
