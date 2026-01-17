const mongoose = require('mongoose');

const CurrencySchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['crypto', 'fiat'],
    default: 'crypto'
  },
  network: {
    type: String
  },
  iconUrl: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  minDeposit: {
    type: Number,
    default: 0
  },
  maxDeposit: {
    type: Number,
    default: 100000
  },
  precision: {
    type: Number,
    default: 8
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save to ensure code is uppercase
CurrencySchema.pre('save', function(next) {
  this.code = this.code.toUpperCase();
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Currency', CurrencySchema);