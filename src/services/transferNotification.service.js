const User = require("../models/User");
const sendTransactionMail = require("../utils/sendZeptoTemplateMail");

const notifyTransferCompletion = async (transfer) => {
  try {
    const fromUser = await User.findById(transfer.fromUser);
    const toUser = await User.findById(transfer.toUser);

    if (!fromUser) return;

    const txId = transfer._id.toString();

    // Sender
    await sendTransactionMail({
      to: fromUser.email,
      template: process.env.TPL_WITHDRAWAL_COMPLETE,
      variables: {
        userName: fromUser.fullName,
        asset: transfer.asset.toUpperCase(),
        amount: transfer.amount,
        txId,
        walletAddress: transfer.toAddress,
      },
    });

    // Receiver
    if (toUser) {
      await sendTransactionMail({
        to: toUser.email,
        template: process.env.TPL_DEPOSIT_SUCCESS,
        variables: {
          userName: toUser.fullName,
          asset: transfer.asset.toUpperCase(),
          amount: transfer.amount,
          txId,
          walletAddress: toUser.walletAddresses[transfer.asset],
        },
      });
    }
  } catch (err) {
    console.error("notifyTransferCompletion error:", err.message);
  }
};

module.exports = { notifyTransferCompletion };
