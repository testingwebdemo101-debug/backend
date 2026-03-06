
const Support = require("../models/Support");
const sendZeptoTemplateMail = require("../utils/sendZeptoTemplateMail"); // ✅ ADD THIS

/* CREATE SUPPORT */
exports.createSupport = async (req, res, next) => {
  try {
    const { email, subject, description } = req.body;

    if (!email || !subject || !description) {
      return res.status(400).json({
        success: false,
        error: "All fields are required",
      });
    }

    // ✅ CREATE TICKET
    const support = await Support.create({
      email,
      subject,
      description,
    });

    // ✅ SEND CONFIRMATION EMAIL TO USER (DOES NOT AFFECT MAIN FLOW)
    try {
      await sendZeptoTemplateMail({
        to: email,
        templateKey: process.env.TPL_SUPPORT_TIKET_CONFIRMATION,
        mergeInfo: {
          userName: email.split("@")[0], // simple username from email
          ticketId: support._id,
          subject: subject,
        },
      });

      console.log("✅ Support confirmation email sent");
    } catch (mailError) {
      console.error("❌ Failed to send support confirmation email:", mailError.message);
    }

    res.status(201).json({
      success: true,
      message: "Support ticket created successfully",
      data: support,
    });

  } catch (error) {
    next(error);
  }
};
/* UPDATE SUPPORT STATUS & ACTION */
exports.updateSupport = async (req, res, next) => {
  try {
    const { status, actionTaken } = req.body;

    const support = await Support.findById(req.params.id);
    if (!support) {
      return res.status(404).json({
        success: false,
        error: "Support ticket not found",
      });
    }

    support.status = status || support.status;
    support.actionTaken = actionTaken || support.actionTaken;

    await support.save();

    // ✅ AUTO-DELETE IF STATUS IS "resolved"
    if (support.status === "resolved") {
      await Support.findByIdAndDelete(support._id);
      
      return res.status(200).json({
        success: true,
        message: "Support ticket resolved and automatically removed",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      message: "Support ticket updated successfully",
      data: support,
    });
  } catch (error) {
    next(error);
  }
};

/* GET ALL */
exports.getAllSupports = async (req, res, next) => {
  try {
    const supports = await Support.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: supports });
  } catch (error) {
    next(error);
  }
};

/* GET SINGLE */
exports.getSupportById = async (req, res, next) => {
  try {
    const support = await Support.findById(req.params.id);
    if (!support) {
      return res.status(404).json({ success: false, error: "Not found" });
    }
    res.status(200).json({ success: true, data: support });
  } catch (error) {
    next(error);
  }
};
