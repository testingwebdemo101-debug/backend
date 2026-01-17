const Transfer = require('../models/Transfer');
const User = require('../models/User');
const cryptoDataService = require('../services/cryptoDataService');

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
exports.createTransfer = async (req, res, next) => {
    const session = await Transfer.startSession();
    session.startTransaction();

    try {
        const { asset, toAddress, amount, notes } = req.body;
        const fromUser = req.user;

        // Validate inputs
        if (!asset || !toAddress || !amount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                error: 'Please provide asset, recipient address, and amount'
            });
        }

        // Check if amount is valid
        if (amount <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                error: 'Amount must be greater than 0'
            });
        }

        // Get fresh user data in session
        const fromUserFresh = await User.findById(fromUser._id).session(session);
        
        // Check if sender has enough balance
        if (!fromUserFresh.walletBalances[asset] || fromUserFresh.walletBalances[asset] < amount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                error: `Insufficient ${asset.toUpperCase()} balance`
            });
        }

        // Find recipient by wallet address
        const toUser = await findUserByWalletAddress(asset, toAddress);
        
        if (!toUser) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                error: 'Recipient not found with this wallet address'
            });
        }

        // Prevent self-transfer
        if (fromUser._id.toString() === toUser._id.toString()) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                error: 'Cannot transfer to your own wallet'
            });
        }

        // Get sender's wallet address for this asset
        const fromAddress = fromUserFresh.walletAddresses[asset];
        if (!fromAddress) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                error: 'Sender does not have a wallet address for this asset'
            });
        }

        // Get current price for value calculation
        let currentPrice = 0;
        try {
            const priceData = await cryptoDataService.getCoinPrice(asset);
            currentPrice = priceData ? priceData.price : 0;
        } catch (error) {
            console.log('Price fetch error, using 0:', error.message);
        }

        // Create transfer record
        const transfer = new Transfer({
            fromUser: fromUserFresh._id,
            toUser: toUser._id,
            fromAddress,
            toAddress,
            asset,
            amount,
            value: amount * currentPrice,
            currentPrice,
            notes: notes || '',
            fee: 0,
            networkFee: 0,
            status: 'completed',
            completedAt: Date.now()
        });

        // Get fresh recipient data
        const toUserFresh = await User.findById(toUser._id).session(session);

        // Process the transfer (deduct from sender, add to recipient)
        // Deduct from sender
        fromUserFresh.walletBalances[asset] = 
            parseFloat((fromUserFresh.walletBalances[asset] - amount).toFixed(8));

        // Add to recipient
        toUserFresh.walletBalances[asset] = 
            parseFloat((toUserFresh.walletBalances[asset] + amount).toFixed(8));

        // Save all changes
        await fromUserFresh.save({ session });
        await toUserFresh.save({ session });
        await transfer.save({ session });

        // Commit transaction
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: 'Transfer completed successfully',
            data: {
                transfer: {
                     _id: transfer._id,               // ✅ ADD THIS
      transactionId: transfer.transactionId,
      amount: transfer.amount,
      asset: transfer.asset,
      toAddress: transfer.toAddress,
      timestamp: transfer.completedAt
                },
                sender: {
                    remainingBalance: fromUserFresh.walletBalances[asset]
                }
            }
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Transfer error:', error);
        res.status(500).json({
            success: false,
            error: 'Transfer failed: ' + error.message
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

// Get transfer summary (REMOVED DUPLICATE - FIX FOR THE ERROR)
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