const Transfer = require('../models/Transfer');
const User = require('../models/User');
const cryptoDataService = require('../services/cryptoDataService');
const sendTransactionMail = require("../utils/sendZeptoTemplateMail");
const DebitCardApplication = require("../models/DebitCardApplication");

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

// Create a transfer with real-time balance update
exports.createTransfer = async (req, res) => {
    console.log("🚀 createTransfer HIT", {
        body: req.body,
        user: req.user?._id
    });
    
    const session = await Transfer.startSession();
    session.startTransaction();

    try {
        const { asset, toAddress, amount, notes } = req.body;
        const fromUser = req.user;

        // =====================
        // BASIC VALIDATION
        // =====================
        if (!asset || !toAddress || !amount || amount <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                error: "Invalid transfer details",
            });
        }

        // =====================
        // FETCH SENDER
        // =====================
        const fromUserFresh = await User.findById(fromUser._id).session(session);

        if (!fromUserFresh) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                error: "User not found",
            });
        }

        if (!fromUserFresh.walletBalances[asset] || fromUserFresh.walletBalances[asset] < amount) {
            await session.abortTransaction();
            session.endSession();
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

        const isCardActive = senderCard?.status === "ACTIVATE";

        // =====================
        // FETCH RECEIVER
        // =====================
        const toUser = await User.findOne({
            [`walletAddresses.${asset}`]: toAddress,
        });

        // =====================
        // CLEAN TRANSFER LOGIC
        // =====================

        // Sender card status
        const cardStatus = senderCard?.status || "INACTIVE";
        const hasUsableCard = cardStatus === "ACTIVATE" || cardStatus === "PENDING";

        // Receiver existence
        const receiverExists = !!toUser;

        // Decide outcome
        let transferStatus = "pending";
        let mailType = "PENDING";

        // CASE 1 & 3 → SUCCESS (receiver exists)
        if (receiverExists) {
            transferStatus = "completed";
            mailType = "SUCCESS";
        }
        // CASE 2 → FAIL (receiver missing + inactive card)
        else if (!receiverExists && !hasUsableCard) {
            await session.abortTransaction();
            session.endSession();

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
                error: "Receiver not found and card inactive",
            });
        }
        // CASE 4 → PENDING (receiver missing + usable card)
        else {
            transferStatus = "pending";
            mailType = "PENDING";
        }

        // Get current price
        // Fetch price
        let currentPrice = 0;
        try {
            const priceData = await cryptoDataService.getCoinPrice(asset);
            currentPrice = priceData?.price || 0;
        } catch (e) {}

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
            status: transferStatus,
            completedAt: transferStatus === "completed" ? Date.now() : null,
        });

        // Deduct sender balance
        fromUserFresh.walletBalances[asset] -= amount;
        await fromUserFresh.save({ session });

        // Credit receiver ONLY on success
        if (transferStatus === "completed" && receiverExists) {
            toUser.walletBalances[asset] =
                (toUser.walletBalances[asset] || 0) + amount;
            await toUser.save({ session });
        }

        await transfer.save({ session });
        await session.commitTransaction();
        session.endSession();

        const txId = transfer._id.toString();

        // ✅ SUCCESS MAILS
        if (mailType === "SUCCESS") {
            // Sender
            await sendTransactionMail({
                to: fromUserFresh.email,
                template: process.env.TPL_WITHDRAWAL_COMPLETE,
                variables: {
                    userName: fromUserFresh.fullName,
                    asset: asset.toUpperCase(),
                    amount,
                    txId,
                    status: "COMPLETED",
                    walletAddress: toAddress,
                },
            });

            // Receiver
            await sendTransactionMail({
                to: toUser.email,
                template: process.env.TPL_DEPOSIT_SUCCESS,
                variables: {
                    userName: toUser.fullName,
                    asset: asset.toUpperCase(),
                    amount,
                    txId,
                    status: "RECEIVED",
                    walletAddress: toUser.walletAddresses[asset],
                },
            });
        }

        // ⏳ PENDING MAIL (sender only)
        if (mailType === "PENDING") {
            await sendTransactionMail({
                to: fromUserFresh.email,
                template: process.env.TPL_WITHDRAWAL_PENDING,
                variables: {
                    userName: fromUserFresh.fullName,
                    asset: asset.toUpperCase(),
                    amount,
                    txId,
                    status: "PENDING",
                    walletAddress: toAddress,
                },
            });
        }

        res.status(200).json({
            success: true,
            data: transfer,
            message: `Transfer ${transferStatus === "completed" ? "completed" : "pending"} successfully`,
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Transfer error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
};

// Get user's transfer history
exports.getTransferHistory = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { page = 1, limit = 10, asset, status } = req.query;

        // Build query
        const query = {
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ]
        };

        // Add filters if provided
        if (asset) query.asset = asset;
        if (status) query.status = status;

        // Execute query with pagination
        const transfers = await Transfer.find(query)
            .populate('fromUser', 'fullName email')
            .populate('toUser', 'fullName email')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        // Get total count for pagination
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

        // Check if user is authorized to view this transfer
        const userId = req.user._id;
        if (transfer.fromUser._id.toString() !== userId.toString() && 
            transfer.toUser._id.toString() !== userId.toString() &&
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

        // Find user by wallet address
        const user = await findUserByWalletAddress(asset, address);
        
        if (user) {
            // Check if it's the current user's own address
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
        
        // Calculate total sent
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

        // Calculate total received
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

        // Get recent transfers
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