const express = require("express");
const router = express.Router();
const DebitCardApplication = require("../models/DebitCardApplication");

/* =========================
   APPLY DEBIT CARD (USER)
========================= */
router.post("/apply", async (req, res) => {
  try {
    const application = new DebitCardApplication(req.body);
    await application.save();

    res.status(201).json({
      success: true,
      message: "Debit card application submitted",
      data: application,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* =========================
   GET APPLICATION BY EMAIL
========================= */
router.get("/by-email/:email", async (req, res) => {
  try {
    const card = await DebitCardApplication.findOne({
      email: req.params.email,
    });

    if (!card) {
      return res.status(404).json({
        success: false,
        message: "No application found",
      });
    }

    res.json({ success: true, data: card });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================
   UPDATE CARD DETAILS + STATUS (ADMIN)
========================= */
router.put("/update/:id", async (req, res) => {
  try {
    const updated = await DebitCardApplication.findByIdAndUpdate(
      req.params.id,
      {
        cardNumber: req.body.cardNumber,
        expiry: req.body.expiry,
        cvv: req.body.cvv,
        status: req.body.status,
        cardType: req.body.cardType,
      },
      { new: true }
    );

    res.json({
      success: true,
      message: "Card updated successfully",
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;