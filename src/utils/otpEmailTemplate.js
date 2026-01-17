const path = require("path");

const otpEmailTemplate = (otp) => {
  return {
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>OTP Verification</title>
</head>

<body style="margin:0; padding:0; background:#ffffff; font-family:Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr>
      <td align="center">

        <!-- MAIN CARD -->
        <table width="380" cellpadding="0" cellspacing="0" style="padding:20px;">

          <!-- LOGO -->
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <img 
                src="cid:hrms-logo" 
                width="160" 
                alt="InstaCoinXPay Logo"
                style="display:block; margin:0 auto;"
              />
            </td>
          </tr>

          <!-- TITLE -->
          <tr>
            <td align="center" style="font-size:18px; font-weight:bold; padding-bottom:15px; line-height:1.4;">
              One Time Password<br/>
              for password reset
            </td>
          </tr>

          <!-- TEXT -->
          <tr>
            <td align="center" style="font-size:14px; padding-bottom:18px;">
              You’ve requested a password reset.<br/>
              Your OTP for password reset is:
            </td>
          </tr>

          <!-- OTP BOX -->
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <div style="
                background:#1e66d0;
                color:#ffffff;
                font-size:22px;
                font-weight:bold;
                padding:12px 0;
                width:150px;
                border-radius:8px;
                letter-spacing:4px;
                text-align:center;
                margin:0 auto;
              ">
                ${otp}
              </div>
            </td>
          </tr>

          <!-- WARNING -->
          <tr>
            <td align="center" style="font-size:13px; padding-bottom:12px; line-height:1.5;">
              Don’t recognize this activity?<br/>
              Please reset your password and contact customer support immediately.
            </td>
          </tr>

          <tr>
            <td align="center" style="font-size:13px; padding-bottom:12px; line-height:1.5;">
              Please check with the receiving platform or wallet as the transaction
              is already confirmed on the blockchain explorer.
            </td>
          </tr>

          <tr>
            <td align="center" style="font-size:12px; padding-bottom:20px;">
              This is an automated message, please do not reply.
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="border-top:1px solid #ccc; padding-top:15px; font-size:11px; line-height:1.5;">
              <strong>Risk warning:</strong> Cryptocurrency trading is subject to high market risk.<br/>
              InstaCoinXPay will not be responsible for your trading losses.<br/>
              Please trade with caution.
            </td>
          </tr>

          <tr>
            <td align="center" style="font-size:11px; padding-top:10px; line-height:1.5;">
              <strong>Kindly note:</strong> Please beware of phishing sites and ensure
              you are visiting the official InstaCoinXPay website.
            </td>
          </tr>

          <tr>
            <td align="center" style="font-size:11px; padding-top:20px; color:#777;">
              © 2025 InstaCoinXPay, All Rights Reserved
            </td>
          </tr>

        </table>
        <!-- END CARD -->

      </td>
    </tr>
  </table>
</body>
</html>
    `,

    attachments: [
      {
        filename: "logo.png",
        path: path.join(__dirname, "../Images/logo.png"),
        cid: "hrms-logo", // MUST MATCH img src
      },
    ],
  };
};

module.exports = otpEmailTemplate;
