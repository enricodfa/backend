/**
 * Fetches live crypto prices from CoinGecko.
 * Free tier: ~30 req/min. Set COINGECKO_API_KEY for higher limits.
 *
 * No hardcoded ticker→ID map. The caller passes the mapping, which should
 * be sourced from the database (portfolio_assets.coingecko_id) so the
 * frontend and backend stay in sync automatically for any asset.
 *
 * Usage:
 *   const prices = await getPrices(
 *     ['BTC', 'USDT'],
 *     { BTC: 'bitcoin', USDT: 'tether' }   // from DB
 *   );
 *   // => { BTC: { usd: 65000 }, USDT: { usd: 1 } }
 */

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// Cache keyed by sorted coin-ID string so different asset combos cache independently
const _cache    = new Map(); // key → { byTicker: {}, ts: number }
const CACHE_TTL = 60_000;   // 1 minute

/**
 * @param {string[]} tickers       - e.g. ['BTC', 'USDT']
 * @param {Record<string, string>} tickerToId - { BTC: 'bitcoin', USDT: 'tether' }
 * @returns {Promise<Record<string, { usd: number, usd_24h_change: number }>>}
 */
async function getPrices(tickers, tickerToId) {
  const upper = tickers.map((t) => t.toUpperCase());

  // Build id→ticker reverse map
  const idToTicker = {};
  const ids        = [];

  for (const ticker of upper) {
    const id = tickerToId?.[ticker];
    if (id) {
      ids.push(id);
      idToTicker[id] = ticker;
    }
  }

  if (!ids.length) return {};

  const cacheKey = [...ids].sort().join(',');
  const cached   = _cache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return pick(cached.byTicker, upper);
  }

  const apiKey  = process.env.COINGECKO_API_KEY;
  const url     = `${COINGECKO_BASE}/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`;
  const headers = apiKey ? { 'x-cg-pro-api-key': apiKey } : {};

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);

  const raw = await res.json();

  const byTicker = {};
  for (const [id, data] of Object.entries(raw)) {
    const ticker = idToTicker[id];
    if (ticker) byTicker[ticker] = data;
  }

  _cache.set(cacheKey, { byTicker, ts: Date.now() });

  return pick(byTicker, upper);
}

function pick(map, tickers) {
  const result = {};
  for (const t of tickers) {
    if (map[t]) result[t] = map[t];
  }
  return result;
}

/**
 * @param {string} ticker
 * @param {Record<string, string>} tickerToId
 */
async function getPrice(ticker, tickerToId) {
  const prices = await getPrices([ticker], tickerToId);
  const entry  = prices[ticker.toUpperCase()];
  if (!entry) throw new Error(`Price not found for ticker: ${ticker}`);
  return entry.usd;
}

module.exports = { getPrices, getPrice };