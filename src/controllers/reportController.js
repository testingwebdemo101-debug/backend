const Report = require("../models/Report");
const sendZeptoTemplateMail = require("../utils/sendZeptoTemplateMail");

/* ===============================
   CREATE REPORT (USER)
================================ */
/* ===============================
   CREATE REPORT (USER)
================================ */
exports.createReport = async (req, res, next) => {
  try {
    const { userEmail, reportedEmail, description } = req.body;

    if (!userEmail || !reportedEmail || !description) {
      return res.status(400).json({
        success: false,
        error: "All fields are required"
      });
    }

    const report = await Report.create({
      userEmail,
      reportedEmail,
      description,
      attachment: null
    });

    // ✅ SEND CONFIRMATION EMAIL
    try {
      await sendZeptoTemplateMail({
        to: userEmail,
        templateKey: process.env.TPL_REPORT_TIKET_CONFIRMATION,
        mergeInfo: {
          userName: userEmail.split("@")[0],
          ticketId: report._id,
          subject: `Report against ${reportedEmail}`,
          currentYear: new Date().getFullYear()
        }
      });

      console.log("✅ Report confirmation email sent");
    } catch (mailError) {
      console.error("❌ Failed to send report email:", mailError.message);
    }

    res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      data: report
    });

  } catch (error) {
    next(error);
  }
};

/* ===============================
   GET ALL REPORTS (ADMIN)
================================ */
exports.getAllReports = async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");

    const reports = await Report.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error) {
    next(error);
  }
};


/* ===============================
   RESOLVE REPORT (ADMIN)
================================ */
exports.resolveReport = async (req, res, next) => {
  try {
    const { actionTaken } = req.body;

    if (!actionTaken) {
      return res.status(400).json({
        success: false,
        error: "Action taken is required"
      });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        status: "RESOLVED",
        actionTaken
      },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        error: "Report not found"
      });
    }

    // ✅ AUTO-DELETE AFTER RESOLVED
    await Report.findByIdAndDelete(report._id);

    res.status(200).json({
      success: true,
      message: "Report resolved and automatically removed",
      data: null
    });
  } catch (error) {
    next(error);
  }
};
