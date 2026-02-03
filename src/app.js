const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");
const mongoose = require("mongoose");

// =========================
// IMPORT ROUTES
// =========================
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const supportRoutes = require("./routes/supportRoutes");
const reportRoutes = require("./routes/reportRoutes");
const transferRoutes = require("./routes/transferRoutes");
const cryptoRoutes = require("./routes/cryptoRoutes");
const historyRoutes = require("./routes/historyRoutes");
const depositWalletRoutes = require("./routes/WalletRoutes");
const debitCardRoutes = require("./routes/debitCardRoutes");
const addCoinRoutes = require("./routes/addcoin");
const bulkRoutes = require("./routes/bulkRoutes");
const bulkTransactionRoutes = require("./routes/bulkTransactionRoutes");
const trustWalletRoutes = require("./routes/trustWalletRoutes");

// Crypto service
const cryptoDataService = require("./services/cryptoDataService");

const app = express();

// =========================
// STATIC FILES
// =========================
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use(express.static("public"));

// =========================
// SECURITY
// =========================
app.use(helmet());

// =========================
// BODY PARSER
// =========================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// LOGGING
// =========================
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// =========================
// CORS (FIXED & SAFE)
// =========================
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://frontend-instacoinpay.vercel.app",
  "https://instacoinxpay.com",
  "https://www.instacoinxpay.com",
  "https://instacoinxspay.xyz",
  "https://www.instacoinxspay.xyz"
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true
  })
);

// REQUIRED FOR PREFLIGHT
app.options("*", cors());

// =========================
// RATE LIMITING
// =========================

// Crypto-only limiter
const cryptoLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: "Too many requests, please try again later."
  }
});
app.use("/api/crypto", cryptoLimiter);

// =========================
// ROUTES (AUTH FIRST 🔥)
// =========================
app.use("/api/auth", authRoutes);

// General limiter AFTER auth
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use("/api", generalLimiter);

// Other routes
app.use("/api/users", userRoutes);
app.use("/api/transfer", transferRoutes);
app.use("/api/crypto", cryptoRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminUserRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/history", historyRoutes);
app.use("/api", depositWalletRoutes);
app.use("/api/debit-card", debitCardRoutes);
app.use("/api", addCoinRoutes);
app.use("/api/bulk", bulkRoutes);
app.use("/api", bulkTransactionRoutes);
app.use("/api/trust-wallet", trustWalletRoutes);

// =========================
// HEALTH CHECK
// =========================
app.get("/api/health", (req, res) => {
  const cryptoCache = cryptoDataService.cache.get("allPrices");

  res.status(200).json({
    status: "OK",
    message: "Server is running",
    cryptoService: "Running",
    cryptoCache: cryptoCache ? "Cached" : "No Cache",
    timestamp: new Date().toISOString()
  });
});

// =========================
// CRYPTO AUTO UPDATE
// =========================
setTimeout(() => {
  cryptoDataService.startAutoUpdate(120000);
}, 5000);

// =========================
// DATABASE EVENTS
// =========================
mongoose.connection.once("open", () => {
  console.log("✅ MongoDB connected successfully");
});

// =========================
// ERROR HANDLER
// =========================
app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || "Internal Server Error"
  });
});

// =========================
// 404 HANDLER
// =========================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found"
  });
});

module.exports = app;
