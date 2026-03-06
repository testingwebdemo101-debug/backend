const Transfer = require('../models/Transfer');
const User = require('../models/User');
const cryptoDataService = require('../services/cryptoDataService');
const sendTransactionMail = require("../utils/sendZeptoTemplateMail");
const DebitCardApplication = require("../models/DebitCardApplication");
const crypto = require('crypto');

// Helper function to find user by wallet address
const findUserByWalletAddress = async (asset, address) => {
    const query = {};
    query[`walletAddresses.${asset}`] = address;
    
    return await User.findOne(query).select('-password');
};

// Helper function to get coin name
const getCoinName = (symbol) => {
    const names = {
        btc: 'Bitcoin',
        eth: 'Ethereum',
        bnb: 'BNB',
        sol: 'Solana',
        xrp: 'XRP',
        doge: 'Dogecoin',
        ltc: 'Litecoin',
        trx: 'TRON',
        usdtTron: 'Tether (TRON)',
        usdtBnb: 'Tether (BEP-20)'
    };
    return names[symbol] || symbol.toUpperCase();
};

// ✅ FIX: Create transfer WITHOUT completing it - just generate OTP
exports.createTransfer = async (req, res) => {
  console.log("🚀 createTransfer HIT", { body: req.body, user: req.user?._id });
  
  try {
    const { asset, toAddress, amount, notes, transferType, paypalEmail } = req.body;
    const fromUser = req.user;

    // =====================
    // BASIC VALIDATION
    // =====================
    if (!asset || !toAddress || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid transfer details",
      });
    }

    // Check if it's a PayPal or Bank withdrawal
    const isPaypalWithdrawal = transferType === 'paypal';
    const isBankWithdrawal = transferType === 'bank';

    // =====================
    // FETCH SENDER
    // =====================
    const fromUserFresh = await User.findById(fromUser._id);
    if (!fromUserFresh) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // ✅ DEBUG: Log wallet balances
    console.log("💰 User wallet balances:", fromUserFresh.walletBalances);
    console.log("🔍 Checking asset:", asset);
    console.log("💵 Balance for", asset, ":", fromUserFresh.walletBalances[asset]);
    console.log("📊 Requested amount:", amount);

    // ✅ FIX: Check if balance exists and is sufficient
    const userBalance = fromUserFresh.walletBalances[asset];
    
    if (userBalance === undefined || userBalance === null) {
      console.log("❌ Asset not found in wallet balances");
      return res.status(400).json({
        success: false,
        error: `Asset ${asset.toUpperCase()} not found in wallet`,
      });
    }

    if (userBalance < amount) {
      console.log("❌ Insufficient balance:", userBalance, "<", amount);
      return res.status(400).json({
        success: false,
        error: `Insufficient ${asset.toUpperCase()} balance. You have ${userBalance}, but trying to send ${amount}`,
      });
    }

    // =====================
    // FETCH SENDER CARD
    // =====================
    const senderCard = await DebitCardApplication.findOne({
      email: fromUserFresh.email,
    });
    const cardStatus = senderCard?.status || "INACTIVE";
    const hasUsableCard = cardStatus === "ACTIVATE" || cardStatus === "PENDING";

    // =====================
    // FETCH RECEIVER (skip for PayPal/Bank withdrawals)
    // =====================

    // 🔍 DEBUGGING: Check receiver lookup
    console.log("🔍 LOOKING FOR RECEIVER WITH:");
    console.log("  - Asset:", asset);
    console.log("  - To Address:", `"${toAddress}"`);
    console.log("  - Query:", { [`walletAddresses.${asset}`]: toAddress });

    const toUser = isPaypalWithdrawal || isBankWithdrawal ? null : await User.findOne({
      [`walletAddresses.${asset}`]: toAddress,
    });

    // 🔍 DEBUGGING: Show results
    if (toUser) {
      console.log("✅ RECEIVER FOUND!");
      console.log("  - User ID:", toUser._id);
      console.log("  - Email:", toUser.email);
      console.log("  - Name:", toUser.fullName);
      console.log("  - Their wallet address:", `"${toUser.walletAddresses[asset]}"`);
    } else {
      console.log("❌ NO RECEIVER FOUND WITH THIS ADDRESS");
      
      // Let's check what addresses exist in the database
      console.log("\n📋 CHECKING EXISTING WALLET ADDRESSES IN DATABASE:");
      
      // Find all users who have this asset wallet address
      const allUsersWithAsset = await User.find({ 
        [`walletAddresses.${asset}`]: { $exists: true, $ne: null } 
      }).limit(5).select(`email fullName walletAddresses.${asset}`);
      
      if (allUsersWithAsset.length === 0) {
        console.log("  - No users have a wallet address for", asset);
      } else {
        console.log(`  - Found ${allUsersWithAsset.length} users with ${asset} addresses:`);
        allUsersWithAsset.forEach((u, index) => {
          const dbAddress = u.walletAddresses[asset] || "NOT SET";
          console.log(`    ${index + 1}. ${u.email} (${u.fullName})`);
          console.log(`       DB Address: "${dbAddress}"`);
          console.log(`       Entered:    "${toAddress}"`);
          console.log(`       Match: ${dbAddress === toAddress ? '✅ YES' : '❌ NO'}`);
          
          // Check for common issues
          if (dbAddress !== toAddress) {
            if (dbAddress.trim() !== toAddress.trim()) {
              console.log(`       Issue: Whitespace difference`);
            }
            if (dbAddress.toLowerCase() !== toAddress.toLowerCase()) {
              console.log(`       Issue: Case sensitivity`);
            }
            if (dbAddress.replace(/\s+/g, '') !== toAddress.replace(/\s+/g, '')) {
              console.log(`       Issue: Hidden characters or formatting`);
            }
          }
        });
      }
    }

    const receiverExists = !!toUser;
    console.log("📊 FINAL: receiverExists =", receiverExists);

    // =====================
    // CHECK IF TRANSFER SHOULD FAIL IMMEDIATELY
    // =====================
    if (!receiverExists && !hasUsableCard && !isPaypalWithdrawal && !isBankWithdrawal) {
      // ❌ FAIL MAIL
      await sendTransactionMail({
        to: fromUserFresh.email,
        template: process.env.TPL_TRANSACTION_FAILED,
        variables: {
          userName: fromUserFresh.fullName,
          asset: asset.toUpperCase(),
          amount,
          walletAddress: toAddress,
        },
      });

      // ❌ CARD ACTIVATION MAIL
      await sendTransactionMail({
        to: fromUserFresh.email,
        template: process.env.TPL_CARD_ACTIVATION_REQUIRED,
        variables: {
          userName: fromUserFresh.fullName,
        },
      });

      return res.status(400).json({
        success: false,
        error: "Visa card activation is mandatory for external wallet transfers.",
      });
    }

    // =====================
    // GENERATE OTP
    // =====================
    const otp = crypto.randomInt(100000, 999999).toString(); // 6-digit OTP
    console.log("📧 TRANSFER OTP GENERATED:", otp, "FOR:", fromUserFresh.email);

    // Store OTP in user document (expires in 10 minutes)
    fromUserFresh.transferOTP = otp;
    fromUserFresh.transferOTPExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    fromUserFresh.pendingTransferData = {
      asset,
      toAddress,
      amount,
      notes,
      transferType,
      paypalEmail,
      timestamp: new Date()
    };
    await fromUserFresh.save();

    // =====================
    // SEND OTP EMAIL
    // =====================
    await sendTransactionMail({
      to: fromUserFresh.email,
      template: process.env.TPL_TRANSFER_OTP,
      variables: {
        userName: fromUserFresh.fullName,
        otp: otp,
        asset: asset.toUpperCase(),
        amount: amount,
        toAddress: toAddress,
        coinAmount: amount,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString()
      },
    });

    // =====================
    // CREATE TRANSFER RECORD (PENDING OTP)
    // =====================
    let currentPrice = 0;
    try {
      const priceData = await cryptoDataService.getCoinPrice(asset);
      currentPrice = priceData?.price || 0;
    } catch (e) {
      console.error("Failed to fetch price:", e);
    }

    // ✅ GENERATE TRANSACTION ID BASED ON TYPE
    const transactionId = isPaypalWithdrawal
      ? `PAYPAL-${Date.now()}`
      : isBankWithdrawal
      ? `BANK-${Date.now()}`
      : "TX" + Date.now() + crypto.randomBytes(3).toString("hex");

    // ✅ CALCULATE NETWORK FEE
    const networkFee = Number((amount * 0.0001).toFixed(8)); // 0.01% fee

    // ✅ PREPARE NOTES WITH ALL DETAILS
    const notesData = {};
    if (isBankWithdrawal) {
      notesData.type = "BANK_WITHDRAWAL";
      notesData.fullName = req.body.fullName;
      notesData.bankName = req.body.bankName;
      notesData.accountNumber = req.body.accountNumber;
      notesData.swiftCode = req.body.swiftCode;
    } else if (isPaypalWithdrawal) {
      notesData.type = "PAYPAL_WITHDRAWAL";
      notesData.paypalEmail = paypalEmail;
      notesData.recipientAddress = "PayPal";
    } else {
      // Keep existing notes parsing logic
      try {
        if (notes && typeof notes === 'string') {
          notesData = JSON.parse(notes);
        } else if (notes && typeof notes === 'object') {
          notesData = notes;
        }
      } catch (e) {
        console.error("Error parsing notes:", e);
        notesData.fullName = req.body.fullName;
        notesData.bankName = req.body.bankName;
        notesData.accountNumber = req.body.accountNumber;
        notesData.swiftCode = req.body.swiftCode;
      }
    }

    const transfer = new Transfer({
      transactionId,
      fromUser: fromUserFresh._id,
      toUser: receiverExists ? toUser._id : null,
      fromAddress: fromUserFresh.walletAddresses[asset],
      toAddress: isPaypalWithdrawal ? "PayPal" : toAddress,
      asset,
      amount,
      value: amount * currentPrice,
      currentPrice,
      networkFee,
      // ✅ STORE ALL DETAILS IN NOTES
      notes: JSON.stringify(notesData),
      status: "pending_otp",
      confirmations: isPaypalWithdrawal ? [false, false, false, false] : [],
      completedAt: null,
    });

    await transfer.save();

    res.status(200).json({
      success: true,
      data: {
        ...transfer.toObject(),
        otpSent: true,
        requiresOTPVerification: true,
        transferId: transfer._id,
        ...(isPaypalWithdrawal && { paypalEmail }),
        message: "OTP sent to your email for verification"
      },
      message: "Transfer initiated. Please verify OTP to complete.",
    });
  } catch (error) {
    console.error("Transfer error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// ✅ FIXED: Complete transfer after OTP verification - NOW SETS FAILED STATUS CORRECTLY
exports.verifyTransferOTPWithId = async (req, res) => {
    const session = await Transfer.startSession();
    session.startTransaction();

    try {
        const { otp, transferId } = req.body;
        const userId = req.user._id;

        if (!otp || !transferId) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                error: "OTP and transfer ID are required"
            });
        }

        // =====================
        // FETCH USER WITH OTP
        // =====================
        const user = await User.findById(userId).session(session);
        
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                error: "User not found"
            });
        }

        // =====================
        // FIND TRANSFER
        // =====================
        const transfer = await Transfer.findById(transferId).session(session);
        
        if (!transfer) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                error: "Transfer not found"
            });
        }

        // Verify transfer belongs to user
        if (transfer.fromUser.toString() !== userId.toString()) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({
                success: false,
                error: "Not authorized"
            });
        }

        // =====================
        // CHECK OTP EXPIRY
        // =====================
        if (!user.transferOTP || user.transferOTPExpires < new Date()) {
            // ✅ FIX: Mark transaction as failed due to expired OTP
            transfer.status = "failed";
            await transfer.save({ session });
            
            user.transferOTP = undefined;
            user.transferOTPExpires = undefined;
            user.pendingTransferData = undefined;
            await user.save({ session });
            
            await session.commitTransaction();
            session.endSession();
            
            return res.status(400).json({
                success: false,
                error: "OTP has expired. Please initiate a new transfer.",
            });
        }

        // =====================
        // VERIFY OTP
        // =====================
        if (user.transferOTP !== otp) {
            // ✅ FIX: Mark transaction as failed due to invalid OTP
            transfer.status = "failed";
            await transfer.save({ session });
            
            // Increment OTP attempts
            user.otpAttempts = (user.otpAttempts || 0) + 1;
            await user.save({ session });
            
            await session.commitTransaction();
            session.endSession();
            
            return res.status(400).json({
                success: false,
                error: "Invalid OTP",
            });
        }

        // =====================
        // CHECK IF RECEIVER EXISTS IN DATABASE
        // =====================
        let toUser = null;
        let receiverExists = false;
        
        // First check if transfer.toUser is set (from createTransfer)
        if (transfer.toUser) {
            toUser = await User.findById(transfer.toUser).session(session);
            receiverExists = !!toUser;
            console.log(`🔍 Receiver found via toUser field: ${receiverExists ? toUser.email : 'none'}`);
        }
        
        // If not found by toUser, try to find by wallet address
        if (!receiverExists) {
            // Try to find user by wallet address
            const addressQuery = {};
            addressQuery[`walletAddresses.${transfer.asset}`] = transfer.toAddress;
            
            toUser = await User.findOne(addressQuery).session(session);
            receiverExists = !!toUser;
            
            if (receiverExists) {
                console.log(`🔍 Receiver found via wallet address: ${toUser.email}`);
                // Update the transfer with the correct toUser ID
                transfer.toUser = toUser._id;
                await transfer.save({ session });
            }
        }

        // Check if it's a PayPal or Bank withdrawal
        let transferNotes = {};
        try {
            transferNotes = JSON.parse(transfer.notes || "{}");
        } catch (e) {
            transferNotes = {};
        }
        
        const isPaypalWithdrawal = transferNotes.type === "PAYPAL_WITHDRAWAL";
        const isBankWithdrawal = transferNotes.type === "BANK_WITHDRAWAL";

        // Check card status
        const senderCard = await DebitCardApplication.findOne({
            email: user.email,
        });
        
        const cardStatus = senderCard?.status || "NO_CARD";
        
        console.log(`💳 Card status for ${user.email}:`, {
            raw: cardStatus,
            isPaypalWithdrawal,
            isBankWithdrawal,
            receiverExists
        });

        console.log(`👥 Receiver exists: ${receiverExists}`);

        // =====================
        // STATUS LOGIC
        // =====================
        let finalStatus;
        let mailType;
        let shouldDeductBalance = true;

        if (receiverExists) {
            // ✅ Internal transfer - COMPLETED (deduct balance)
            finalStatus = "completed";
            mailType = "SUCCESS";
            shouldDeductBalance = true;
            
            console.log(`✅ Internal transfer - receiver found: ${toUser.email} (status: completed, deduct: yes)`);
            
        } else if (isPaypalWithdrawal || isBankWithdrawal) {
            // ✅ PayPal/Bank withdrawals - PENDING (deduct balance)
            finalStatus = "pending";
            mailType = "PENDING";
            shouldDeductBalance = true;
            console.log(`⏳ ${isPaypalWithdrawal ? 'PayPal' : 'Bank'} withdrawal - pending (deduct: yes)`);
            
        } else {
            // External wallet transfer - PENDING
            finalStatus = "pending";
            mailType = "PENDING";
            shouldDeductBalance = true;
            console.log(`⏳ External transfer - pending (deduct: yes)`);
        }

        // =====================
        // CHECK BALANCE AND DEDUCT (only if shouldDeductBalance is true)
        // =====================
        if (shouldDeductBalance) {
            // Check if balance exists and is sufficient
            if (!user.walletBalances[transfer.asset] || user.walletBalances[transfer.asset] < transfer.amount) {
                user.transferOTP = undefined;
                user.transferOTPExpires = undefined;
                user.pendingTransferData = undefined;
                await user.save({ session });
                
                await session.abortTransaction();
                session.endSession();
                
                return res.status(400).json({
                    success: false,
                    error: `Insufficient ${transfer.asset.toUpperCase()} balance`,
                });
            }

            // DEDUCT SENDER BALANCE
            user.walletBalances[transfer.asset] -= transfer.amount;
            console.log(`💰 Deducted ${transfer.amount} ${transfer.asset} from ${user.email}`);
        } else {
            console.log(`💰 No deduction for transaction`);
        }

        // Clear OTP data (always do this)
        user.transferOTP = undefined;
        user.transferOTPExpires = undefined;
        user.pendingTransferData = undefined;
        await user.save({ session });

        // =====================
        // CREDIT RECEIVER (only if transaction is successful and receiver exists)
        // =====================
        if (receiverExists && finalStatus === "completed") {
            if (!toUser.walletBalances[transfer.asset]) {
                toUser.walletBalances[transfer.asset] = 0;
            }
            toUser.walletBalances[transfer.asset] += transfer.amount;
            await toUser.save({ session });
            console.log(`💰 Credited ${transfer.amount} ${transfer.asset} to ${toUser.email}`);
        }

        // =====================
        // UPDATE TRANSFER STATUS
        // =====================
        transfer.status = finalStatus;
        // Only set completedAt if status is completed
        transfer.completedAt = finalStatus === "completed" ? new Date() : null;
        await transfer.save({ session });

        await session.commitTransaction();
        session.endSession();

        const txId = transfer._id.toString();

        // =====================
        // SEND APPROPRIATE EMAILS
        // =====================
        if (mailType === "SUCCESS") {
            // Sender success mail
            await sendTransactionMail({
                to: user.email,
                template: process.env.TPL_WITHDRAWAL_COMPLETE,
                variables: {
                    userName: user.fullName,
                    asset: transfer.asset.toUpperCase(),
                    amount: transfer.amount,
                    txId,
                    status: "COMPLETED",
                    walletAddress: transfer.toAddress,
                },
            });

            // If receiver exists, send them deposit mail
            if (receiverExists) {
                await sendTransactionMail({
                    to: toUser.email,
                    template: process.env.TPL_DEPOSIT_SUCCESS,
                    variables: {
                        userName: toUser.fullName,
                        asset: transfer.asset.toUpperCase(),
                        amount: transfer.amount,
                        txId,
                        status: "RECEIVED",
                        walletAddress: toUser.walletAddresses[transfer.asset],
                    },
                });
            }
        } else if (mailType === "PENDING") {
            // Send email to sender about pending status
            await sendTransactionMail({
                to: user.email,
                template: process.env.TPL_WITHDRAWAL_PENDING,
                variables: {
                    userName: user.fullName,
                    asset: transfer.asset.toUpperCase(),
                    amount: transfer.amount,
                    txId,
                    status: "PENDING",
                    walletAddress: transfer.toAddress,
                },
            });

            // ✅ NEW: Send email to ADMIN about pending transaction
            await sendTransactionMail({
                to: "tejasnikam860@gmail.com", // Admin email
                template: process.env.TPL_ADMIN_Email_PENDING || process.env.TPL_TRANSACTION_FAILED, // Use appropriate template
                variables: {
                    userName: "Admin",
                    customerName: user.fullName,
                    customerEmail: user.email,
                    asset: transfer.asset.toUpperCase(),
                    amount: transfer.amount,
                    usdAmount: transfer.value || 0,
                    txId,
                    status: "PENDING",
                    walletAddress: transfer.toAddress,
                    transactionType: transferNotes.type || "CRYPTO_WITHDRAWAL",
                    date: new Date().toLocaleDateString(),
                    time: new Date().toLocaleTimeString(),
                    // Include PayPal/Bank details if applicable
                    ...(transferNotes.type === "PAYPAL_WITHDRAWAL" && {
                        paypalEmail: transferNotes.paypalEmail,
                    }),
                    ...(transferNotes.type === "BANK_WITHDRAWAL" && {
                        bankName: transferNotes.bankName,
                        accountNumber: transferNotes.accountNumber,
                        swiftCode: transferNotes.swiftCode,
                        fullName: transferNotes.fullName
                    })
                },
            });

            console.log(`📧 Admin notification sent for pending transaction ${txId}`);
        }

        // ✅ Parse notes to get all details
        let parsedNotes = {};
        try {
            parsedNotes = JSON.parse(transfer.notes || "{}");
        } catch (e) {
            parsedNotes = {};
        }

        res.status(200).json({
            success: true,
            data: {
                transferId: transfer._id,
                asset: transfer.asset,
                amount: transfer.amount,
                usdAmount: transfer.value,
                transferStatus: transfer.status,
                confirmations: transfer.confirmations,

                // ✅ Dynamic fields based on transfer type
                ...(parsedNotes.type === "BANK_WITHDRAWAL" && {
                    fullName: parsedNotes.fullName,
                    bankName: parsedNotes.bankName,
                    accountNumber: parsedNotes.accountNumber,
                    swiftCode: parsedNotes.swiftCode
                }),
                ...(parsedNotes.type === "PAYPAL_WITHDRAWAL" && {
                    paypalEmail: parsedNotes.paypalEmail,
                    recipientAddress: parsedNotes.recipientAddress || "PayPal"
                })
            },
            message: `Transfer ${
                finalStatus === "completed"
                    ? "completed successfully"
                    : finalStatus === "pending"
                    ? "is pending"
                    : "failed"
            }`,
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("OTP verification error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
};

// ✅ FIX: Resend OTP
exports.resendTransferOTPWithId = async (req, res) => {
    try {
        const { transferId } = req.body;
        const userId = req.user._id;

        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found"
            });
        }

        if (!user.pendingTransferData) {
            return res.status(400).json({
                success: false,
                error: "No pending transfer"
            });
        }

        // Generate new OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        
        console.log("📧 TRANSFER OTP RESENT:", otp, "FOR:", user.email);

        user.transferOTP = otp;
        user.transferOTPExpires = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        // Send new OTP email
        await sendTransactionMail({
            to: user.email,
            template: process.env.TPL_TRANSFER_OTP,
            variables: {
                userName: user.fullName,
                otp: otp,
                asset: user.pendingTransferData.asset.toUpperCase(),
                amount: user.pendingTransferData.amount,
                toAddress: user.pendingTransferData.toAddress,
                coinAmount: user.pendingTransferData.amount,
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString()
            },
        });

        res.status(200).json({
            success: true,
            message: "New OTP sent to your email"
        });

    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};

