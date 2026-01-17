const express = require("express");
const router = express.Router();

const {
  createReport,
  getAllReports,
  resolveReport
} = require("../controllers/reportController");

const { protect, authorize } = require("../middleware/auth");

/* USER */
router.post("/", createReport);

/* ADMIN */
router.get("/", protect, authorize("admin"), getAllReports);
router.put("/:id/resolve", protect, authorize("admin"), resolveReport);

module.exports = router;
