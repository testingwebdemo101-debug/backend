const User = require("../models/User");

exports.processReferralReward = async (newUser) => {
  if (!newUser.referredBy || newUser.referralRewarded) return;

  const referrer = await User.findOne({
    referralCode: newUser.referredBy
  });

  if (!referrer) return;

  const REWARD_AMOUNT = 25;

  // Credit both wallets
  referrer.walletBalances.usdtBnb += REWARD_AMOUNT;
  newUser.walletBalances.usdtBnb += REWARD_AMOUNT;

  newUser.referralRewarded = true;

  await referrer.save();
  await newUser.save();
};
