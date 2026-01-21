require("dotenv").config();
const app = require('./src/app');
const connectDB = require('./src/config/database');
const User = require('./src/models/User');
require("dotenv").config();


connectDB();

// 🔐 CREATE ADMIN IF NOT EXISTS (UNCHANGED)
const createAdminUser = async () => {
  try {
    const adminEmail = "bitabox860@gmail.com";

    const adminExists = await User.findOne({ email: adminEmail });

    if (!adminExists) {
      await User.create({
        fullName: "Admin",
        email: adminEmail,
        password: "Bitabox@123",
        country: "India",
        isVerified: true,
        role: "admin"
      });

      console.log("✅ Admin user created successfully");
    } else {
      console.log("ℹ️ Admin already exists");
    }
  } catch (error) {
    console.error("❌ Admin creation error:", error.message);
  }
};

// Run once on startup
createAdminUser();

// ✅ REQUIRED FOR RENDER (THIS PART IS CRITICAL)
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('unhandledRejection', (err) => {
  console.error(`❌ Error: ${err.message}`);
  server.close(() => process.exit(1));
});
