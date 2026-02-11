const User = require("../models/User");

/* ===============================
   GET ALL USERS (WITH BULK GROUP)
================================ */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: 1 }) // Important for stable grouping
      .select(
        "-password -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire"
      );

    const GROUP_SIZE = 100;
    let autoIndex = 0;

    const processedUsers = users.map((user) => {
      let bulkGroup;

      // If user has NO custom group → AUTO grouping
      if (!user.group) {
        bulkGroup = `AUTO-${Math.floor(autoIndex / GROUP_SIZE) + 1}`;
        autoIndex++; // increment only for AUTO users
      } else {
        bulkGroup = `CUSTOM-${user.group}`;
      }

      return {
        ...user.toObject(),
        bulkGroup,
      };
    });

    res.status(200).json({
      success: true,
      count: processedUsers.length,
      data: processedUsers,
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

/* ===============================
   UPDATE USER
================================ */
exports.updateUser = async (req, res) => {
  try {
    const { fullName, country } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { fullName, country },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

/* ===============================
   SUSPEND USER
================================ */
exports.suspendUser = async (req, res) => {
  try {
    const { reason } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isSuspended: true,
        suspensionReason: reason || "No reason provided",
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Suspend user error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

/* ===============================
   UNSUSPEND USER
================================ */
exports.unsuspendUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isSuspended: false,
        suspensionReason: null,
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Unsuspend user error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

/* ===============================
   DELETE USER
================================ */
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};
