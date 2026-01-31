const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");
const mongoose = require("mongoose");



// Import routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const supportRoutes = require("./routes/supportRoutes");
const reportRoutes = require("./routes/reportRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const transferRoutes = require("./routes/transferRoutes");
const cryptoRoutes = require("./routes/cryptoRoutes");
const historyRoutes = require("./routes/historyRoutes");
const depositWalletRoutes = require("./routes/WalletRoutes");
const debitCardRoutes = require("./routes/debitCardRoutes");
const addCoinRoutes = require("./routes/addcoin");
const bulkRoutes = require("./routes/bulkRoutes");
const bulkTransactionRoutes = require("./routes/bulkTransactionRoutes");
const trustWalletRoutes = require("./routes/trustWalletRoutes"); // ✅ NEW

// Crypto service
const cryptoDataService = require("./services/cryptoDataService");

const app = express();

/* =========================
   STATIC FILES
========================= */
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use(express.static("public"));

/* =========================
   SECURITY
========================= */
app.use(helmet());


const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://frontend-instacoinpay.vercel.app",
  "https://instacoinxpay.com",
  "https://www.instacoinxpay.com"
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman / server-to-server
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true, // 🔥 REQUIRED
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cache-Control",
      "Pragma"
    ]
  })
);

/* 🔥 FIXED preflight handler */
app.options(
  "*",
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);


// ✅ SINGLE preflight handler (VERY IMPORTANT)
app.options("*", cors());

/* =========================
   RATE LIMITING
========================= */
const cryptoLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: "Too many requests, please try again later."
  },
  skip: (req) => req.path === "/api/health"
});
app.use("/api/crypto", cryptoLimiter);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use("/api", generalLimiter);

/* =========================
   BODY PARSER
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   LOGGING
========================= */
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

/* =========================
   ROUTES
========================= */
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/transfer", transferRoutes);
app.use("/api/crypto", cryptoRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminUserRoutes);
app.use("/api/history", historyRoutes);
app.use("/api", depositWalletRoutes);
app.use("/api/debit-card", debitCardRoutes);
app.use("/api", addCoinRoutes);
app.use("/api/bulk", bulkRoutes);
app.use("/api", bulkTransactionRoutes);
app.use("/api/trust-wallet", trustWalletRoutes); // ✅ NEW

/* =========================
   HEALTH CHECK
========================= */
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

/* =========================
   CRYPTO AUTO UPDATE
========================= */
setTimeout(() => {
  cryptoDataService.startAutoUpdate(120000);
}, 5000);

/* =========================
   DATABASE
========================= */
mongoose.connection.once("open", () => {
  console.log("✅ MongoDB connected successfully");
});

/* =========================
   ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);

  if (err.statusCode === 429) {
    return res.status(429).json({
      success: false,
      error: "Too many requests. Please try again later."
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || "Internal Server Error"
  });
});

/* =========================
   404 HANDLER
========================= */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found"
  });
});

module.exports = app;