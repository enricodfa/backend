const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// 5 min é suficiente: evita rate-limit no free tier sem servir dados muito stale
const CACHE_TTL_MS = 5 * 60_000;
const searchCache  = new Map();

async function searchAssets(req, res, next) {
  try {
    const q = (req.query.q ?? '').trim();

    if (q.length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters.' });
    }

    const key     = q.toLowerCase();
    const cached  = searchCache.get(key);
    const now     = Date.now();

    if (cached && now - cached.ts < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const apiKey  = process.env.COINGECKO_API_KEY;
    const headers = apiKey ? { 'x-cg-pro-api-key': apiKey } : {};

    const response = await fetch(
      `${COINGECKO_BASE}/search?query=${encodeURIComponent(q)}`,
      { headers },
    );

    // Propaga o status original se a CoinGecko retornar erro
    if (!response.ok) {
      return res.status(502).json({ error: `CoinGecko error: ${response.status}` });
    }

    const { coins } = await response.json();

    const data = (coins ?? []).slice(0, 5).map((coin) => ({
      name:   coin.name,
      ticker: coin.symbol.toUpperCase(),
      logo:   coin.thumb,
    }));

    searchCache.set(key, { data, ts: now });

    return res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { searchAssets };
