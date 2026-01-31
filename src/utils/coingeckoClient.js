const axios = require("axios");

const coingecko = axios.create({
  baseURL: "https://pro-api.coingecko.com/api/v3",
  timeout: 15000,
  headers: {
    "x-cg-pro-api-key": process.env.COINGECKO_API_KEY,
    Accept: "application/json",
  },
});

module.exports = coingecko;
