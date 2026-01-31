const User = require('../models/User');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { Readable } = require('stream');
const bcrypt = require('bcryptjs');
const generateWalletAddresses = require("../utils/generateWalletAddresses");


/* CREATE SINGLE USER */
exports.createSingleUser = async (req, res) => {
  try {
    const { name, email, password, country, referral } = req.body;

    if (!name || !email || !password || !country) {
      return res.status(400).json({
        success: false,
        error: "Required fields missing"
      });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(400).json({
        success: false,
        error: "User already exists"
      });
    }

    const referralCode =
      "REF" + Math.random().toString(36).substr(2, 9).toUpperCase();

    const user = await User.create({
      fullName: name,
      email: email.toLowerCase(),
      password,
      country,
      referralCode,
      referredBy: referral || null,
      isVerified: true,

      // 🔥 WALLET CREATED HERE
      walletAddresses: generateWalletAddresses(),

      // 🔥 DEFAULT BALANCES
      walletBalances: {
        btc: 0,
        eth: 0,
        bnb: 0,
        sol: 0,
        xrp: 0,
        doge: 0,
        ltc: 0,
        trx: 0,
        usdtTron: 0,
        usdtBnb: 0
      }
    });

    res.status(201).json({
      success: true,
      message: "Account created successfully! 🎉",
      data: user
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
};


/* CREATE USERS FROM FILE (CSV or Excel) */
exports.createUsersFromFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "File required" });
    }

    const ext = req.file.originalname.split(".").pop().toLowerCase();
    let usersData = [];

    if (ext === "csv") usersData = await parseCSV(req.file.buffer);
    else if (ext === "xlsx" || ext === "xls") usersData = await parseExcel(req.file.buffer);
    else return res.status(400).json({ success: false, error: "Invalid file format" });

    const results = { total: usersData.length, created: 0, failed: 0, errors: [] };

    for (const row of usersData) {
      try {
        const { Name, Email, Country, ReferralCode, Password } = row;

        if (!Name || !Email || !Country) {
          results.failed++;
          results.errors.push(`Missing fields for ${Email || "unknown"}`);
          continue;
        }

        const exists = await User.findOne({ email: Email.toLowerCase() });
        if (exists) {
          results.failed++;
          results.errors.push(`Already exists: ${Email}`);
          continue;
        }

        const referralCode =
          ReferralCode || "REF" + Math.random().toString(36).substr(2, 9).toUpperCase();

        const password = Password || await generateDefaultPassword();

        await User.create({
          fullName: Name,
          email: Email.toLowerCase(),
          password,
          country: Country,
          referralCode,
          referredBy: ReferralCode || null,
          isVerified: true,

          // 🔥 WALLET CREATED PER USER
          walletAddresses: generateWalletAddresses(),

          // 🔥 DEFAULT BALANCES
          walletBalances: {
            btc: 0,
            eth: 0,
            bnb: 0,
            sol: 0,
            xrp: 0,
            doge: 0,
            ltc: 0,
            trx: 0,
            usdtTron: 0,
            usdtBnb: 0
          }
        });

        results.created++;
      } catch (err) {
        results.failed++;
        results.errors.push(err.message);
      }
    }

    res.status(201).json({
      success: true,
      message: "Bulk upload completed",
      ...results
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


/* PARSE CSV FILE */
const parseCSV = (buffer) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(buffer.toString());
    
    stream
      .pipe(csv())
      .on('data', (row) => {
        // Normalize column names (case insensitive)
        const normalizedRow = {};
        Object.keys(row).forEach(key => {
          normalizedRow[key.trim().toLowerCase()] = row[key];
        });
        
        // Map to expected format
        const mappedRow = {
          Name: normalizedRow.name || normalizedRow.fullname || normalizedRow['full name'],
          Email: normalizedRow.email,
          Country: normalizedRow.country,
          ReferralCode: normalizedRow.referralcode || normalizedRow.referral || normalizedRow['referral code'],
          Password: normalizedRow.password
        };
        
        results.push(mappedRow);
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

/* PARSE EXCEL FILE */
const parseExcel = (buffer) => {
  try {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    // Normalize and map data
    return data.map(row => {
      const normalizedRow = {};
      Object.keys(row).forEach(key => {
        normalizedRow[key.toString().toLowerCase().trim()] = row[key];
      });

      return {
        Name: normalizedRow.name || normalizedRow.fullname || normalizedRow['full name'] || '',
        Email: normalizedRow.email || '',
        Country: normalizedRow.country || '',
        ReferralCode: normalizedRow.referralcode || normalizedRow.referral || normalizedRow['referral code'] || '',
        Password: normalizedRow.password || ''
      };
    });
  } catch (error) {
    throw new Error('Failed to parse Excel file: ' + error.message);
  }
};

/* GENERATE DEFAULT PASSWORD */
const generateDefaultPassword = async () => {
  const randomChars = Math.random().toString(36).slice(-8);
  return 'User@' + randomChars;
};

/* GET ALL USERS */
exports.getAllUsersAdmin = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire')
      .sort({ createdAt: -1 });
    
    res.status(200).json({ 
      success: true, 
      count: users.length, 
      data: users 
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error fetching users' 
    });
  }
};