const mongoose = require('mongoose');

const TransferSchema = new mongoose.Schema({
  fromUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  toUser: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required: false
},

  fromAddress: {
    type: String,
    required: true
  },
  toAddress: {
    type: String,
    required: true
  },
  asset: {
    type: String,
    enum: ['btc', 'bnb', 'usdtTron', 'trx', 'usdtBnb', 'eth', 'sol', 'xrp', 'doge', 'ltc'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.000001
  },
  value: {  // Add this field - USD value at time of transfer
    type: Number,
    default: 0
  },

  
  currentPrice: {  // Add this field - price per coin at time of transfer
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
  },
  transactionId: {
    type: String,
    unique: true
  },
  notes: {
    type: String,
    default: ''
  },
  fee: {
    type: Number,
    default: 0
  },
  networkFee: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
});

// Generate transaction ID before saving
TransferSchema.pre('save', function(next) {
  if (!this.transactionId) {
    this.transactionId = 'TRX' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Transfer', TransferSchema);