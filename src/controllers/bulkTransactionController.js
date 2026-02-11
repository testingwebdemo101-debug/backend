  const User = require("../models/User");
  const Transfer = require("../models/Transfer");
  const coinMap = require("../utils/coinMap");
  const sendZeptoTemplateMail = require("../utils/sendZeptoTemplateMail");
  const { generateRandomAddress } = require("../utils/cryptoAddress");
  const cryptoDataService = require("../services/cryptoDataService");

  const GROUP_SIZE = 100;

  /* ===============================
    GET BULK GROUPS (METADATA)
  ================================ */
  exports.getBulkGroups = async (req, res) => {
    try {
      const totalUsers = await User.countDocuments({
        $or: [
          { group: { $exists: false } },
          { group: null },
          { group: "" }
        ]
      });

      const totalGroups = Math.ceil(totalUsers / GROUP_SIZE);

      const groups = [];

      /* ===== AUTO GROUPS ===== */
      for (let i = 1; i <= totalGroups; i++) {
        const start = (i - 1) * GROUP_SIZE;
        const remaining = totalUsers - start;

        groups.push({
          value: `AUTO-${i}`,
          label: `Group ${i} - ${remaining >= 100 ? 100 : remaining} users`,
          type: "AUTO",
        });
      }

      /* ===== CUSTOM GROUPS ===== */
      const customGroups = await User.distinct("group", {
        group: { $ne: null },
      });

      customGroups.forEach((g) => {
        groups.push({
          value: `CUSTOM-${g}`,
          label: g,
          type: "CUSTOM",
        });
      });

      res.json({ success: true, groups });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  };

  /* ===============================
    GET USERS BY GROUP
  ================================ */
  exports.getUsersByGroup = async (req, res) => {
    try {
      const group = req.params.group;

      /* ===== AUTO GROUP ===== */
      if (group.startsWith("AUTO-")) {
        const g = Number(group.split("-")[1]);
        const start = (g - 1) * GROUP_SIZE;

        const users = await User.find({
          $or: [
            { group: { $exists: false } },
            { group: null },
            { group: "" }
          ]
        })
          .sort({ createdAt: 1 })
          .skip(start)
          .limit(GROUP_SIZE)
          .select("_id fullName email group");

        return res.json({ success: true, users });
      }

      /* ===== CUSTOM GROUP ===== */
      if (group.startsWith("CUSTOM-")) {
        const customGroupName = group.replace("CUSTOM-", "");

        const users = await User.find({ group: customGroupName })
          .select("_id fullName email group");

        return res.json({ success: true, users });
      }

      res.status(400).json({ error: "Invalid group" });
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

      const prices = await cryptoDataService.getAllCoinPrices();
      const currentPrice = prices?.[dbCoin]?.currentPrice || 0;
      const usdValue = numericAmount * currentPrice;

      let selectedUsers = [];

      if (group === "ALL") {
        selectedUsers = await User.find().select(
          "_id name email walletBalances walletAddresses"
        );
      }

      /* ===== AUTO GROUP ===== */
      if (group.startsWith("AUTO-")) {
        const g = Number(group.split("-")[1]);
        const start = (g - 1) * GROUP_SIZE;

        selectedUsers = await User.find({
          $or: [
            { group: { $exists: false } },
            { group: null },
            { group: "" }
          ]
        })
          .sort({ createdAt: 1 })
          .skip(start)
          .limit(GROUP_SIZE)
          .select("_id name email walletBalances walletAddresses");
      }

      /* ===== CUSTOM GROUP ===== */
      if (group.startsWith("CUSTOM-")) {
        const customGroupName = group.replace("CUSTOM-", "");

        selectedUsers = await User.find({ group: customGroupName }).select(
          "_id name email walletBalances walletAddresses"
        );
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

          const randomAddress = generateRandomAddress(coin);
          const userWalletAddress =
            user.walletAddresses?.[dbCoin] || randomAddress;

          const transfer = await Transfer.create({
            fromUser: user._id,
            toUser: user._id,
            fromAddress:
              type === "CREDIT" ? "Admin Wallet" : userWalletAddress,
            toAddress:
              type === "CREDIT" ? userWalletAddress : randomAddress,
            asset: dbCoin,
            amount: numericAmount,
            value: usdValue,
            currentPrice,
            status: "completed",
            notes: `Bulk ${type} by Admin`,
            createdAt: new Date(),
            completedAt: new Date(),
          });

          const templateKey =
            type === "CREDIT"
              ? process.env.TPL_BULK_CRYPTO
              : process.env.TPL_BULK_CRYPTO_DEBIT;

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
            templateKey,
            mergeInfo: {
              userName: user.name || "User",
              amount: numericAmount,
              asset: coin,
              txId: transfer._id.toString(),
              status: "COMPLETED",
              platform: "InstaCoinXPay",
              dateTimeUS: usDate,
              currentYear: new Date().getFullYear(),
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

  /* ===============================
    ASSIGN USER TO CUSTOM GROUP
  ================================ */
  exports.assignUserToCustomGroup = async (req, res) => {
    try {
      const { userId, newGroup } = req.body;

      if (!userId || !newGroup) {
        return res.status(400).json({ error: "Missing data" });
      }

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      user.group = newGroup;

      await user.save();

      res.json({
        success: true,
        message: "User moved successfully",
        user,
      });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  };