const express = require('express');
const {
    getStarted,
    register,
    verifyEmail,
    resendVerification,
    forgotPassword,
    verifyResetCode,
    resetPassword,
    login,
    getAllUsers,
    getUser,
    resendForgotPasswordOTP,
    sendPasswordResetSuccessMail,
} = require('../controllers/authController');


const router = express.Router();

// Public routes
router.post('/get-started', getStarted);
router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);


// Get all users (Public - no auth required)
router.get('/users', getAllUsers);
router.get('/users/:id', getUser);
router.post("/resend-forgot-password-otp", resendForgotPasswordOTP);
router.post( "/password-reset-success-mail",sendPasswordResetSuccessMail);



module.exports = router;

