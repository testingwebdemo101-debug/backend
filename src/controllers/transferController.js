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
    console.log("🚀 createTransfer HIT", {
        body: req.body,
        user: req.user?._id
    });

    try {
        const { asset, toAddress, amount, notes } = req.body;
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

        if (!fromUserFresh.walletBalances[asset] || fromUserFresh.walletBalances[asset] < amount) {
            return res.status(400).json({
                success: false,
                error: `Insufficient ${asset.toUpperCase()} balance`,
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
        // FETCH RECEIVER
        // =====================
        const toUser = await User.findOne({
            [`walletAddresses.${asset}`]: toAddress,
        });

        const receiverExists = !!toUser;

        // =====================
        // CHECK IF TRANSFER SHOULD FAIL IMMEDIATELY
        // =====================
        if (!receiverExists && !hasUsableCard) {
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

        const transfer = new Transfer({
            fromUser: fromUserFresh._id,
            toUser: receiverExists ? toUser._id : null,
            fromAddress: fromUserFresh.walletAddresses[asset],
            toAddress,
            asset,
            amount,
            value: amount * currentPrice,
            currentPrice,
            notes: notes || "",
            status: "pending_otp", // ✅ NEW STATUS
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

// ✅ FIX: Complete transfer after OTP verification
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
        // CHECK OTP EXPIRY
        // =====================
        if (!user.transferOTP || user.transferOTPExpires < new Date()) {
            user.transferOTP = undefined;
            user.transferOTPExpires = undefined;
            user.pendingTransferData = undefined;
            await user.save({ session });
            
            await session.abortTransaction();
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
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                error: "Invalid OTP",
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
        // CHECK BALANCE AGAIN
        // =====================
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

        // =====================
        // DEDUCT SENDER BALANCE
        // =====================
        user.walletBalances[transfer.asset] -= transfer.amount;
        
        // Clear OTP data
        user.transferOTP = undefined;
        user.transferOTPExpires = undefined;
        user.pendingTransferData = undefined;
        await user.save({ session });

        // =====================
        // DETERMINE FINAL STATUS
        // =====================
        const toUser = await User.findById(transfer.toUser).session(session);
        const receiverExists = !!toUser;

        const senderCard = await DebitCardApplication.findOne({
            email: user.email,
        });
        const cardStatus = senderCard?.status || "INACTIVE";
        const hasUsableCard = cardStatus === "ACTIVATE" || cardStatus === "PENDING";

        let finalStatus = "pending";
        let mailType = "PENDING";

        if (receiverExists) {
            finalStatus = "completed";
            mailType = "SUCCESS";
            // Credit receiver
            toUser.walletBalances[transfer.asset] = (toUser.walletBalances[transfer.asset] || 0) + transfer.amount;
            await toUser.save({ session });
        } else if (!hasUsableCard) {
            finalStatus = "failed";
            mailType = "FAIL";
        } else {
            finalStatus = "pending";
            mailType = "PENDING";
        }

        // =====================
        // UPDATE TRANSFER STATUS
        // =====================
        transfer.status = finalStatus;
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

            // Receiver deposit mail
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
        } else if (mailType === "PENDING") {
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
        } else if (mailType === "FAIL") {
            await sendTransactionMail({
                to: user.email,
                template: process.env.TPL_TRANSACTION_FAILED,
                variables: {
                    userName: user.fullName,
                    asset: transfer.asset.toUpperCase(),
                    amount: transfer.amount,
                    walletAddress: transfer.toAddress,
                },
            });

            await sendTransactionMail({
                to: user.email,
                template: process.env.TPL_CARD_ACTIVATION_REQUIRED,
                variables: {
                    userName: user.fullName,
                },
            });
        }

        res.status(200).json({
            success: true,
            data: transfer,
            message: `Transfer ${finalStatus === "completed" ? "completed successfully" : finalStatus === "pending" ? "is pending" : "failed"}`,
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

// Get transfer by ID
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

        const userId = req.user._id;
        if (transfer.fromUser._id.toString() !== userId.toString() && 
            transfer.toUser?._id.toString() !== userId.toString() &&
            req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to view this transfer'
            });
        }

        res.status(200).json({
            success: true,
            data: transfer
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