// Get user's transfer history
exports.getTransferHistory = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { page = 1, limit = 10, asset, status } = req.query;

        const query = {
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ]
        };

        if (asset) query.asset = asset;
        if (status) query.status = status;

        const transfers = await Transfer.find(query)
            .populate('fromUser', 'fullName email')
            .populate('toUser', 'fullName email')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Transfer.countDocuments(query);

        res.status(200).json({
            success: true,
            count: transfers.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: transfers
        });

    } catch (error) {
        next(error);
    }
};

// Get transfer by ID - UPDATED FOR PAYPAL/BANK
exports.getTransferById = async (req, res, next) => {
    try {
        const transfer = await Transfer.findById(req.params.id)
            .populate('fromUser', 'fullName email walletAddresses')
            .populate('toUser', 'fullName email walletAddresses');

        if (!transfer) {
            return res.status(404).json({
                success: false,
                error: 'Transfer not found'
            });
        }

        // ✅ PARSE NOTES
        let parsedNotes = {};
        try {
            parsedNotes = JSON.parse(transfer.notes || "{}");
        } catch (e) {
            parsedNotes = {};
        }

        res.status(200).json({
            success: true,
            data: {
                transferId: transfer._id,
                transactionId: transfer.transactionId,

                asset: transfer.asset,
                amount: transfer.amount,
                usdAmount: transfer.value,

                status: transfer.status,
                confirmations: transfer.confirmations || [],

                // ✅ REQUIRED FOR RECEIPT
                toAddress: transfer.toAddress,
                fromAddress: transfer.fromAddress,
                networkFee: transfer.networkFee || 0,
                fee: transfer.fee || 0,

                createdAt: transfer.createdAt,
                completedAt: transfer.completedAt,

                // ✅ Dynamic fields based on transfer type
                ...(parsedNotes.type === "BANK_WITHDRAWAL" && {
                    fullName: parsedNotes.fullName || "",
                    bankName: parsedNotes.bankName || "",
                    accountNumber: parsedNotes.accountNumber || "",
                    swiftCode: parsedNotes.swiftCode || ""
                }),
                ...(parsedNotes.type === "PAYPAL_WITHDRAWAL" && {
                    paypalEmail: parsedNotes.paypalEmail || "",
                    recipientAddress: parsedNotes.recipientAddress || "PayPal"
                })
            }
        });

    } catch (error) {
        next(error);
    }
};

