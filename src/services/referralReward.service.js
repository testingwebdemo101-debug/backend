// referralReward.service.js

const User = require("../models/User");
const Transfer = require("../models/Transfer");
const ReferralReward = require("../models/ReferralReward");

const generateWalletAddress = (asset) => {
  const rand = (len) => {
    const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = 0; i < len; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  switch (asset) {
    case "usdtBnb":
    case "bnb":
    case "eth": return `0x${rand(34)}`;
    case "usdtTron":
    case "trx": return `T${rand(34)}`;
    case "btc": return `bc1q${rand(34)}`;
    case "sol": return rand(34);
    case "xrp": return `r${rand(34)}`;
    case "doge": return `D${rand(34)}`;
    case "ltc": return `L${rand(34)}`;
    default: return `0x${rand(34)}`;
  }
};

const generateTxHash = () => {
  const hex = "0123456789abcdef";
  let hash = "0x";
  for (let i = 0; i < 64; i++) {
    hash += hex.charAt(Math.floor(Math.random() * hex.length));
  }
  return hash;
};

exports.processReferralReward = async (newUser) => {

  const REWARD_ASSET = "usdtBnb";

  // ❌ Already rewarded protection
  if (newUser.referralRewarded) return;

  const now = new Date();

  // =====================================================
  // ✅ CASE 1: NO REFERRAL CODE → GIVE 25 TO NEW USER ONLY
  // =====================================================

  if (!newUser.referredBy) {

    const REWARD_AMOUNT = 25;

    newUser.walletBalances[REWARD_ASSET] += REWARD_AMOUNT;

    newUser.referralRewarded = true;

    await newUser.save();

    await Transfer.create({

      fromUser: newUser._id,
      toUser: newUser._id,

      fromAddress: generateTxHash(),

      toAddress:
        newUser.walletAddresses?.[REWARD_ASSET] ||
        generateWalletAddress(REWARD_ASSET),

      asset: REWARD_ASSET,

      amount: REWARD_AMOUNT,

      value: REWARD_AMOUNT,

      status: "completed",

      type: "Receive",

      notes: JSON.stringify({
        type: "WELCOME_BONUS"
      }),

      transactionId:
        `WELCOME-${Date.now()}`,

      completedAt: now,
      createdAt: now

    });

    return;

  }

  // =====================================================
  // ✅ CASE 2: WITH REFERRAL CODE → GIVE 50 TO BOTH
  // =====================================================

  const referrer = await User.findOne({
    referralCode: newUser.referredBy,
  });

  if (!referrer) return;

  // ✅ FIX: Check if referral reward already exists for this email
  const existingReward = await ReferralReward.findOne({
    referredEmail: newUser.email
  });

  if (existingReward) {
    console.log(`Referral reward already exists for email: ${newUser.email}`);
    return;
  }

  const REWARD_AMOUNT = 50;

  referrer.walletBalances[REWARD_ASSET] += REWARD_AMOUNT;

  newUser.walletBalances[REWARD_ASSET] += REWARD_AMOUNT;

  newUser.referralRewarded = true;

  await referrer.save();

  await newUser.save();

  // ✅ FIX: Use try-catch to handle any potential duplicate key errors
  try {
    await ReferralReward.create({

      referrerEmail: referrer.email,

      referredEmail: newUser.email,

      amount: REWARD_AMOUNT,

      currency: REWARD_ASSET

    });
  } catch (error) {
    if (error.code === 11000) {
      console.log(`Duplicate referral reward prevented for email: ${newUser.email}`);
      // Continue with transfers even if reward record already exists
    } else {
      throw error; // Re-throw other errors
    }
  }

  const referrerTx = generateTxHash();

  const newUserTx = generateTxHash();

  await Transfer.create({

    fromUser: referrer._id,
    toUser: referrer._id,

    fromAddress: referrerTx,

    toAddress:
      referrer.walletAddresses?.[REWARD_ASSET] ||
      generateWalletAddress(REWARD_ASSET),

    asset: REWARD_ASSET,

    amount: REWARD_AMOUNT,

    value: REWARD_AMOUNT,

    status: "completed",

    type: "Receive",

    notes: JSON.stringify({
      type: "REFERRAL_REWARD"
    }),

    transactionId:
      `REF-${Date.now()}-R`,

    completedAt: now,
    createdAt: now

  });

  await Transfer.create({

    fromUser: newUser._id,
    toUser: newUser._id,

    fromAddress: newUserTx,

    toAddress:
      newUser.walletAddresses?.[REWARD_ASSET] ||
      generateWalletAddress(REWARD_ASSET),

    asset: REWARD_ASSET,

    amount: REWARD_AMOUNT,

    value: REWARD_AMOUNT,

    status: "completed",

    type: "Receive",

    notes: JSON.stringify({
      type: "REFERRAL_REWARD"
    }),

    transactionId:
      `REF-${Date.now()}-N`,

    completedAt: now,
    createdAt: now

  });

};