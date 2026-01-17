const axios = require('axios');
const CoinData = require('../models/CoinData');

// CoinGecko API mappings for our supported coins
const COIN_MAPPINGS = {
    btc: { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
    eth: { id: 'ethereum', symbol: 'eth', name: 'Ethereum' },
    bnb: { id: 'binancecoin', symbol: 'bnb', name: 'BNB' },
    sol: { id: 'solana', symbol: 'sol', name: 'Solana' },
    xrp: { id: 'ripple', symbol: 'xrp', name: 'XRP' },
    doge: { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin' },
    ltc: { id: 'litecoin', symbol: 'ltc', name: 'Litecoin' },
    trx: { id: 'tron', symbol: 'trx', name: 'TRON' },
    usdtTron: { id: 'tether', symbol: 'usdt', name: 'Tether (TRON)' },
    usdtBnb: { id: 'tether', symbol: 'usdt', name: 'Tether (BEP-20)' }
};

// Backup static prices in case API fails
const STATIC_PRICES = {
    btc: { currentPrice: 85966.43, priceChange24h: -143.2, priceChangePercentage24h: -0.17, marketCap: 1680000000000 },
    eth: { currentPrice: 2296.54, priceChange24h: 12.45, priceChangePercentage24h: 0.54, marketCap: 276000000000 },
    bnb: { currentPrice: 596.78, priceChange24h: -3.22, priceChangePercentage24h: -0.54, marketCap: 92000000000 },
    sol: { currentPrice: 172.45, priceChange24h: 2.34, priceChangePercentage24h: 1.38, marketCap: 76000000000 },
    xrp: { currentPrice: 0.52, priceChange24h: -0.01, priceChangePercentage24h: -1.89, marketCap: 28000000000 },
    doge: { currentPrice: 0.12, priceChange24h: 0.001, priceChangePercentage24h: 0.84, marketCap: 17000000000 },
    ltc: { currentPrice: 81.34, priceChange24h: -0.45, priceChangePercentage24h: -0.55, marketCap: 6000000000 },
    trx: { currentPrice: 0.104, priceChange24h: 0.001, priceChangePercentage24h: 0.97, marketCap: 9000000000 },
    usdtTron: { currentPrice: 1.00, priceChange24h: 0.00, priceChangePercentage24h: 0.00, marketCap: 110000000000 },
    usdtBnb: { currentPrice: 1.00, priceChange24h: 0.00, priceChangePercentage24h: 0.00, marketCap: 110000000000 }
};

class CryptoDataService {
    constructor() {
        this.cache = new Map();
        this.cacheDuration = 120000; // 2 minutes for live data
        this.dbCacheDuration = 300000; // 5 minutes for DB cache
        this.lastApiCall = 0;
        this.minApiInterval = 5000; // 5 seconds between API calls
        this.requestQueue = [];
        this.isProcessingQueue = false;
    }

    // Get all coin prices with fallback
    async getAllCoinPrices() {
        try {
            // Check memory cache first
            const cached = this.getCachedPrices();
            if (cached) {
                console.log('Returning cached prices');
                return cached;
            }

            // Check database cache
            const dbCache = await this.getDbCache();
            if (dbCache) {
                console.log('Returning DB cached prices');
                // Update memory cache
                this.cache.set('allPrices', {
                    data: dbCache,
                    timestamp: Date.now()
                });
                return dbCache;
            }

            // Try API with rate limiting
            if (Date.now() - this.lastApiCall < this.minApiInterval) {
                console.log('Rate limiting, returning static data');
                return this.getStaticPrices();
            }

            const coinIds = Object.values(COIN_MAPPINGS).map(coin => coin.id);
            const uniqueCoinIds = [...new Set(coinIds)];
            
            this.lastApiCall = Date.now();
            
            const response = await axios.get(
                `https://api.coingecko.com/api/v3/coins/markets`,
                {
                    params: {
                        vs_currency: 'usd',
                        ids: uniqueCoinIds.join(','),
                        order: 'market_cap_desc',
                        per_page: 100,
                        page: 1,
                        sparkline: false,
                        price_change_percentage: '24h'
                    },
                    timeout: 8000, // Shorter timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                }
            );

            const prices = {};
            response.data.forEach(coin => {
                Object.keys(COIN_MAPPINGS).forEach(key => {
                    if (COIN_MAPPINGS[key].id === coin.id) {
                        prices[key] = {
                            currentPrice: coin.current_price || STATIC_PRICES[key].currentPrice,
                            priceChange24h: coin.price_change_24h || STATIC_PRICES[key].priceChange24h,
                            priceChangePercentage24h: coin.price_change_percentage_24h || STATIC_PRICES[key].priceChangePercentage24h,
                            marketCap: coin.market_cap || STATIC_PRICES[key].marketCap,
                            totalVolume: coin.total_volume || 0,
                            high24h: coin.high_24h || coin.current_price,
                            low24h: coin.low_24h || coin.current_price,
                            lastUpdated: new Date(),
                            sparkline: []
                        };
                    }
                });
            });

            // Fill in missing coins with static data
            Object.keys(COIN_MAPPINGS).forEach(key => {
                if (!prices[key]) {
                    prices[key] = {
                        ...STATIC_PRICES[key],
                        lastUpdated: new Date(),
                        sparkline: []
                    };
                }
            });

            // Update cache
            this.cache.set('allPrices', {
                data: prices,
                timestamp: Date.now()
            });

            // Save to database cache
            await this.saveToDbCache(prices);

            console.log('Successfully fetched live prices');
            return prices;
            
        } catch (error) {
            console.error('API Error, using fallback:', error.message);
            
            // Try database cache
            const dbCache = await this.getDbCache();
            if (dbCache) {
                this.cache.set('allPrices', {
                    data: dbCache,
                    timestamp: Date.now()
                });
                return dbCache;
            }
            
            // Return static prices as final fallback
            return this.getStaticPrices();
        }
    }

    // Get cached prices
    getCachedPrices() {
        const cached = this.cache.get('allPrices');
        if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
            return cached.data;
        }
        return null;
    }

    // Get static prices
    getStaticPrices() {
        const staticData = {};
        Object.keys(STATIC_PRICES).forEach(key => {
            staticData[key] = {
                ...STATIC_PRICES[key],
                totalVolume: 0,
                high24h: STATIC_PRICES[key].currentPrice * 1.02,
                low24h: STATIC_PRICES[key].currentPrice * 0.98,
                lastUpdated: new Date(),
                sparkline: []
            };
        });
        return staticData;
    }

    // Database cache methods
    async getDbCache() {
        try {
            const cacheData = await CoinData.find().sort({ lastUpdated: -1 }).limit(10);
            
            if (cacheData.length > 0) {
                const prices = {};
                cacheData.forEach(coin => {
                    if (coin.symbol in STATIC_PRICES) {
                        prices[coin.symbol] = {
                            currentPrice: coin.currentPrice,
                            priceChange24h: coin.priceChange24h,
                            priceChangePercentage24h: coin.priceChangePercentage24h,
                            marketCap: coin.marketCap,
                            totalVolume: coin.totalVolume,
                            high24h: coin.high24h,
                            low24h: coin.low24h,
                            lastUpdated: coin.lastUpdated,
                            sparkline: coin.chartData || []
                        };
                    }
                });
                
                // Check if cache is fresh
                const latestUpdate = Math.max(...cacheData.map(c => c.lastUpdated.getTime()));
                if (Date.now() - latestUpdate < this.dbCacheDuration) {
                    return prices;
                }
            }
            return null;
        } catch (error) {
            console.error('DB cache error:', error.message);
            return null;
        }
    }

    async saveToDbCache(prices) {
        try {
            const operations = Object.keys(prices).map(key => ({
                updateOne: {
                    filter: { symbol: key },
                    update: {
                        $set: {
                            coinId: COIN_MAPPINGS[key]?.id || key,
                            symbol: key,
                            name: COIN_MAPPINGS[key]?.name || key.toUpperCase(),
                            currentPrice: prices[key].currentPrice,
                            priceChange24h: prices[key].priceChange24h,
                            priceChangePercentage24h: prices[key].priceChangePercentage24h,
                            marketCap: prices[key].marketCap,
                            totalVolume: prices[key].totalVolume,
                            high24h: prices[key].high24h,
                            low24h: prices[key].low24h,
                            lastUpdated: new Date(),
                            chartData: []
                        }
                    },
                    upsert: true
                }
            }));

            if (operations.length > 0) {
                await CoinData.bulkWrite(operations);
            }
        } catch (error) {
            console.error('Error saving to DB cache:', error.message);
        }
    }

    // Get single coin price with fallback
    async getCoinPrice(coinSymbol) {
        try {
            const allPrices = await this.getAllCoinPrices();
            const priceData = allPrices[coinSymbol];
            
            if (priceData) {
                return {
                    price: priceData.currentPrice,
                    change24h: priceData.priceChange24h,
                    lastUpdated: priceData.lastUpdated
                };
            }
            
            // Fallback to static price
            return {
                price: STATIC_PRICES[coinSymbol]?.currentPrice || 0,
                change24h: STATIC_PRICES[coinSymbol]?.priceChange24h || 0,
                lastUpdated: new Date()
            };
        } catch (error) {
            console.error(`Error getting price for ${coinSymbol}:`, error.message);
            return {
                price: STATIC_PRICES[coinSymbol]?.currentPrice || 0,
                change24h: 0,
                lastUpdated: new Date()
            };
        }
    }

    // Get chart data with fallback
    async getCoinChartData(coinSymbol, days = 7) {
        const coin = COIN_MAPPINGS[coinSymbol];
        if (!coin) return this.generateMockChartData(days);

        try {
            const response = await axios.get(
                `https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart`,
                {
                    params: {
                        vs_currency: 'usd',
                        days: days,
                        interval: days === 1 ? 'hourly' : 'daily'
                    },
                    timeout: 10000
                }
            );

            return {
                prices: response.data.prices,
                market_caps: response.data.market_caps,
                total_volumes: response.data.total_volumes
            };
        } catch (error) {
            console.error(`Chart data error for ${coinSymbol}:`, error.message);
            return this.generateMockChartData(days);
        }
    }

    // Generate mock chart data
    generateMockChartData(days) {
        const now = Date.now();
        const prices = [];
        const basePrice = 50000;
        
        for (let i = days * 24; i >= 0; i--) {
            const timestamp = now - (i * 3600000);
            const price = basePrice * (1 + Math.sin(i * 0.1) * 0.1);
            prices.push([timestamp, price]);
        }
        
        return {
            prices: prices,
            market_caps: prices.map(([ts, price]) => [ts, price * 1000000]),
            total_volumes: prices.map(([ts, price]) => [ts, price * 10000])
        };
    }

    // Get coin detail with fallback
    async getCoinDetail(coinSymbol) {
        const coin = COIN_MAPPINGS[coinSymbol];
        if (!coin) return this.generateMockCoinDetail(coinSymbol);

        try {
            const response = await axios.get(
                `https://api.coingecko.com/api/v3/coins/${coin.id}`,
                {
                    params: {
                        localization: false,
                        tickers: false,
                        market_data: true,
                        community_data: false,
                        developer_data: false,
                        sparkline: false
                    },
                    timeout: 10000
                }
            );

            return response.data;
        } catch (error) {
            console.error(`Coin detail error for ${coinSymbol}:`, error.message);
            return this.generateMockCoinDetail(coinSymbol);
        }
    }

    // Generate mock coin detail
    generateMockCoinDetail(coinSymbol) {
        const staticPrice = STATIC_PRICES[coinSymbol] || { currentPrice: 1000, priceChange24h: 0 };
        
        return {
            id: coinSymbol,
            symbol: coinSymbol,
            name: COIN_MAPPINGS[coinSymbol]?.name || coinSymbol.toUpperCase(),
            market_data: {
                current_price: { usd: staticPrice.currentPrice },
                price_change_24h: staticPrice.priceChange24h,
                price_change_percentage_24h: staticPrice.priceChangePercentage24h,
                market_cap: { usd: staticPrice.marketCap || 0 },
                total_volume: { usd: 0 },
                high_24h: { usd: staticPrice.currentPrice * 1.02 },
                low_24h: { usd: staticPrice.currentPrice * 0.98 }
            },
            last_updated: new Date().toISOString()
        };
    }

    // Start auto-update with longer interval
    startAutoUpdate(interval = 120000) { // 2 minutes
        console.log('Starting crypto data service...');
        
        // Initial update
        this.getAllCoinPrices().then(() => {
            console.log('Initial crypto prices loaded at', new Date().toISOString());
        });

        this.updateInterval = setInterval(async () => {
            try {
                await this.getAllCoinPrices();
                console.log('Cryptocurrency prices updated at', new Date().toISOString());
            } catch (error) {
                console.error('Auto-update error:', error.message);
            }
        }, interval);
    }

    // Stop auto-update
    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}

module.exports = new CryptoDataService();