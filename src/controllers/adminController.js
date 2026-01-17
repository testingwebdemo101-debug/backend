const User = require("../models/User");

/* ===============================
   GET ALL USERS
================================ */
exports.getAllUsers = async (req, res) => {
  const users = await User.find().select("-password");
  res.status(200).json({ success: true, data: users });
};

/* ===============================
   UPDATE USER
================================ */
exports.updateUser = async (req, res) => {
  const { fullName, country } = req.body;

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { fullName, country },
    { new: true }
  );

  res.status(200).json({ success: true, data: user });
};

/* ===============================
   SUSPEND USER
================================ */
exports.suspendUser = async (req, res) => {
  const { reason } = req.body;

  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      isSuspended: true,
      suspensionReason: reason
    },
    { new: true }
  );

  res.status(200).json({ success: true, data: user });
};

/* ===============================
   UNSUSPEND USER
================================ */
exports.unsuspendUser = async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      isSuspended: false,
      suspensionReason: null
    },
    { new: true }
  );

  res.status(200).json({ success: true, data: user });
};

/* ===============================
   DELETE USER
================================ */
exports.deleteUser = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: "User deleted" });
};
