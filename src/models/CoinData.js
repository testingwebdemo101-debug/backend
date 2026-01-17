const mongoose = require('mongoose');

const CoinDataSchema = new mongoose.Schema({
  coinId: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  currentPrice: {
    type: Number,
    required: true
  },
  priceChange24h: {
    type: Number,
    default: 0
  },
  priceChangePercentage24h: {
    type: Number,
    default: 0
  },
  marketCap: {
    type: Number,
    default: 0
  },
  totalVolume: {
    type: Number,
    default: 0
  },
  high24h: {
    type: Number,
    default: 0
  },
  low24h: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  chartData: [{
    timestamp: Number,
    price: Number
  }]
});

// Index for faster queries
CoinDataSchema.index({ coinId: 1, lastUpdated: -1 });
CoinDataSchema.index({ symbol: 1 });

module.exports = mongoose.model('CoinData', CoinDataSchema);