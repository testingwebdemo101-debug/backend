const axios = require('axios');
const CoinData = require('../models/CoinData');
const mongoose = require('mongoose');
const coingecko = require("../utils/coingeckoClient");

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

// Configuration - Use environment variables in production
const CONFIG = {
    CACHE_DURATION: parseInt(process.env.CACHE_DURATION) || 240000, // 4 minutes
    DB_CACHE_DURATION: parseInt(process.env.DB_CACHE_DURATION) || 300000, // 5 minutes
    MIN_API_INTERVAL: parseInt(process.env.MIN_API_INTERVAL) || 180000, // 3 minutes
    AUTO_UPDATE_INTERVAL: parseInt(process.env.AUTO_UPDATE_INTERVAL) || 360000, // 6 minutes
    MAX_CACHE_SIZE: parseInt(process.env.MAX_CACHE_SIZE) || 100,
    TIMEOUTS: {
        PRICE_API: parseInt(process.env.PRICE_API_TIMEOUT) || 10000,
        CHART_API: parseInt(process.env.CHART_API_TIMEOUT) || 15000,
        DETAIL_API: parseInt(process.env.DETAIL_API_TIMEOUT) || 10000
    },
    RETRY: {
        MAX_RETRIES: parseInt(process.env.MAX_RETRIES) || 2,
        BASE_DELAY: parseInt(process.env.RETRY_BASE_DELAY) || 1000
    }
};

