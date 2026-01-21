const User = require("../models/User");
const coinMap = require("../utils/coinMap");
const sendZeptoTemplateMail = require("../utils/sendZeptoTemplateMail");
const { generateRandomAddress } = require("../utils/cryptoAddress"); // helper for random address

const GROUP_SIZE = 100;

/* ===============================
   GET BULK GROUPS (METADATA)
================================ */
exports.getBulkGroups = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalGroups = Math.ceil(totalUsers / GROUP_SIZE);

    const groups = [];

    for (let i = 1; i <= totalGroups; i++) {
      const start = (i - 1) * GROUP_SIZE;
      const remaining = totalUsers - start;

      groups.push({
        value: i,
        label: `Group ${i} - ${remaining >= 100 ? 100 : remaining} users`,
      });
    }

    res.json({ success: true, groups });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
};

/* ===============================
   GET USERS BY GROUP (100 USERS)
================================ */
exports.getUsersByGroup = async (req, res) => {
  try {
    const group = Number(req.params.group);

    if (!group || group < 1) {
      return res.status(400).json({ error: "Invalid group" });
    }

    const start = (group - 1) * GROUP_SIZE;

    const users = await User.find()
      .sort({ createdAt: 1 })
      .skip(start)
      .limit(GROUP_SIZE)
      .select("_id name email walletBalances");

    res.json({
      success: true,
      group,
      count: users.length,
      users,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

/* ===============================
   BULK CREDIT / DEBIT
================================ */
exports.bulkCreditDebit = async (req, res) => {
  try {
    const { type, coin, amount, group } = req.body;

    if (!["CREDIT", "DEBIT"].includes(type)) {
      return res.status(400).json({ error: "Invalid type" });
    }

    if (!coinMap[coin]) {
      return res.status(400).json({ error: "Invalid coin" });
    }

    const numericAmount = Number(amount);
    if (numericAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const dbCoin = coinMap[coin];

    const users = await User.find()
      .sort({ createdAt: 1 })
      .select("_id email walletBalances");

    let selectedUsers = users;

    /* GROUP FILTER */
    if (group && group !== "ALL") {
      const g = Number(group);
      const start = (g - 1) * GROUP_SIZE;
      const end = start + GROUP_SIZE;
      selectedUsers = users.slice(start, end);
    }

    let success = 0;
    let failed = 0;

    for (const user of selectedUsers) {
      try {
        const current = user.walletBalances[dbCoin] || 0;

        if (type === "DEBIT" && current < numericAmount) {
          throw new Error("Insufficient balance");
        }

        user.walletBalances[dbCoin] =
          type === "CREDIT"
            ? current + numericAmount
            : current - numericAmount;

        await user.save();

        // ✅ SEND EMAIL WITH RANDOM ADDRESS + US TIME
        const usDate = new Date().toLocaleString("en-US", {
          timeZone: "America/New_York",
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        await sendZeptoTemplateMail({
          to: user.email,
          template: process.env.TPL_BULK_CRYPTO,
          variables: {
            coin,
            amount: numericAmount,
            type,
            group,
            platform: "InstaCoinXPay",
            currentYear: new Date().getFullYear(),
            dateTimeUS: usDate,
            address: generateRandomAddress(coin), // random address generator
          },
        });

        success++;
      } catch (err) {
        console.error("User failed:", user.email, err.message);
        failed++;
      }
    }

    res.json({
      success: true,
      group,
      processedUsers: selectedUsers.length,
      success,
      failed,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};