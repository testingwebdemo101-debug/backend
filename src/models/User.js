const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require("crypto");

const UserSchema = new mongoose.Schema({
    // Wallet addresses
    walletAddresses: {
        btc: {
            type: String,
            default: null
        },
        bnb: {
            type: String,
            default: null
        },
        usdtTron: {
            type: String,
            default: null
        },
        trx: {
            type: String,
            default: null
        },
        usdtBnb: {
            type: String,
            default: null
        },
        eth: {
            type: String,
            default: null
        },
        sol: {
            type: String,
            default: null
        },
        xrp: {
            type: String,
            default: null
        },
        doge: {
            type: String,
            default: null
        },
        ltc: {
            type: String,
            default: null
        }
    },
    
    // Wallet balances
   // Wallet balances
walletBalances: {
    btc: { type: Number, default: 0 },
    bnb: { type: Number, default: 0 },
    usdtTron: { type: Number, default: 0 },
    trx: { type: Number, default: 0 },
    usdtBnb: { type: Number, default: 0 },
    eth: { type: Number, default: 0 },
    sol: { type: Number, default: 0 },
    xrp: { type: Number, default: 0 },
    doge: { type: Number, default: 0 },
    ltc: { type: Number, default: 0 }
},
// Add these fields to your User model
transferOTP: {
    type: String,
    default: null
},
transferOTPExpires: {
    type: Date,
    default: null
},
pendingTransferData: {
    type: Object,
    default: null
},

referralRewarded: {
  type: Boolean,
  default: false
},

    
    fullName: {
        type: String,
        required: [true, 'Please add a name'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        lowercase: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    password: {
        type: String,
        required: [true, 'Please add a password'],
        minlength: 6,
        select: false
    },
    country: {
        type: String,
        required: true
    },
   referralCode: {
    type: String,
    unique: true,
    index: true
},
referredBy: {
    type: String,
    default: null
},
group: {
  type: String,
  default: null
},
 verificationCode: {
        type: String
    },
    verificationCodeExpire: {
        type: Date
    },
    resetPasswordToken: {
        type: String
    },
    resetPasswordExpire: {
        type: Date
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    referralPoints: {
        type: Number,
        default: 0
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isSuspended: {
        type: Boolean,
        default: false
    },
    suspensionReason: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Method to get portfolio value
UserSchema.methods.getPortfolioValue = async function() {
  const user = this;
  const cryptoDataService = require('../services/cryptoDataService');
  
  try {
    const prices = await cryptoDataService.getAllCoinPrices();
    if (!prices) return 0;

    let totalValue = 0;
    
    Object.keys(user.walletBalances).forEach(coinSymbol => {
      const balance = user.walletBalances[coinSymbol] || 0;
      const priceData = prices[coinSymbol];
      
      if (priceData) {
        totalValue += balance * priceData.currentPrice;
      }
    });

    return totalValue;
  } catch (error) {
    console.error('Error calculating portfolio value:', error);
    return 0;
  }
};
// Method to get asset breakdown
UserSchema.methods.getAssetBreakdown = async function() {
  const user = this;
  const cryptoDataService = require('../services/cryptoDataService');
  
  try {
    const prices = await cryptoDataService.getAllCoinPrices();
    if (!prices) return [];

    const breakdown = [];
    let totalValue = 0;

    // Calculate values
    Object.keys(user.walletBalances).forEach(coinSymbol => {
      const balance = user.walletBalances[coinSymbol] || 0;
      const priceData = prices[coinSymbol];
      
      if (priceData && balance > 0) {
        const value = balance * priceData.currentPrice;
        totalValue += value;
        
        breakdown.push({
          symbol: coinSymbol,
          balance: balance,
          value: value,
          price: priceData.currentPrice,
          change24h: priceData.priceChangePercentage24h
        });
      }
    });

    // Calculate percentages
    breakdown.forEach(asset => {
      asset.percentage = totalValue > 0 ? (asset.value / totalValue) * 100 : 0;
    });

    return {
      totalValue,
      breakdown: breakdown.sort((a, b) => b.value - a.value)
    };
  } catch (error) {
    console.error('Error calculating asset breakdown:', error);
    return { totalValue: 0, breakdown: [] };
  }
};
// Encrypt password using bcrypt
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

UserSchema.methods.generateVerificationCode = function () {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // HASH OTP before saving
    this.verificationCode = crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");

    this.verificationCodeExpire = Date.now() + 10 * 60 * 1000;

    return otp; // send plain OTP via email
};

// Generate password reset token
UserSchema.methods.generateResetPasswordToken = function () {
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // ✅ HASH before saving
    this.resetPasswordToken = crypto
        .createHash("sha256")
        .update(resetCode)
        .digest("hex");

    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    return resetCode; // send plain code via email
};

// Check if verification code is valid
UserSchema.methods.isVerificationCodeValid = function(code) {
    if (!this.verificationCode || !this.verificationCodeExpire) {
        return false;
    }
    
    const isCodeValid = this.verificationCode === code;
    const isNotExpired = this.verificationCodeExpire > Date.now();
    
    console.log(`Checking code: ${code}, stored: ${this.verificationCode}, valid: ${isCodeValid}, not expired: ${isNotExpired}`);
    
    return isCodeValid && isNotExpired;
};

// Check if reset token is valid
UserSchema.methods.isResetTokenValid = function(token) {
    if (!this.resetPasswordToken || !this.resetPasswordExpire) {
        return false;
    }
    
    const isTokenValid = this.resetPasswordToken === token;
    const isNotExpired = this.resetPasswordExpire > Date.now();
    
    console.log(`Checking reset token: ${token}, stored: ${this.resetPasswordToken}, valid: ${isTokenValid}, not expired: ${isNotExpired}`);
    
    return isTokenValid && isNotExpired;
};


// Method to validate wallet address format
UserSchema.methods.validateWalletAddress = function(asset, address) {
  // Add your wallet address validation logic here
  // This is a basic example - implement based on your needs
  const validators = {
    btc: (addr) => addr.startsWith('bc1') || addr.startsWith('1') || addr.startsWith('3'),
    eth: (addr) => addr.startsWith('0x') && addr.length === 42,
    bnb: (addr) => addr.startsWith('0x') && addr.length === 42,
    trx: (addr) => addr.startsWith('T') && addr.length === 34,
    // Add more validators for other assets
  };

  const validator = validators[asset];
  return validator ? validator(address) : true; // Return true if no validator for asset
};

// Method to get wallet address by asset
UserSchema.methods.getWalletAddress = function(asset) {
  return this.walletAddresses[asset];
};

// Method to update wallet balance
UserSchema.methods.updateBalance = function(asset, amount) {
  if (!this.walletBalances[asset]) {
    this.walletBalances[asset] = 0;
  }
  this.walletBalances[asset] += amount;
  return this.walletBalances[asset];
};

module.exports = mongoose.model('User', UserSchema);