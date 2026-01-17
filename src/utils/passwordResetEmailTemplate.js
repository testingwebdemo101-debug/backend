const path = require("path");

const passwordResetEmailTemplate = (resetCode) => {
  return {
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Password Reset</title>
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
              Password Reset Request
            </td>
          </tr>

          <!-- TEXT -->
          <tr>
            <td align="center" style="font-size:14px; padding-bottom:18px;">
              We received a request to reset your password.<br/>
              Use the verification code below:
            </td>
          </tr>

          <!-- RESET CODE -->
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <div style="
                background:#1e66d0;
                color:#ffffff;
                font-size:22px;
                font-weight:bold;
                padding:12px 0;
                width:170px;
                border-radius:8px;
                letter-spacing:4px;
                text-align:center;
                margin:0 auto;
              ">
                ${resetCode}
              </div>
            </td>
          </tr>

          <!-- NOTE -->
          <tr>
            <td align="center" style="font-size:13px; padding-bottom:12px; line-height:1.5;">
              This code will expire in <strong>10 minutes</strong>.<br/>
              If you didn’t request this, please ignore this email.
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
              © ${new Date().getFullYear()} InstaCoinXPay, All Rights Reserved
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

module.exports = passwordResetEmailTemplate;