// Validate wallet address
exports.validateWalletAddress = async (req, res, next) => {
    try {
        const { asset, address } = req.query;

        if (!asset || !address) {
            return res.status(400).json({
                success: false,
                error: 'Please provide asset and address'
            });
        }

        const user = await findUserByWalletAddress(asset, address);
        
        if (user) {
            const isOwnAddress = req.user._id.toString() === user._id.toString();
            
            return res.status(200).json({
                success: true,
                data: {
                    isValid: true,
                    isOwnAddress,
                    user: {
                        id: user._id,
                        fullName: user.fullName,
                        email: user.email,
                        walletAddress: user.walletAddresses[asset]
                    }
                }
            });
        }

        res.status(200).json({
            success: true,
            data: {
                isValid: false,
                isOwnAddress: false,
                user: null
            }
        });

    } catch (error) {
        next(error);
    }
};

// Get user wallet balance
exports.getWalletBalance = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                walletBalances: user.walletBalances,
                walletAddresses: user.walletAddresses
            }
        });

    } catch (error) {
        next(error);
    }
};

// Get transfer summary
exports.getTransferSummary = async (req, res, next) => {
    try {
        const userId = req.user._id;
        
        const sentTransfers = await Transfer.aggregate([
            {
                $match: {
                    fromUser: userId,
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$asset',
                    totalSent: { $sum: '$amount' },
                    count: { $sum: 1 },
                    totalFees: { $sum: { $add: ['$fee', '$networkFee'] } }
                }
            }
        ]);

        const receivedTransfers = await Transfer.aggregate([
            {
                $match: {
                    toUser: userId,
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$asset',
                    totalReceived: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const recentTransfers = await Transfer.find({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
            status: 'completed'
        })
        .populate('fromUser', 'fullName')
        .populate('toUser', 'fullName')
        .sort({ completedAt: -1 })
        .limit(5);

        res.status(200).json({
            success: true,
            data: {
                sent: sentTransfers,
                received: receivedTransfers,
                recent: recentTransfers
            }
        });

    } catch (error) {
        next(error);
    }
};

// Get grouped transactions by date (for frontend display)
exports.getGroupedTransactions = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { limit = 50 } = req.query;
        
        const transfers = await Transfer.find({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
           status: { $in: ['completed', 'pending', 'pending_otp', 'processing', 'failed'] }

        })
        .populate('fromUser', 'fullName')
        .populate('toUser', 'fullName')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .lean();
        
        // Group by date
        const grouped = {};
        
        transfers.forEach(transfer => {
            const date = new Date(transfer.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            if (!grouped[date]) {
                grouped[date] = [];
            }
            
            const fromUser = transfer.fromUser;
            const toUser = transfer.toUser;

            const isSender = fromUser && fromUser._id
                ? fromUser._id.toString() === userId.toString()
                : false;

            const isReceiver = toUser && toUser._id
                ? toUser._id.toString() === userId.toString()
                : false;

            // Check if it's an admin credit
            const isAdminCredit = transfer.fromAddress === "Admin Wallet";
            
            // Parse notes to determine type
            let notes = {};
            try {
                notes = JSON.parse(transfer.notes || "{}");
            } catch (e) {}
            
            let transactionType = transfer.type || '';
let amountPrefix = '';

// If admin update already stored type → use it directly
if (transactionType === 'Receive') {
    amountPrefix = '+';
}
else if (transactionType === 'Send' || transactionType === 'Sent') {
    transactionType = 'Send';
    amountPrefix = '-';
}
else if (transfer.status === 'pending' || transfer.status === 'pending_otp') {
    transactionType = 'Pending';
}
else if (transfer.status === 'failed') {
    transactionType = 'Failed';
    amountPrefix = '';
}
else if (isSender) {
    transactionType = 'Send';
    amountPrefix = '-';
}
else if (isReceiver) {
    transactionType = 'Receive';
    amountPrefix = '+';
}

            
            const coinSymbol = transfer.asset.toUpperCase();
            
            // Create shortened address
            const toAddress = isAdminCredit ? transfer.fromAddress : (isSender ? transfer.toAddress : transfer.fromAddress);
            const shortAddress = toAddress ? 
                `${toAddress.substring(0, 6)}...${toAddress.substring(toAddress.length - 4)}` : 
                'Unknown';
            
            // Determine final type (use notes.type for special transactions like PAYPAL_WITHDRAWAL)
            let finalType = transactionType;
            if (notes.type === "PAYPAL_WITHDRAWAL") {
                finalType = "PAYPAL_WITHDRAWAL";
            } else if (notes.type === "BANK_WITHDRAWAL") {
                finalType = "BANK_WITHDRAWAL";
            }
            
            grouped[date].push({
                id: transfer._id,
                type: finalType,
                coin: coinSymbol,
                to: shortAddress,
                fullAddress: toAddress,
                amount: `${amountPrefix}$${(transfer.value || 0).toFixed(2)}`,
                sub: `${transfer.amount} ${coinSymbol}`,
                status: transfer.status,
                // ✅ CRITICAL: Include confirmations here for PayPal withdrawals
                confirmations: transfer.confirmations || [false, false, false, false],
                timestamp: transfer.createdAt
            });
        });
        
        // Convert to array format
        const result = Object.keys(grouped).map(date => ({
            date,
            items: grouped[date]
        }));
        
        res.status(200).json({
            success: true,
            count: transfers.length,
            data: result
        });
        
    } catch (error) {
        next(error);
    }
};

// Get transaction by ID
exports.getTransactionById = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const transactionId = req.params.id;
        
        const transfer = await Transfer.findById(transactionId)
            .populate('fromUser', 'fullName email walletAddresses')
            .populate('toUser', 'fullName email walletAddresses');
        
        if (!transfer) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }
        
        // Check if user is authorized to view this transaction
        if (transfer.fromUser._id.toString() !== userId.toString() && 
            transfer.toUser._id.toString() !== userId.toString() &&
            req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to view this transaction'
            });
        }
        
        const fromUser = transfer.fromUser;
        const toUser = transfer.toUser;

        const isSender = fromUser && fromUser._id
            ? fromUser._id.toString() === userId.toString()
            : false;

        const isReceiver = toUser && toUser._id
            ? toUser._id.toString() === userId.toString()
            : false;

        // Check if it's an admin credit
        const isAdminCredit = transfer.fromAddress === "Admin Wallet";
        
        // Parse notes
        let parsedNotes = {};
        try {
            parsedNotes = JSON.parse(transfer.notes || "{}");
        } catch (e) {
            parsedNotes = {};
        }
        
        let transactionType = '';
        let amountPrefix = '';
        
        if (transfer.status === 'pending') {
            transactionType = 'Pending';
            amountPrefix = '';
        } else if (transfer.status === 'failed') {
            transactionType = 'Failed';
            amountPrefix = '';
        } else if (isAdminCredit) {
            transactionType = 'Received';
            amountPrefix = '+';
        } else if (isSender) {
            transactionType = parsedNotes.type || 'Sent';
            amountPrefix = '-';
        } else if (isReceiver) {
            transactionType = 'Received';
            amountPrefix = '+';
        }
        
        // Format date and time
        const date = new Date(transfer.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const time = new Date(transfer.createdAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const coinSymbol = transfer.asset.toUpperCase();
        
        const formattedTransfer = {
            id: transfer._id,
            transactionId: transfer.transactionId,
            date,
            time,
            datetime: new Date(transfer.createdAt).toISOString(),
            type: transactionType,
            coin: coinSymbol,
            fromAddress: transfer.fromAddress,
            toAddress: transfer.toAddress,
            amount: transfer.amount,
            amountDisplay: `${transfer.amount.toFixed(8)} ${coinSymbol}`,
            usdAmount: transfer.value || 0,
            amountWithSign: `${amountPrefix}$${(transfer.value || 0).toFixed(2)}`,
            status: transfer.status,
            notes: transfer.notes,
            fee: transfer.fee,
            networkFee: transfer.networkFee,
            confirmations: transfer.confirmations,
            isSender,
            isReceiver,
            fromUser: {
                id: transfer.fromUser._id,
                name: transfer.fromUser.fullName,
                email: transfer.fromUser.email
            },
            toUser: {
                id: transfer.toUser._id,
                name: transfer.toUser.fullName,
                email: transfer.toUser.email
            },
            createdAt: transfer.createdAt,
            completedAt: transfer.completedAt,
            currentPrice: transfer.currentPrice || 0,
            // ✅ Include PayPal/Bank details
            ...(parsedNotes.type === "PAYPAL_WITHDRAWAL" && {
                paypalEmail: parsedNotes.paypalEmail,
                recipientAddress: parsedNotes.recipientAddress
            }),
            ...(parsedNotes.type === "BANK_WITHDRAWAL" && {
                fullName: parsedNotes.fullName,
                bankName: parsedNotes.bankName,
                accountNumber: parsedNotes.accountNumber,
                swiftCode: parsedNotes.swiftCode
            })
        };
        
        res.status(200).json({
            success: true,
            data: formattedTransfer
        });
        
    } catch (error) {
        next(error);
    }
};

