const User = require("../models/User");
const sendEmail = require("../utils/email");
const jwt = require("jsonwebtoken");
const crypto = require('crypto');
const sendZeptoTemplateMail = require("../utils/zeptomail.service");


/* ===============================
   TOKEN GENERATOR
================================ */
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE,
    });
};

// Helper function to generate wallet addresses
const generateWalletAddresses = () => {
    // In real implementation, you would use actual wallet API
    // For demo, generating mock addresses
    const generateRandomAddress = (length) => {
        const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    return {
        btc: `bc1q${generateRandomAddress(34)}`, // BTC address
        bnb: `0x${generateRandomAddress(34)}`, // BNB address
        usdtTron: `T${generateRandomAddress(34)}`, // USDT TRON address
        trx: `TTCn${generateRandomAddress(34)}`, // TRX address
        usdtBnb: `0x${generateRandomAddress(34)}`, // USDT BNB address
        eth: `0x${generateRandomAddress(34)}`, // ETH address
        sol: generateRandomAddress(34), // SOL address
        xrp: `r${generateRandomAddress(34)}`, // XRP address
        doge: `D${generateRandomAddress(34)}`, // DOGE address
        ltc: `L${generateRandomAddress(34)}` // LTC address
    };
};

// Helper function to generate referral code
const generateReferralCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
};

/* ===============================
   GET STARTED
================================ */
exports.getStarted = async (req, res, next) => {
    try {
        const { country, referralCode } = req.body;

        if (!country) {
            return res.status(400).json({
                success: false,
                error: "Please select a country",
            });
        }

        res.status(200).json({
            success: true,
            data: {
                country,
                referralCode: referralCode || null,
            },
            message: "Proceed to create account",
        });
    } catch (error) {
        next(error);
    }
};

/* ===============================
   REGISTER
================================ */
exports.register = async (req, res, next) => {
  try {
    const { fullName, email, password, country, referralCode: referredBy } = req.body;

    // 1️⃣ User exists check
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "User already exists",
      });
    }

    // 2️⃣ Create user (not verified)
    const user = await User.create({
      fullName,
      email,
      password,
      country,
      referralCode: generateReferralCode(),
      referredBy,
      walletAddresses: generateWalletAddresses(),
      isVerified: false,
    });

    // 3️⃣ Generate OTP (same pattern as forgot)
    const otp = user.generateVerificationCode();
    await user.save();

    // 4️⃣ Send OTP via ZeptoMail
    await sendZeptoTemplateMail({
      to: user.email,
      templateKey: process.env.TPL_VERIFY_OTP,
      mergeInfo: {
        otp,
        expiry: "5",
        name: user.fullName,
      },
    });

    // 5️⃣ Response
    res.status(201).json({
      success: true,
      message: "Verification code sent to your email",
      data: {
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
};


/* ===============================
   VERIFY EMAIL
================================ */
exports.verifyEmail = async (req, res) => {
  try {
    console.log("VERIFY EMAIL HIT:", req.body);

    const { email, verificationCode } = req.body;

    const hashedVerificationCode = crypto
      .createHash("sha256")
      .update(String(verificationCode).trim())
      .digest("hex");

    const user = await User.findOne({
      email,
      verificationCode: hashedVerificationCode,
      verificationCodeExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired OTP",
      });
    }

    // ✅ MARK VERIFIED
    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpire = undefined;
    await user.save();

    // ✅ SEND WELCOME MAIL (ONLY AFTER VERIFY)
    await sendZeptoTemplateMail({
      to: user.email,
      templateKey: process.env.TPL_WELCOME,
      mergeInfo: {
        name: user.fullName,
      },
    });

    // ✅ LOGIN TOKEN
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
      token,
      data: {
        id: user._id,
        name: user.fullName,
        email: user.email,
        isVerified: true,
      },
    });
  } catch (error) {
    console.error("VERIFY EMAIL ERROR 🔴", error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
};




/* ===============================
   RESEND VERIFICATION
================================ */
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const otp = user.generateVerificationCode();
    await user.save();

    await sendZeptoTemplateMail({
      to: user.email,
      templateKey: process.env.TPL_VERIFY_OTP,
      mergeInfo: {
        otp,
        expiry: "5",
        name: user.fullName,
      },
    });

    res.status(200).json({
      success: true,
      message: "Verification code resent successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to resend verification code",
    });
  }
};


