const express = require('express');
const router = express.Router();
const {
  createSingleUser,
  createUsersFromFile,
  getAllUsersAdmin,
} = require('../controllers/adminUserController');

const { protect, authorize } = require('../middleware/auth');
const uploadFile = require('../middleware/uploadFile');

// All routes require admin authorization
router.use(protect, authorize('admin'));

// Single user creation
router.post('/users', createSingleUser);

// Bulk user creation from file
router.post('/users/upload', uploadFile.single('file'), createUsersFromFile);

// Get all users
router.get('/users', getAllUsersAdmin);

module.exports = router;