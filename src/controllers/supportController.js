const Support = require("../models/Support");

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

    const support = await Support.create({
      email,
      subject,
      description,
    });

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