/* ===============================
   FORGOT PASSWORD
================================ */
exports.forgotPassword = async (req, res, next) => {
  try {
    console.log("FORGOT PASSWORD HIT");
    console.log("EMAIL:", req.body.email);

    const { email } = req.body;

    const user = await User.findOne({ email });
    console.log("USER FOUND:", !!user);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User with this email does not exist",
      });
    }

    const resetCode = user.generateResetPasswordToken();
    console.log("RESET CODE GENERATED:", resetCode);

    await user.save();
    console.log("USER SAVED");

    // 👇 THIS IS MOST LIKELY FAILING
    await sendZeptoTemplateMail({
      to: user.email,
      templateKey: process.env.TPL_FORGOT_OTP,
      mergeInfo: {
        otp: resetCode,
        expiry: "5",
      },
    });

    console.log("EMAIL SENT");

    res.status(200).json({
      success: true,
      message: "Password reset code sent to your email",
    });
  } catch (error) {
    console.error("FORGOT PASSWORD ERROR 🔴", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};


/* ===============================
   RESEND FORGOT PASSWORD OTP
================================ */
exports.resendForgotPasswordOTP = async (req, res) => {
  try {
    console.log("RESEND FORGOT OTP HIT");

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // 🔁 Generate NEW reset code (overwrite old)
    const resetCode = user.generateResetPasswordToken();
    await user.save();

    // 📧 Send via ZeptoMail (RESEND TEMPLATE)
    await sendZeptoTemplateMail({
      to: user.email,
      templateKey: process.env.TPL_FORGOT_RESEND_OTP,
      mergeInfo: {
        otp: resetCode,
        expiry: "5",
        name: user.fullName || "User",
      },
    });

    res.status(200).json({
      success: true,
      message: "Reset code resent successfully",
    });
  } catch (error) {
    console.error("RESEND FORGOT OTP ERROR 🔴", error);
    res.status(500).json({
      success: false,
      error: "Failed to resend reset code",
    });
  }
};


/* ===============================
   VERIFY RESET CODE
================================ */
exports.verifyResetCode = async (req, res, next) => {
    try {
        const { email, resetCode } = req.body;

        // Hash the reset code
        const hashedResetCode = crypto
            .createHash('sha256')
            .update(resetCode)
            .digest('hex');

        const user = await User.findOne({
            email,
            resetPasswordToken: hashedResetCode,
            resetPasswordExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                error: "Invalid or expired reset code",
            });
        }

        res.status(200).json({
            success: true,
            message: "Reset code verified successfully",
        });
    } catch (error) {
        next(error);
    }
};
/* ===============================
   RESET PASSWORD
================================ */
exports.resetPassword = async (req, res, next) => {
  console.log("RESET PASSWORD HIT");

  try {
    const { email, resetCode, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters",
      });
    }

    const hashedResetCode = crypto
      .createHash("sha256")
      .update(String(resetCode))
      .digest("hex");

    const user = await User.findOne({
      email,
      resetPasswordToken: hashedResetCode,
      resetPasswordExpire: { $gt: Date.now() },
    }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset code",
      });
    }

    const isSamePassword = await user.matchPassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: "New password must be different from old password",
      });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    try {
      console.log("📧 Sending password reset success email to:", user.email);

      await sendZeptoTemplateMail({
        to: user.email,
        templateKey: process.env.TPL_CONFIRM_RESET_PASSWORD,
        mergeInfo: {
          name: user.fullName || "User",
          team: "InstaCoinXPay",
        },
      });

      console.log("✅ Password reset success email sent");
    } catch (mailError) {
      console.error("❌ Password reset email failed:", mailError.message);
    }

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("RESET PASSWORD ERROR 🔴", error);
    next(error);
  }
};


// ===============================
// SEND PASSWORD RESET SUCCESS MAIL (OPTIONAL API)
// ===============================
exports.sendPasswordResetSuccessMail = async (req, res) => {
  console.log("📩 SEND PASSWORD RESET SUCCESS MAIL HIT");

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    await sendZeptoTemplateMail({
      to: user.email,
      templateKey: process.env.TPL_CONFIRM_RESET_PASSWORD,
      mergeInfo: {
        name: user.fullName || "User",
        team: "InstaCoinXPay",
      },
    });

    console.log("✅ Password reset success email sent to:", user.email);

    return res.status(200).json({
      success: true,
      message: "Password reset success email sent",
    });
  } catch (error) {
    console.error("❌ RESET SUCCESS MAIL ERROR:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to send password reset success email",
    });
  }
};




/* ===============================
   LOGIN
================================ */
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "Please provide email and password",
            });
        }

        const user = await User.findOne({ email }).select("+password");
        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Invalid credentials",
            });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: "Invalid credentials",
            });
        }

        if (user.isSuspended) {
            return res.status(403).json({
                success: false,
                error: `Account suspended: ${user.suspensionReason}`
            });
        }

        if (!user.isVerified) {
            return res.status(401).json({
                success: false,
                error: "Please verify your email first",
            });
        }

        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            token,
            data: {
                id: user._id,
                name: user.fullName,
                email: user.email,
                role: user.role,
                country: user.country,
                referralCode: user.referralCode,
                isVerified: user.isVerified,
                walletAddresses: user.walletAddresses,
                walletBalances: user.walletBalances
            },
        });
    } catch (error) {
        next(error);
    }
};

/* ===============================
   GET ALL USERS (No Auth Required)
================================ */
exports.getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find().select('-password -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire');
        
        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        next(error);
    }
};

// Get user wallet balance (add to existing authController)
exports.getUserWallet = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        walletAddresses: user.walletAddresses,
        walletBalances: user.walletBalances
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update user wallet address
exports.updateWalletAddress = async (req, res, next) => {
  try {
    const { asset, address } = req.body;
    
    if (!asset || !address) {
      return res.status(400).json({
        success: false,
        error: 'Please provide asset and address'
      });
    }
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Validate wallet address format
    if (!user.validateWalletAddress(asset, address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address format'
      });
    }
    
    // Update wallet address
    user.walletAddresses[asset] = address;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Wallet address updated successfully',
      data: user.walletAddresses[asset]
    });
  } catch (error) {
    next(error);
  }
};

// Get user portfolio value
exports.getPortfolioValue = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const portfolioValue = await user.getPortfolioValue();
    const assetBreakdown = await user.getAssetBreakdown();
    
    res.status(200).json({
      success: true,
      data: {
        portfolioValue,
        assetBreakdown
      }
    });
  } catch (error) {
    next(error);
  }
};
/* ===============================
   GET SINGLE USER
================================ */
exports.getUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select('-password -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};