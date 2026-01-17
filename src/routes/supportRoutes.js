const express = require("express");
const router = express.Router();

const {
  createSupport,
  getAllSupports,
  getSupportById,
  updateSupport,
} = require("../controllers/supportController");

router.post("/", createSupport);
router.get("/", getAllSupports);
router.get("/:id", getSupportById);
router.put("/:id", updateSupport); // ✅ NEW

module.exports = router;
