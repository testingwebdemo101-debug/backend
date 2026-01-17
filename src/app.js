const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require("./routes/adminRoutes");
const supportRoutes = require("./routes/supportRoutes");
const reportRoutes = require("./routes/reportRoutes");
const adminUserRoutes = require('./routes/adminUserRoutes');
const transferRoutes = require('./routes/transferRoutes');
const cryptoRoutes = require('./routes/cryptoRoutes');
const historyRoutes = require('./routes/historyRoutes'); 

// Import crypto data service
const cryptoDataService = require('./services/cryptoDataService');
const depositWalletRoutes = require("./routes/WalletRoutes");
const depbitCardRoutes = require("./routes/debitCardRoutes");
const addCoinRoutes = require("./routes/addcoin");
const bulkRoutes = require("./routes/bulkRoutes");
const bulkTransactionRoutes= require("./routes/bulkTransactionRoutes")


const app = express();

// Static files
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}));

// Rate limiting - More generous for crypto API
const cryptoLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: {
        success: false,
        error: 'Too many requests, please try again later.'
    },
    skip: (req) => req.path === '/api/health'
});
app.use('/api/crypto', cryptoLimiter);

// General rate limiting for other routes
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
});
app.use('/api', generalLimiter);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/reports", reportRoutes);
app.use('/api/admin', adminUserRoutes);
app.use('/api/history', historyRoutes);
app.use("/api", depositWalletRoutes);
app.use("/api/debit-card", depbitCardRoutes);
app.use("/api", addCoinRoutes);
app.use("/api/bulk", bulkRoutes);
app.use("/api",bulkTransactionRoutes);


// Health check with crypto service status
app.get('/api/health', (req, res) => {
    const cryptoCache = cryptoDataService.cache.get('allPrices');
    const cryptoStatus = cryptoCache ? 'Cached' : 'No Cache';
    
    res.status(200).json({ 
        status: 'OK', 
        message: 'Server is running',
        cryptoService: 'Running',
        cryptoCache: cryptoStatus,
        timestamp: new Date().toISOString()
    });
});

// Start crypto data service with longer interval
setTimeout(() => {
    cryptoDataService.startAutoUpdate(120000); // 2 minutes
}, 5000); // Start after 5 seconds

// MongoDB connection
mongoose.connection.once('open', () => {
    console.log('✅ MongoDB connected successfully');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    
    if (err.statusCode === 429) {
        return res.status(429).json({
            success: false,
            error: 'Too many requests. Please try again later.'
        });
    }
    
    res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

module.exports = app;
