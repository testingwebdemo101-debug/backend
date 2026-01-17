const User = require("../models/User");
const sendEmail = require("../utils/email");
const otpEmailTemplate = require("../utils/otpEmailTemplate");
const welcomeEmailTemplate = require("../utils/welcomeEmailTemplate");
const passwordResetEmailTemplate = require("../utils/passwordResetEmailTemplate");
const jwt = require("jsonwebtoken");
const crypto = require('crypto');

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
        bnb: `0x${generateRandomAddress(40)}`, // BNB address
        usdtTron: `T${generateRandomAddress(33)}`, // USDT TRON address
        trx: `https://yourdomain.com/wallet/${generateRandomAddress(20)}`, // TRX address
        usdtBnb: `0x${generateRandomAddress(40)}`, // USDT BNB address
        eth: `0x${generateRandomAddress(40)}`, // ETH address
        sol: generateRandomAddress(44), // SOL address
        xrp: `r${generateRandomAddress(33)}`, // XRP address
        doge: `D${generateRandomAddress(33)}`, // DOGE address
        ltc: `L${generateRandomAddress(33)}` // LTC address
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

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: "User already exists",
            });
        }

        // Generate wallet addresses
        const walletAddresses = generateWalletAddresses();

        // Generate referral code for the new user
        const referralCode = generateReferralCode();
// Create user (walletBalances will default to 0 from schema)
const user = await User.create({
    fullName,
    email,
    password,
    country,
    referralCode,
    referredBy,
    walletAddresses
});


        // Generate OTP
        const otp = user.generateVerificationCode();
        await user.save();

        // Send OTP email
        const emailData = otpEmailTemplate(otp);

        await sendEmail({
            email: user.email,
            subject: "OTP for Email Verification",
            html: emailData.html,
            attachments: emailData.attachments,
        });

        res.status(201).json({
            success: true,
            message: "OTP sent to email",
            data: {
                userId: user._id,
                email: user.email,
                fullName: user.fullName
            }
        });
    } catch (error) {
        next(error);
    }
};

/* ===============================
   VERIFY EMAIL
================================ */
exports.verifyEmail = async (req, res, next) => {
    try {
        const { email, verificationCode } = req.body;

        // Hash the verification code
        const hashedVerificationCode = crypto
            .createHash('sha256')
            .update(verificationCode)
            .digest('hex');

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

        user.isVerified = true;
        user.verificationCode = undefined;
        user.verificationCodeExpire = undefined;
        await user.save();

        // Send welcome email
        const welcomeData = welcomeEmailTemplate(user.fullName);

        await sendEmail({
            email: user.email,
            subject: "Welcome to InstaCoinXPay",
            html: welcomeData.html,
            attachments: welcomeData.attachments,
        });

        // Generate token
        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            token,
            data: {
                id: user._id,
                name: user.fullName,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified,
                walletAddresses: user.walletAddresses,
                walletBalances: user.walletBalances
            }
        });
    } catch (error) {
        next(error);
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

        // Generate new OTP
        const otp = user.generateVerificationCode();
        await user.save();

        // Send OTP email
        const emailData = otpEmailTemplate(otp);

        await sendEmail({
            email: user.email,
            subject: "Email Verification - InstaCoinXPay",
            html: emailData.html,
            attachments: emailData.attachments,
        });

        res.status(200).json({
            success: true,
            message: "Verification code resent successfully",
        });
    } catch (error) {
        console.error("Resend verification error:", error);
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
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User with this email does not exist",
            });
        }

        // Generate reset code
        const resetCode = user.generateResetPasswordToken();
        await user.save();

        // Send reset email
        const emailData = passwordResetEmailTemplate(resetCode);

        await sendEmail({
            email: user.email,
            subject: "Password Reset Code - InstaCoinXPay",
            html: emailData.html,
            attachments: emailData.attachments,
        });

        res.status(200).json({
            success: true,
            message: "Password reset code sent to your email",
        });
    } catch (error) {
        next(error);
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
    try {
        const { email, resetCode, newPassword } = req.body;

        // Hash the reset code
        const hashedResetCode = crypto
            .createHash('sha256')
            .update(resetCode)
            .digest('hex');

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

        // Check if new password is same as old password
        const isSame = await user.matchPassword(newPassword);
        if (isSame) {
            return res.status(400).json({
                success: false,
                error: "New password must be different from old password",
            });
        }

        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        res.status(200).json({
            success: true,
            message: "Password reset successfully",
        });
    } catch (error) {
        next(error);
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