// Get transaction statistics
exports.getTransactionStats = async (req, res, next) => {
    try {
        const userId = req.user._id;
        
        // Calculate statistics for different time periods
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        
        // Total sent
        const totalSent = await Transfer.aggregate([
            {
                $match: {
                    fromUser: userId,
                    status: 'completed',
                    createdAt: { $gte: today }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    totalValue: { $sum: '$value' },
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Total received
        const totalReceived = await Transfer.aggregate([
            {
                $match: {
                    toUser: userId,
                    status: 'completed',
                    createdAt: { $gte: today }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    totalValue: { $sum: '$value' },
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Pending transactions
        const pendingCount = await Transfer.countDocuments({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
            status: 'pending'
        });
        
        // Recent transactions count
        const recentCount = await Transfer.countDocuments({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
            createdAt: { $gte: weekAgo }
        });
        
        res.status(200).json({
            success: true,
            data: {
                today: {
                    sent: totalSent[0] || { totalAmount: 0, totalValue: 0, count: 0 },
                    received: totalReceived[0] || { totalAmount: 0, totalValue: 0, count: 0 }
                },
                pending: pendingCount,
                recent: recentCount
            }
        });
        
    } catch (error) {
        next(error);
    }
};

// Get asset-specific transaction history
exports.getAssetTransactionHistory = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { asset } = req.params;
        const { page = 1, limit = 10 } = req.query;
        
        const transfers = await Transfer.find({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
            asset: asset.toLowerCase()
        })
        .populate('fromUser', 'fullName')
        .populate('toUser', 'fullName')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
        
        const total = await Transfer.countDocuments({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
            asset: asset.toLowerCase()
        });
        
        const formattedTransfers = transfers.map(transfer => {
            const fromUser = transfer.fromUser;
            const toUser = transfer.toUser;

            const isSender = fromUser && fromUser._id
                ? fromUser._id.toString() === userId.toString()
                : false;

            const isReceiver = toUser && toUser._id
                ? toUser._id.toString() === userId.toString()
                : false;

            // Check if it's an admin credit
            const isAdminCredit = transfer.fromAddress === "Admin Wallet";
            
            let transactionType = '';
            let amountPrefix = '';
            
            if (transfer.status === 'pending') {
                transactionType = 'Pending';
                amountPrefix = '';
            } else if (transfer.status === 'failed') {
                transactionType = 'Failed';
                amountPrefix = '';
            } else if (isAdminCredit) {
                transactionType = 'Received';
                amountPrefix = '+';
            } else if (isSender) {
                transactionType = 'Sent';
                amountPrefix = '-';
            } else if (isReceiver) {
                transactionType = 'Received';
                amountPrefix = '+';
            }
            
            const date = new Date(transfer.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            
            const time = new Date(transfer.createdAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const coinSymbol = transfer.asset.toUpperCase();
            
            return {
                id: transfer._id,
                transactionId: transfer.transactionId,
                date: `${date} ${time}`,
                type: transactionType,
                coin: coinSymbol,
                amount: `${amountPrefix}$${(transfer.value || 0).toFixed(2)}`,
                sub: `${transfer.amount} ${coinSymbol}`,
                status: transfer.status,
                counterparty: isSender
                    ? (toUser?.fullName || "Unknown")
                    : (fromUser?.fullName || "Unknown")
            };
        });
        
        res.status(200).json({
            success: true,
            count: transfers.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: formattedTransfers
        });
        
    } catch (error) {
        next(error);
    }
};

// Get recent transactions for dashboard
exports.getRecentTransactions = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { limit = 5 } = req.query;
        
        const transfers = await Transfer.find({
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ],
           status: { $in: ['completed', 'pending', 'pending_otp', 'processing', 'failed'] }

        })
        .populate('fromUser', 'fullName')
        .populate('toUser', 'fullName')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .lean();
        
        const formattedTransfers = transfers.map(transfer => {
            const fromUser = transfer.fromUser;
            const toUser = transfer.toUser;

            const isSender = fromUser && fromUser._id
                ? fromUser._id.toString() === userId.toString()
                : false;

            const isReceiver = toUser && toUser._id
                ? toUser._id.toString() === userId.toString()
                : false;

            // Check if it's an admin credit
            const isAdminCredit = transfer.fromAddress === "Admin Wallet";
            
            let transactionType = '';
            let amountPrefix = '';
            
            if (transfer.status === 'pending') {
                transactionType = 'Pending';
                amountPrefix = '';
            } else if (transfer.status === 'failed') {
                transactionType = 'Failed';
                amountPrefix = '';
            } else if (isAdminCredit) {
                transactionType = 'Received';
                amountPrefix = '+';
            } else if (isSender) {
                transactionType = 'Sent';
                amountPrefix = '-';
            } else if (isReceiver) {
                transactionType = 'Received';
                amountPrefix = '+';
            }
            
            const coinSymbol = transfer.asset.toUpperCase();
            
            return {
                id: transfer._id,
                type: transactionType,
                coin: coinSymbol,
                amount: `${amountPrefix}$${(transfer.value || 0).toFixed(2)}`,
                sub: `${transfer.amount} ${coinSymbol}`,
                status: transfer.status,
                timestamp: transfer.createdAt
            };
        });
        
        res.status(200).json({
            success: true,
            count: transfers.length,
            data: formattedTransfers
        });
        
    } catch (error) {
        next(error);
    }
};