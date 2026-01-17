const express = require("express");
const {
  getAllUsers,
  updateUser,
  suspendUser,
  unsuspendUser,
  deleteUser
} = require("../controllers/adminController");

const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(protect, authorize("admin"));

router.get("/users", getAllUsers);
router.put("/users/:id", updateUser);
router.put("/users/:id/suspend", suspendUser);
router.put("/users/:id/unsuspend", unsuspendUser);
router.delete("/users/:id", deleteUser);

module.exports = router;
