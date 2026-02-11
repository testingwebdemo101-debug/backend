  const Transfer = require("../models/Transfer");

  /**
   * =====================
   * GET PENDING TRANSACTIONS
   * =====================
   */
  exports.getPendingTransactions = async (req, res) => {
    try {
      const transfers = await Transfer.find({
        status: "processing"
      })
        .populate("fromUser", "fullName email")
        .sort({ createdAt: -1 });

      const data = transfers.map((tx) => {
        let parsedNotes = {};
try {
  parsedNotes = JSON.parse(tx.notes || "{}");
} catch (e) {}
        return {
          id: tx._id,
          name: tx.fromUser?.fullName || "—",
          email: tx.fromUser?.email || "—",
          amount: `$${tx.value || 0}`,
          method:
            parsedNotes.type === "BANK_WITHDRAWAL"
              ? "Bank Transfer"
              : "Paypal",
          txid: tx._id,
          status: "pending",
          confirmations: tx.confirmations || [false, false, false, false],
          date: tx.createdAt.toISOString().split("T")[0],
          time: tx.createdAt.toTimeString().slice(0, 5)
        };
      });

      res.json({
        success: true,
        data
      });

    } catch (err) {
      console.error("Admin pending tx error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch pending transactions"
      });
    }
  };

  /**
   * =====================
   * APPROVE / REJECT / PENDING TRANSACTION
   * =====================
   */
  exports.updateTransactionStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { status, confirmations } = req.body;

      // ✅ allowed admin actions
      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status"
        });
      }

      const tx = await Transfer.findById(id);

      if (!tx) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found"
        });
      }

      // ❌ can't modify completed/failed tx
      if (["completed", "failed"].includes(tx.status)) {
        return res.status(400).json({
          success: false,
          message: "Transaction already finalized"
        });
      }

      /* =========================
        PENDING → CONFIRMATIONS
      ========================== */
      if (status === "pending") {
        if (!Array.isArray(confirmations)) {
          return res.status(400).json({
            success: false,
            message: "Confirmations array required"
          });
        }

        tx.confirmations = confirmations;
        tx.status = "processing"; // stay pending
        await tx.save();

        return res.json({
          success: true,
          message: "Confirmations updated (transaction still pending)"
        });
      }

      /* =========================
        FINAL ACTIONS
      ========================== */
      if (status === "approved") {
        tx.status = "completed";
        tx.completedAt = new Date();
      }

      if (status === "rejected") {
        tx.status = "failed";
      }

      await tx.save();

      res.json({
        success: true,
        message: `Transaction ${status} successfully`
      });

    } catch (err) {
      console.error("Update tx error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to update transaction"
      });
    }
  };