// CoinGecko API mappings for our supported coins
const COIN_MAPPINGS = {
    btc: { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', binanceSymbol: 'BTCUSDT' },
    eth: { id: 'ethereum', symbol: 'eth', name: 'Ethereum', binanceSymbol: 'ETHUSDT' },
    bnb: { id: 'binancecoin', symbol: 'bnb', name: 'BNB', binanceSymbol: 'BNBUSDT' },
    sol: { id: 'solana', symbol: 'sol', name: 'Solana', binanceSymbol: 'SOLUSDT' },
    xrp: { id: 'ripple', symbol: 'xrp', name: 'XRP', binanceSymbol: 'XRPUSDT' },
    doge: { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', binanceSymbol: 'DOGEUSDT' },
    ltc: { id: 'litecoin', symbol: 'ltc', name: 'Litecoin', binanceSymbol: 'LTCUSDT' },
    trx: { id: 'tron', symbol: 'trx', name: 'TRON', binanceSymbol: 'TRXUSDT' },
    usdtTron: { id: 'tether', symbol: 'usdt', name: 'Tether (TRON)', binanceSymbol: 'USDTUSDT' },
    usdtBnb: { id: 'tether', symbol: 'usdt', name: 'Tether (BEP-20)', binanceSymbol: 'BUSDUSDT' }
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
        this.maxCacheSize = CONFIG.MAX_CACHE_SIZE;
        this.cacheDuration = CONFIG.CACHE_DURATION;
        this.dbCacheDuration = CONFIG.DB_CACHE_DURATION;
        this.lastApiCall = 0;
        this.minApiInterval = CONFIG.MIN_API_INTERVAL;
        
        this.activeFetch = null; // For request deduplication
        this.updateInterval = null;
        
        // Stats for monitoring
        this.stats = {
            apiCalls: 0,
            cacheHits: 0,
            dbCacheHits: 0,
            staticFallbacks: 0,
            errors: 0
        };
    }

    /**
     * Retry helper with exponential backoff
     */
    async retryWithBackoff(fn, maxRetries = CONFIG.RETRY.MAX_RETRIES, baseDelay = CONFIG.RETRY.BASE_DELAY) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                
                const delay = baseDelay * Math.pow(2, i);
                console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms - Error: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Get all coin prices with fallback chain
     */
    async getAllCoinPrices() {
        // Request deduplication - if already fetching, wait for that request
        if (this.activeFetch) {
            console.log('Request deduplication: Waiting for active fetch');
            return await this.activeFetch;
        }
        
        this.activeFetch = this._getAllCoinPricesInternal();
        try {
            return await this.activeFetch;
        } finally {
            this.activeFetch = null;
        }
    }
    
    async _getAllCoinPricesInternal() {
        try {
            // Check memory cache first
            const cached = this.getCachedPrices();
            if (cached) {
                console.log('✓ Returning cached prices from memory');
                this.stats.cacheHits++;
                return cached;
            }

            // Check database cache
            const dbCache = await this.getDbCache();
            if (dbCache) {
                console.log('✓ Returning cached prices from database');
                this.stats.dbCacheHits++;
                this.setCacheWithLimit('allPrices', {
                    data: dbCache,
                    timestamp: Date.now()
                });
                return dbCache;
            }

            // Try API with rate limiting
            const timeSinceLastCall = Date.now() - this.lastApiCall;
            if (timeSinceLastCall < this.minApiInterval) {
                console.log(`⏱ Rate limit: ${Math.ceil((this.minApiInterval - timeSinceLastCall) / 1000)}s until next API call`);
                const cached = this.getCachedPrices();
                if (cached) return cached;
                
                const dbCache = await this.getDbCache();
                if (dbCache) return dbCache;
                
                console.log('⚠ Using static fallback due to rate limit');
                this.stats.staticFallbacks++;
                return this.getStaticPrices();
            }

            this.lastApiCall = Date.now();
            
            // Try CoinGecko API with retry
            let prices = await this.retryWithBackoff(() => this.fetchFromCoinGecko());
            
            if (!prices) {
                console.log('⚠ CoinGecko failed, trying Binance fallback');
                prices = await this.retryWithBackoff(() => this.fetchFromBinance());
            }
            
            if (!prices) {
                console.log('⚠ All APIs failed, using static fallback');
                this.stats.staticFallbacks++;
                return this.getStaticPrices();
            }

            this.stats.apiCalls++;

            // Fill in missing coins with static data
            Object.keys(COIN_MAPPINGS).forEach(key => {
                if (!prices[key]) {
                    console.warn(`Missing price data for ${key}, using static fallback`);
                    prices[key] = {
                        ...STATIC_PRICES[key],
                        lastUpdated: new Date(),
                        sparkline: []
                    };
                }
            });

            // Update cache with size limit
            this.setCacheWithLimit('allPrices', {
                data: prices,
                timestamp: Date.now()
            });

            // Save to database cache
            await this.saveToDbCache(prices);

            console.log('✓ Successfully fetched live prices from API');
            return prices;
            
        } catch (error) {
            console.error('❌ Error in getAllCoinPrices:', error.message);
            this.stats.errors++;
            
            // Try database cache
            const dbCache = await this.getDbCache();
            if (dbCache) {
                console.log('✓ Returning stale DB cache after error');
                return dbCache;
            }
            
            // Return static prices as final fallback
            console.log('⚠ Using static prices as final fallback');
            this.stats.staticFallbacks++;
            return this.getStaticPrices();
        }
    }

    /**
     * Fetch from CoinGecko Pro API using the configured client
     */
    async fetchFromCoinGecko() {
        try {
            const coinIds = Object.values(COIN_MAPPINGS).map(coin => coin.id);
            const uniqueCoinIds = [...new Set(coinIds)];
            
            // Create reverse mapping
            const idToKey = {};
            Object.entries(COIN_MAPPINGS).forEach(([key, value]) => {
                idToKey[value.id] = key;
            });
            
            // Use the configured coingecko client with Pro API
            const response = await coingecko.get('/coins/markets', {
                params: {
                    vs_currency: 'usd',
                    ids: uniqueCoinIds.join(','),
                    order: 'market_cap_desc',
                    per_page: 100,
                    page: 1,
                    sparkline: false,
                    price_change_percentage: '24h'
                },
                timeout: CONFIG.TIMEOUTS.PRICE_API,
                validateStatus: (status) => status < 500
            });
            
            // Handle rate limiting
            if (response.status === 429) {
                console.warn('⚠ Rate limited by CoinGecko (429)');
                return null;
            }

            // Validate response
            if (!response.data || !Array.isArray(response.data)) {
                console.error('❌ Invalid response format from CoinGecko');
                return null;
            }

            if (response.data.length === 0) {
                console.warn('⚠ CoinGecko returned empty data array');
                return null;
            }

            const prices = {};
            let processedCount = 0;

            response.data.forEach(coin => {
                const key = idToKey[coin.id];
                if (!key) {
                    console.warn(`Unknown coin ID from CoinGecko: ${coin.id}`);
                    return;
                }

                prices[key] = {
                    currentPrice: coin.current_price || STATIC_PRICES[key]?.currentPrice || 0,
                    priceChange24h: coin.price_change_24h || STATIC_PRICES[key]?.priceChange24h || 0,
                    priceChangePercentage24h: coin.price_change_percentage_24h || STATIC_PRICES[key]?.priceChangePercentage24h || 0,
                    marketCap: coin.market_cap || STATIC_PRICES[key]?.marketCap || 0,
                    totalVolume: coin.total_volume || 0,
                    high24h: coin.high_24h || coin.current_price || 0,
                    low24h: coin.low_24h || coin.current_price || 0,
                    lastUpdated: new Date(),
                    sparkline: []
                };
                processedCount++;
            });

            console.log(`✓ CoinGecko Pro API: Processed ${processedCount} coins`);
            return processedCount > 0 ? prices : null;

        } catch (error) {
            console.error('❌ CoinGecko Pro API error:', error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            return null;
        }
    }

    /**
     * Fetch from Binance API as fallback
     */
    async fetchFromBinance() {
        try {
            const response = await axios.get(
                'https://api.binance.com/api/v3/ticker/24hr',
                { 
                    timeout: CONFIG.TIMEOUTS.PRICE_API,
                    validateStatus: (status) => status < 500
                }
            );
            
            // Handle rate limiting
            if (response.status === 429) {
                console.warn('⚠ Rate limited by Binance (429)');
                return null;
            }

            // Validate response
            if (!response.data || !Array.isArray(response.data)) {
                console.error('❌ Invalid response format from Binance');
                return null;
            }

            const prices = {};
            let processedCount = 0;

            Object.keys(COIN_MAPPINGS).forEach(key => {
                const binanceSymbol = COIN_MAPPINGS[key].binanceSymbol;
                if (!binanceSymbol) return;

                const data = response.data.find(d => d.symbol === binanceSymbol);
                if (!data) {
                    // If not found in Binance, use static data
                    prices[key] = {
                        ...STATIC_PRICES[key],
                        lastUpdated: new Date(),
                        sparkline: []
                    };
                    return;
                }

                prices[key] = {
                    currentPrice: parseFloat(data.lastPrice) || STATIC_PRICES[key]?.currentPrice || 0,
                    priceChange24h: parseFloat(data.priceChange) || STATIC_PRICES[key]?.priceChange24h || 0,
                    priceChangePercentage24h: parseFloat(data.priceChangePercent) || STATIC_PRICES[key]?.priceChangePercentage24h || 0,
                    marketCap: STATIC_PRICES[key]?.marketCap || 0,
                    totalVolume: parseFloat(data.volume) || 0,
                    high24h: parseFloat(data.highPrice) || STATIC_PRICES[key]?.currentPrice || 0,
                    low24h: parseFloat(data.lowPrice) || STATIC_PRICES[key]?.currentPrice || 0,
                    lastUpdated: new Date(),
                    sparkline: []
                };
                processedCount++;
            });

            console.log(`✓ Binance: Processed ${processedCount} coins`);
            return processedCount > 0 ? prices : null;

        } catch (error) {
            console.error('❌ Binance API error:', error.message);
            return null;
        }
    }

    /**
     * Get cached prices from memory
     */
    getCachedPrices() {
        const cached = this.cache.get('allPrices');
        if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
            return cached.data;
        }
        return null;
    }

    /**
     * Set cache with size limit to prevent memory leaks
     */
    setCacheWithLimit(key, value) {
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            console.log(`Cache size limit reached, removed oldest entry: ${firstKey}`);
        }
        this.cache.set(key, value);
    }

    /**
     * Get static prices as final fallback
     */
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

    /**
     * Get prices from database cache
     */
    async getDbCache() {
        if (!isDbConnected()) {
            console.warn('⚠ Database not connected, skipping DB cache');
            return null;
        }

        try {
            const cacheData = await CoinData.find()
                .sort({ lastUpdated: -1 })
                .limit(10)
                .lean();

            if (!cacheData.length) {
                console.log('No data in DB cache');
                return null;
            }

            const latestUpdate = Math.max(...cacheData.map(c => c.lastUpdated.getTime()));
            if (Date.now() - latestUpdate > this.dbCacheDuration) {
                console.log(`DB cache expired (age: ${Math.round((Date.now() - latestUpdate) / 1000)}s)`);
                return null;
            }

            const prices = {};
            cacheData.forEach(coin => {
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
            });

            return prices;
        } catch (error) {
            console.error('❌ DB cache error:', error.message);
            return null;
        }
    }

    /**
     * Save prices to database cache
     */
    async saveToDbCache(prices) {
        if (!isDbConnected()) {
            console.warn('⚠ Database not connected, skipping DB cache save');
            return;
        }

        try {
            const operations = Object.keys(prices).map(key => ({
                updateOne: {
                    filter: { symbol: key },
                    update: {
                        $set: {
                            symbol: key,
                            ...prices[key],
                            lastUpdated: new Date()
                        }
                    },
                    upsert: true
                }
            }));

            if (operations.length) {
                await CoinData.bulkWrite(operations, { ordered: false });
                console.log(`✓ Saved ${operations.length} coins to DB cache`);
            }
        } catch (error) {
            console.error('❌ DB save error:', error.message);
            // Don't throw - DB save failure shouldn't break the service
        }
    }

    /**
     * Get single coin price
     */
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
            if (STATIC_PRICES[coinSymbol]) {
                return {
                    price: STATIC_PRICES[coinSymbol].currentPrice,
                    change24h: STATIC_PRICES[coinSymbol].priceChange24h,
                    lastUpdated: new Date()
                };
            }
            
            return {
                price: 0,
                change24h: 0,
                lastUpdated: new Date()
            };
        } catch (error) {
            console.error(`❌ Error getting price for ${coinSymbol}:`, error.message);
            return {
                price: STATIC_PRICES[coinSymbol]?.currentPrice || 0,
                change24h: 0,
                lastUpdated: new Date()
            };
        }
    }

    /**
     * Get chart data with fallback using Pro API
     */
    async getCoinChartData(coinSymbol, days = 7) {
        const coin = COIN_MAPPINGS[coinSymbol];
        if (!coin) {
            console.warn(`Unknown coin symbol: ${coinSymbol}`);
            return this.generateMockChartData(days);
        }

        try {
            // Try CoinGecko Pro API first with retry
            const response = await this.retryWithBackoff(async () => {
                return await coingecko.get(`/coins/${coin.id}/market_chart`, {
                    params: {
                        vs_currency: 'usd',
                        days: days,
                        interval: days === 1 ? 'hourly' : 'daily'
                    },
                    timeout: CONFIG.TIMEOUTS.CHART_API,
                    validateStatus: (status) => status < 500
                });
            });
            
            if (response.status === 429) {
                console.warn('⚠ Rate limited by CoinGecko Pro for chart data');
                throw new Error('Rate limited');
            }

            if (!response.data || !response.data.prices) {
                throw new Error('Invalid chart data response');
            }

            return {
                prices: response.data.prices,
                market_caps: response.data.market_caps || [],
                total_volumes: response.data.total_volumes || []
            };
        } catch (coinGeckoError) {
            console.error(`❌ CoinGecko Pro chart error for ${coinSymbol}:`, coinGeckoError.message);
            
            // Try Binance as fallback
            try {
                return await this.getChartDataFromBinance(coinSymbol, days);
            } catch (binanceError) {
                console.error(`❌ Binance chart error for ${coinSymbol}:`, binanceError.message);
                return this.generateMockChartData(days);
            }
        }
    }

    /**
     * Get chart data from Binance
     */
    async getChartDataFromBinance(coinSymbol, days = 7) {
        const binanceSymbol = COIN_MAPPINGS[coinSymbol]?.binanceSymbol;
        if (!binanceSymbol) {
            throw new Error('No Binance symbol found');
        }

        // Map days to Binance interval
        let interval = '1d';
        let limit = days;
        
        if (days === 1) {
            interval = '1h';
            limit = 24;
        } else if (days <= 7) {
            interval = '4h';
            limit = days * 6;
        } else if (days <= 30) {
            interval = '1d';
            limit = days;
        }

        const response = await axios.get(
            'https://api.binance.com/api/v3/klines',
            {
                params: {
                    symbol: binanceSymbol,
                    interval: interval,
                    limit: Math.min(limit, 1000) // Binance max limit
                },
                timeout: CONFIG.TIMEOUTS.CHART_API,
                validateStatus: (status) => status < 500
            }
        );
        
        if (response.status === 429) {
            console.warn('⚠ Rate limited by Binance for chart data');
            throw new Error('Rate limited');
        }

        if (!response.data || !Array.isArray(response.data)) {
            throw new Error('Invalid Binance chart response');
        }

        const prices = response.data.map(candle => [
            candle[0], // timestamp
            parseFloat(candle[4]) // close price
        ]);

        // Generate mock market caps and volumes based on prices
        const market_caps = prices.map(([timestamp, price]) => [timestamp, price * 1000000]);
        const total_volumes = prices.map(([timestamp, price]) => [timestamp, price * 10000]);

        return {
            prices: prices,
            market_caps: market_caps,
            total_volumes: total_volumes
        };
    }

    /**
     * Generate mock chart data
     */
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

    /**
     * Get coin detail with fallback using Pro API
     */
    async getCoinDetail(coinSymbol) {
        const coin = COIN_MAPPINGS[coinSymbol];
        if (!coin) {
            console.warn(`Unknown coin symbol: ${coinSymbol}`);
            return this.generateMockCoinDetail(coinSymbol);
        }

        try {
            const response = await this.retryWithBackoff(async () => {
                return await coingecko.get(`/coins/${coin.id}`, {
                    params: {
                        localization: false,
                        tickers: false,
                        market_data: true,
                        community_data: false,
                        developer_data: false,
                        sparkline: false
                    },
                    timeout: CONFIG.TIMEOUTS.DETAIL_API,
                    validateStatus: (status) => status < 500
                });
            });
            
            if (response.status === 429) {
                console.warn('⚠ Rate limited by CoinGecko Pro for detail');
                throw new Error('Rate limited');
            }

            if (!response.data) {
                throw new Error('Invalid detail response');
            }

            return response.data;
        } catch (coinGeckoError) {
            console.error(`❌ CoinGecko Pro detail error for ${coinSymbol}:`, coinGeckoError.message);
            
            // Try Binance as fallback
            try {
                return await this.getCoinDetailFromBinance(coinSymbol);
            } catch (binanceError) {
                console.error(`❌ Binance detail error for ${coinSymbol}:`, binanceError.message);
                return this.generateMockCoinDetail(coinSymbol);
            }
        }
    }

    /**
     * Get basic coin detail from Binance
     */
    async getCoinDetailFromBinance(coinSymbol) {
        const binanceSymbol = COIN_MAPPINGS[coinSymbol]?.binanceSymbol;
        if (!binanceSymbol) {
            throw new Error('No Binance symbol found');
        }

        const response = await axios.get(
            `https://api.binance.com/api/v3/ticker/24hr`,
            {
                params: { symbol: binanceSymbol },
                timeout: CONFIG.TIMEOUTS.DETAIL_API,
                validateStatus: (status) => status < 500
            }
        );
        
        if (response.status === 429) {
            console.warn('⚠ Rate limited by Binance for detail');
            throw new Error('Rate limited');
        }

        if (!response.data) {
            throw new Error('Invalid Binance detail response');
        }

        const data = response.data;
        const staticPrice = STATIC_PRICES[coinSymbol] || { currentPrice: 0, priceChange24h: 0 };

        return {
            id: coinSymbol,
            symbol: coinSymbol,
            name: COIN_MAPPINGS[coinSymbol]?.name || coinSymbol.toUpperCase(),
            market_data: {
                current_price: { usd: parseFloat(data.lastPrice) || staticPrice.currentPrice },
                price_change_24h: parseFloat(data.priceChange) || staticPrice.priceChange24h,
                price_change_percentage_24h: parseFloat(data.priceChangePercent) || staticPrice.priceChangePercentage24h,
                market_cap: { usd: staticPrice.marketCap || 0 },
                total_volume: { usd: parseFloat(data.volume) || 0 },
                high_24h: { usd: parseFloat(data.highPrice) || staticPrice.currentPrice * 1.02 },
                low_24h: { usd: parseFloat(data.lowPrice) || staticPrice.currentPrice * 0.98 }
            },
            last_updated: new Date().toISOString()
        };
    }

    /**
     * Generate mock coin detail
     */
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

    /**
     * Health check for monitoring
     */
    async healthCheck() {
        const timeSinceUpdate = Date.now() - this.lastApiCall;
        const cacheStatus = this.cache.has('allPrices');
        const dbStatus = isDbConnected();
        
        const status = {
            healthy: cacheStatus || dbStatus,
            cache: {
                hasData: cacheStatus,
                size: this.cache.size,
                maxSize: this.maxCacheSize
            },
            database: {
                connected: dbStatus
            },
            api: {
                lastCall: this.lastApiCall,
                timeSinceLastCall: timeSinceUpdate,
                nextCallIn: Math.max(0, this.minApiInterval - timeSinceUpdate)
            },
            stats: { ...this.stats },
            timestamp: new Date().toISOString()
        };
        
        return status;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            lastApiCall: this.lastApiCall,
            uptime: process.uptime()
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            apiCalls: 0,
            cacheHits: 0,
            dbCacheHits: 0,
            staticFallbacks: 0,
            errors: 0
        };
        console.log('✓ Statistics reset');
    }

    /**
     * Start auto-update service
     */
    startAutoUpdate(interval = CONFIG.AUTO_UPDATE_INTERVAL) {
        if (this.updateInterval) {
            console.warn('⚠ Auto-update already running');
            return;
        }

        console.log(`🚀 Starting crypto data service (update interval: ${interval / 1000}s)`);
        console.log(`Configuration: Cache=${CONFIG.CACHE_DURATION / 1000}s, MinAPI=${CONFIG.MIN_API_INTERVAL / 1000}s`);
        console.log(`Using CoinGecko Pro API with key: ${process.env.COINGECKO_API_KEY ? 'CONFIGURED ✓' : 'NOT CONFIGURED ✗'}`);
        
        // Initial update
        this.getAllCoinPrices()
            .then(() => {
                console.log(`✓ Initial crypto prices loaded at ${new Date().toISOString()}`);
            })
            .catch(err => {
                console.error('❌ Initial load failed:', err.message);
            });

        this.updateInterval = setInterval(async () => {
            try {
                await this.getAllCoinPrices();
                console.log(`✓ Cryptocurrency prices updated at ${new Date().toISOString()}`);
            } catch (error) {
                console.error('❌ Auto-update error:', error.message);
            }
        }, interval);
    }

    /**
     * Stop auto-update service
     */
    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('✓ Auto-update stopped');
        } else {
            console.warn('⚠ Auto-update was not running');
        }
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.cache.clear();
        this.lastApiCall = 0;
        console.log('✓ All caches cleared');
    }
}

module.exports = new CryptoDataService();