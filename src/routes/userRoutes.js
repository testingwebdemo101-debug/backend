const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const User = require('../models/User');

// @desc    Get current user data
// @route   GET /api/users/me
// @access  Private
router.get('/me', protect, async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('-password -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire');
        
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
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select('-password -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Users can only access their own data unless they're admin
        if (req.user.id !== req.params.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to access this user data'
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
});

// @desc    Update user profile
// @route   PUT /api/users/update
// @access  Private
router.put('/update', protect, async (req, res, next) => {
    try {
        const { fullName, country } = req.body;
        
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { fullName, country },
            { new: true, runValidators: true }
        ).select('-password -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire');

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
});

// Admin routes
router.use(protect, authorize('admin'));

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
router.get('/', async (req, res, next) => {
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
});

// @desc    Get ALL users (Public)
// @route   GET /api/users/all
// @access  Public
router.get('/all', async (req, res, next) => {
    try {
        const users = await User.find().select(
          '-password -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire'
        );

        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        next(error);
    }
});


module.exports = router;