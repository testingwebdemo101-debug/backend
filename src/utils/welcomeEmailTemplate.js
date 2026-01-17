const path = require("path");

const welcomeEmailTemplate = (name) => {
  return {
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Welcome</title>
</head>
<body style="margin:0; padding:0; background:#ffffff; font-family:Arial, sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center">

<table width="380" cellpadding="0" cellspacing="0" style="padding:20px">

  <!-- LOGO -->
  <tr>
    <td align="center" style="padding-bottom:20px">
 <img src="cid:hrms-logo" width="160" />

    </td>
  </tr>

  <!-- TITLE -->
  <tr>
    <td style="font-size:18px; font-weight:bold; padding-bottom:10px">
      Welcome, ${name}
    </td>
  </tr>

  <!-- CONTENT -->
  <tr>
    <td style="font-size:14px; line-height:22px; padding-bottom:20px">
      We are glad you have chosen InstaCoinXPay! You are joining a pioneering and
      most trusted P2P Bitcoin exchange in the world, where you can find the
      widest variety of trading partners, currencies, payment methods and offers.
    </td>
  </tr>

  <!-- BUTTON -->
  <tr>
    <td align="center" style="padding-bottom:25px">
      <a href="http://localhost:3000/dashboard"
         style="
           background:#1e66d0;
           color:#ffffff;
           padding:12px 22px;
           text-decoration:none;
           border-radius:8px;
           font-size:14px;
         ">
        Visit Your Dashboard
      </a>
    </td>
  </tr>

  <!-- WARNING -->
  <tr>
    <td style="font-size:13px; padding-bottom:12px">
      Don’t recognize this activity?<br/>
      Please reset your password and contact customer support immediately.
    </td>
  </tr>

  <tr>
    <td style="font-size:13px; padding-bottom:12px">
      Please check with the receiving platform or wallet as the transaction is already
      confirmed on the blockchain explorer.
    </td>
  </tr>

  <tr>
    <td style="font-size:12px; padding-bottom:20px">
      This is an automated message, please do not reply.
    </td>
  </tr>

  <tr>
    <td style="border-top:1px solid #ccc; padding-top:15px; font-size:11px">
      <strong>Risk warning:</strong> Cryptocurrency trading is subject to high market risk.
      InstaCoinXPay will not be responsible for your trading losses.
      Please trade with caution.
    </td>
  </tr>

  <tr>
    <td style="font-size:11px; padding-top:10px">
      <strong>Kindly note:</strong> Please be aware of phishing sites and always make sure
      you are visiting the official InstaCoinXPay website when entering sensitive data.
    </td>
  </tr>

  <tr>
    <td align="center" style="font-size:11px; padding-top:20px; color:#777">
      © 2025 InstaCoinXPay, All Rights Reserved
    </td>
  </tr>

</table>

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
        cid: "hrms-logo",
      },
    ],
  };
};

module.exports = welcomeEmailTemplate;
