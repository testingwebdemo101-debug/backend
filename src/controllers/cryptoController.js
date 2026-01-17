const cryptoDataService = require('../services/cryptoDataService');
const User = require('../models/User');

// Helper function to get coin name
function getCoinName(symbol) {
    const names = {
        btc: 'Bitcoin',
        eth: 'Ethereum',
        bnb: 'BNB',
        sol: 'Solana',
        xrp: 'XRP',
        doge: 'Dogecoin',
        ltc: 'Litecoin',
        trx: 'TRON',
        usdtTron: 'Tether (TRON)',
        usdtBnb: 'Tether (BEP-20)'
    };
    return names[symbol] || symbol.toUpperCase();
}

// Get all coin prices with user balances
exports.getDashboardData = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get current prices
        const prices = await cryptoDataService.getAllCoinPrices();
        
        if (!prices) {
            return res.status(503).json({
                success: false,
                error: 'Unable to fetch cryptocurrency data'
            });
        }

        // Calculate portfolio value
        let totalPortfolioValue = 0;
        const assets = [];

        // Prepare assets data with real-time prices
        Object.keys(user.walletBalances).forEach(coinSymbol => {
            const balance = user.walletBalances[coinSymbol] || 0;
            const priceData = prices[coinSymbol];
            
            if (priceData) {
                const currentPrice = priceData.currentPrice;
                const balanceValue = balance * currentPrice;
                totalPortfolioValue += balanceValue;

                assets.push({
                    symbol: coinSymbol.toUpperCase(),
                    name: getCoinName(coinSymbol),
                    balance: balance,
                    balanceValue: balanceValue,
                    currentPrice: currentPrice,
                    priceChange24h: priceData.priceChange24h,
                    priceChangePercentage24h: priceData.priceChangePercentage24h,
                    marketCap: priceData.marketCap,
                    totalVolume: priceData.totalVolume,
                    high24h: priceData.high24h,
                    low24h: priceData.low24h,
                    lastUpdated: priceData.lastUpdated,
                    chartData: priceData.sparkline
                });
            }
        });

        // Sort by balance value (highest first)
        assets.sort((a, b) => b.balanceValue - a.balanceValue);

        res.json({
            success: true,
            data: {
                totalPortfolioValue,
                assets,
                lastUpdated: new Date()
            }
        });
    } catch (error) {
        console.error('Dashboard data error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard data'
        });
    }
};

// Get live price for specific coin
exports.getLivePrice = async (req, res) => {
    try {
        const { coin } = req.params;
        
        if (!coin) {
            return res.status(400).json({
                success: false,
                error: 'Coin symbol is required'
            });
        }

        const priceData = await cryptoDataService.getCoinPrice(coin.toLowerCase());
        
        if (!priceData) {
            return res.status(404).json({
                success: false,
                error: 'Coin not found or price unavailable'
            });
        }

        res.json({
            success: true,
            data: priceData
        });
    } catch (error) {
        console.error('Live price error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch live price'
        });
    }
};

// Get chart data for a coin
exports.getChartData = async (req, res) => {
    try {
        const { coin } = req.params;
        const { days = '7' } = req.query;
        
        const chartData = await cryptoDataService.getCoinChartData(
            coin.toLowerCase(),
            parseInt(days)
        );

        res.json({
            success: true,
            data: chartData
        });
    } catch (error) {
        console.error('Chart data error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chart data'
        });
    }
};

// Get coin detail
exports.getCoinDetail = async (req, res) => {
    try {
        const { coin } = req.params;
        
        const detail = await cryptoDataService.getCoinDetail(coin.toLowerCase());
        
        res.json({
            success: true,
            data: detail
        });
    } catch (error) {
        console.error('Coin detail error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch coin detail'
        });
    }
};

// Get user's portfolio summary
exports.getPortfolioSummary = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const prices = await cryptoDataService.getAllCoinPrices();
        
        if (!prices) {
            return res.status(503).json({
                success: false,
                error: 'Unable to fetch cryptocurrency data'
            });
        }

        // Calculate portfolio metrics
        let totalValue = 0;
        let totalChange24h = 0;
        let totalInvestment = 0;
        const coinBreakdown = [];

        Object.keys(user.walletBalances).forEach(coinSymbol => {
            const balance = user.walletBalances[coinSymbol] || 0;
            const priceData = prices[coinSymbol];
            
            if (priceData && balance > 0) {
                const value = balance * priceData.currentPrice;
                totalValue += value;
                totalChange24h += value * (priceData.priceChangePercentage24h / 100);
                
                coinBreakdown.push({
                    symbol: coinSymbol.toUpperCase(),
                    balance: balance,
                    value: value,
                    price: priceData.currentPrice,
                    change24h: priceData.priceChangePercentage24h,
                    allocation: 0
                });
            }
        });

        // Calculate allocations
        coinBreakdown.forEach(coin => {
            coin.allocation = (coin.value / totalValue) * 100;
        });

        // Calculate overall portfolio change percentage
        const portfolioChangePercentage = totalValue > 0 ? 
            (totalChange24h / totalValue) * 100 : 0;

        res.json({
            success: true,
            data: {
                totalValue,
                totalChange: totalChange24h,
                portfolioChangePercentage,
                totalInvestment,
                profitLoss: totalValue - totalInvestment,
                profitLossPercentage: totalInvestment > 0 ? 
                    ((totalValue - totalInvestment) / totalInvestment) * 100 : 0,
                coinBreakdown,
                lastUpdated: new Date()
            }
        });
    } catch (error) {
        console.error('Portfolio summary error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch portfolio summary'
        });
    }
};

// Get real-time ticker for all coins
exports.getTicker = async (req, res) => {
    try {
        const prices = await cryptoDataService.getAllCoinPrices();
        
        if (!prices) {
            return res.status(503).json({
                success: false,
                error: 'Unable to fetch ticker data'
            });
        }

        const ticker = Object.keys(prices).map(coinSymbol => ({
            symbol: coinSymbol.toUpperCase(),
            name: getCoinName(coinSymbol),
            price: prices[coinSymbol].currentPrice,
            change: prices[coinSymbol].priceChange24h,
            changePercent: prices[coinSymbol].priceChangePercentage24h,
            volume: prices[coinSymbol].totalVolume,
            marketCap: prices[coinSymbol].marketCap
        }));

        res.json({
            success: true,
            data: ticker,
            lastUpdated: new Date()
        });
    } catch (error) {
        console.error('Ticker error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch ticker data'
        });
    }
};

// Get real-time portfolio with live prices
exports.getRealTimePortfolio = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const portfolio = await user.getAssetBreakdown();
        const prices = await cryptoDataService.getAllCoinPrices();

        // Add live price data
        portfolio.breakdown = portfolio.breakdown.map(asset => {
            const priceData = prices ? prices[asset.symbol] : null;
            return {
                ...asset,
                priceChange24h: priceData ? priceData.priceChange24h : 0,
                priceChangePercentage24h: priceData ? priceData.priceChangePercentage24h : 0,
                chartData: priceData ? priceData.sparkline : []
            };
        });

        res.json({
            success: true,
            data: portfolio
        });
    } catch (error) {
        console.error('Portfolio error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch portfolio'
        });
    }
};