const Transfer = require('../models/Transfer');
const User = require('../models/User');
const cryptoDataService = require('../services/cryptoDataService');
const safeUser = (user) => {
    if (!user) {
        return {
            id: null,
            name: "Unknown",
            email: "Unknown"
        };
    }

    return {
        id: user._id || null,
        name: user.fullName || "Unknown",
        email: user.email || "Unknown"
    };
};


// Get user's transaction history with pagination
exports.getTransactionHistory = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { page = 1, limit = 20, asset, type } = req.query;
        
        // Build query
        const query = {
            $or: [
                { fromUser: userId },
                { toUser: userId }
            ]
        };
        
        // Add filters if provided
        if (asset) {
            query.asset = asset;
        }
        
        if (type) {
            if (type === 'sent') {
                query.fromUser = userId;
            } else if (type === 'received') {
                query.toUser = userId;
            } else if (type === 'pending') {
                query.status = 'pending';
            }
        }
        
        // Execute query with pagination
        const transfers = await Transfer.find(query)
            .populate('fromUser', 'fullName email walletAddresses')
            .populate('toUser', 'fullName email walletAddresses')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();
        
        // Format the response for frontend
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
            let toAddress = '';
            
            if (transfer.status === 'pending') {
                transactionType = 'Pending';
                amountPrefix = '';
            } else if (isAdminCredit) {
                transactionType = 'Received';
                amountPrefix = '+';
                toAddress = transfer.fromAddress;
            } else if (isSender) {
                transactionType = 'Sent';
                amountPrefix = '-';
                toAddress = transfer.toAddress;
            } else if (isReceiver) {
                transactionType = 'Received';
                amountPrefix = '+';
                toAddress = transfer.fromAddress;
            }
            
            // Get coin name
            const coinNames = {
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
            
            const coinSymbol = transfer.asset.toUpperCase();
            const coinName = coinNames[transfer.asset] || coinSymbol;
            
            // Format date
            const date = new Date(transfer.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            // Format time
            const time = new Date(transfer.createdAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            // Create shortened address for display
            const shortAddress = toAddress ? 
                `${toAddress.substring(0, 6)}...${toAddress.substring(toAddress.length - 4)}` : 
                'Unknown';
            
            return {
                id: transfer._id,
                transactionId: transfer.transactionId,
                date,
                time,
                type: transactionType,
                coin: coinSymbol,
                coinName,
                to: shortAddress,
                fullAddress: toAddress,
                amount: transfer.amount,
                amountDisplay: `${transfer.amount.toFixed(8)} ${coinSymbol}`,
                usdAmount: transfer.value || 0,
                amountWithSign: `${amountPrefix}$${(transfer.value || 0).toFixed(2)}`,
                status: transfer.status,
                notes: transfer.notes,
                fee: transfer.fee,
                networkFee: transfer.networkFee,
                isSender,
                isReceiver,
                fromUser: {
                    name: transfer.fromUser.fullName,
                    email: transfer.fromUser.email
                },
                toUser: {
                    name: transfer.toUser.fullName,
                    email: transfer.toUser.email
                },
                createdAt: transfer.createdAt,
                completedAt: transfer.completedAt
            };
        });
        
        // Get total count for pagination
        const total = await Transfer.countDocuments(query);
        
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
        
        let transactionType = '';
        let amountPrefix = '';
        
        if (transfer.status === 'pending') {
            transactionType = 'Pending';
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
            currentPrice: transfer.currentPrice || 0
        };
        
        res.status(200).json({
            success: true,
            data: formattedTransfer
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
            
            let transactionType = '';
            let amountPrefix = '';
            
            if (transfer.status === 'pending') {
                transactionType = 'Pending';
                amountPrefix = '';
            } else if (isAdminCredit) {
                transactionType = 'Receive';
                amountPrefix = '+';
            } else if (isSender) {
                transactionType = 'Sent';
                amountPrefix = '-';
            } else if (isReceiver) {
                transactionType = 'Receive';
                amountPrefix = '+';
            }
            
            const coinSymbol = transfer.asset.toUpperCase();
            
            // Create shortened address
            const toAddress = isAdminCredit ? transfer.fromAddress : (isSender ? transfer.toAddress : transfer.fromAddress);
            const shortAddress = toAddress ? 
                `${toAddress.substring(0, 6)}...${toAddress.substring(toAddress.length - 4)}` : 
                'Unknown';
            
            grouped[date].push({
                id: transfer._id,
                type: transactionType,
                coin: coinSymbol,
                to: shortAddress,
                fullAddress: toAddress,
                amount: `${amountPrefix}$${(transfer.value || 0).toFixed(2)}`,
                sub: `${transfer.amount} ${coinSymbol}`,
                status: transfer.status,
                confirmations: transfer.confirmations || null,
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