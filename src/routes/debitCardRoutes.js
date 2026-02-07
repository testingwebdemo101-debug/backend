const express = require("express");
const router = express.Router();
const DebitCardApplication = require("../models/DebitCardApplication");

router.post("/test-create", async (req, res) => {
  try {
    const application = new DebitCardApplication({
      cardType: "",
      fullName: "",
      email: "",
      cardNumber: "",
      expiry: "",
      cvv: "",
      whatsapp: "",
      address: "",
      zipcode: "",
      country: "",
      status: ""
    });
    await application.save();
    res.json({ success: true, data: application });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


/* =========================
   APPLY DEBIT CARD (USER)
========================= */
/* =========================
   APPLY DEBIT CARD (USER)
   ONE EMAIL = ONE FILE
========================= */
router.post("/apply", async (req, res) => {
  try {
    const { email } = req.body;

    // 🔍 Check if application already exists
    const existing = await DebitCardApplication.findOne({ email });

    if (existing) {
      // 🔁 UPDATE old file instead of creating new
      existing.cardType = req.body.cardType || existing.cardType;
      existing.fullName = req.body.fullName || existing.fullName;
      existing.whatsapp = req.body.whatsapp || existing.whatsapp;
      existing.address = req.body.address || existing.address;
      existing.zipcode = req.body.zipcode || existing.zipcode;
      existing.country = req.body.country || existing.country;

      // reset status if re-applied
     existing.status = "INACTIVE";


      await existing.save();

      return res.status(200).json({
        success: true,
        message: "Application updated successfully",
        data: existing,
        mode: "UPDATED",
      });
    }

    // 🆕 CREATE only if not exists
    const application = new DebitCardApplication({
      ...req.body,
      status: "INACTIVE",

    });

    await application.save();

    res.status(201).json({
      success: true,
      message: "Debit card application submitted",
      data: application,
      mode: "CREATED",
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

    // ⛔ Hide sensitive data unless ACTIVE
    const safeCard = {
      _id: card._id,
      fullName: card.fullName,
      email: card.email,
      cardType: card.cardType,
      status: card.status,
    };

    if (card.status === "ACTIVATE") {
      safeCard.cardNumber = card.cardNumber;
      safeCard.expiry = card.expiry;
      safeCard.cvv = card.cvv;
    }

    res.json({ success: true, data: safeCard });
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

/* =========================
   GET ALL CARD APPLICATIONS (ADMIN)
========================= */
router.get("/admin/active-pending", async (req, res) => {
  try {
    const cards = await DebitCardApplication.find({
      status: { $in: ["INACTIVE", "PENDING", "ACTIVATE"] }
    }).select("fullName email status cardType");

    res.json({
      success: true,
      data: cards
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});



module.exports = router;