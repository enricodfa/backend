/**
 * Fetches live crypto prices from CoinGecko.
 * Free tier: ~30 req/min. Set COINGECKO_API_KEY for higher limits.
 *
 * Usage:
 *   const prices = await getPrices(['BTC', 'ETH', 'SOL']);
 *   // => { BTC: { usd: 65000, usd_24h_change: 2.3 }, ... }
 */

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// Ticker → CoinGecko coin ID mapping
const TICKER_TO_ID = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  SUI:  'sui',
  AVAX: 'avalanche-2',
  BNB:  'binancecoin',
  ADA:  'cardano',
  DOT:  'polkadot',
  MATIC:'matic-network',
  LINK: 'chainlink',
  UNI:  'uniswap',
  ATOM: 'cosmos',
  NEAR: 'near',
  APT:  'aptos',
  ARB:  'arbitrum',
  OP:   'optimism',
  INJ:  'injective-protocol',
  SEI:  'sei-network',
  TIA:  'celestia',
};

// In-memory cache to avoid hammering the free tier
let cache = {};
let cacheTs = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Returns prices for the given tickers.
 * @param {string[]} tickers - e.g. ['BTC', 'ETH']
 * @returns {Promise<Record<string, { usd: number, usd_24h_change: number }>>}
 */
async function getPrices(tickers) {
  const now = Date.now();

  // Return cache if still fresh
  if (now - cacheTs < CACHE_TTL_MS && Object.keys(cache).length > 0) {
    return filterByTickers(cache, tickers);
  }

  const ids = tickers
    .map((t) => TICKER_TO_ID[t.toUpperCase()])
    .filter(Boolean)
    .join(',');

  if (!ids) return {};

  const apiKey = process.env.COINGECKO_API_KEY;
  const url = `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

  const headers = apiKey ? { 'x-cg-pro-api-key': apiKey } : {};

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);

  const raw = await res.json();

  // Rebuild cache indexed by ticker
  const freshCache = {};
  for (const [ticker, id] of Object.entries(TICKER_TO_ID)) {
    if (raw[id]) freshCache[ticker] = raw[id];
  }

  cache   = freshCache;
  cacheTs = now;

  return filterByTickers(freshCache, tickers);
}

function filterByTickers(priceMap, tickers) {
  const result = {};
  for (const t of tickers) {
    const key = t.toUpperCase();
    if (priceMap[key]) result[key] = priceMap[key];
  }
  return result;
}

/**
 * Returns the USD price for a single ticker. Throws if not found.
 */
async function getPrice(ticker) {
  const prices = await getPrices([ticker]);
  const entry  = prices[ticker.toUpperCase()];
  if (!entry) throw new Error(`Price not found for ticker: ${ticker}`);
  return entry.usd;
}

module.exports = { getPrices, getPrice, TICKER_TO_ID };
