const supabaseAdmin = require('../utils/supabaseAdmin');

/**
 * GET /portfolios/:portfolioId/allocation
 * Returns holdings + allocation targets for a specific portfolio.
 */
async function getAllocation(req, res, next) {
  try {
    const userId      = req.user.id;
    const portfolioId = req.params.portfolioId;

    // Ownership check
    const { data: portfolio, error: pErr } = await supabaseAdmin
      .from('portfolios')
      .select('id, name, tolerance_band, created_at, updated_at')
      .eq('id', portfolioId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (pErr) throw pErr;
    if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' });

    const [{ data: paRows, error: paErr }, { data: holdings, error: hErr }] = await Promise.all([
      supabaseAdmin
        .from('portfolio_assets')
        .select('ticker, target_pct, tolerance_band_override, coingecko_id')
        .eq('portfolio_id', portfolioId),
      supabaseAdmin
        .rpc('get_portfolio_holdings', { p_portfolio_id: portfolioId }),
    ]);

    if (paErr) throw paErr;
    if (hErr)  throw hErr;

    const targets    = paRows ?? [];
    const holdingMap = Object.fromEntries((holdings ?? []).map((h) => [h.ticker, h]));
    const allTickers = [...new Set([
      ...(holdings ?? []).map((h) => h.ticker),
      ...targets.map((t) => t.ticker),
    ])];

    const assets = allTickers.map((ticker) => {
      const h = holdingMap[ticker];
      const t = targets.find((tg) => tg.ticker === ticker);
      return {
        ticker,
        coingecko_id:            t?.coingecko_id ?? null,
        net_quantity:            h ? Number(h.net_quantity)  : 0,
        avg_cost:                h ? Number(h.avg_cost)       : 0,
        total_invested:          h ? Number(h.total_invested) : 0,
        total_received:          h ? Number(h.total_received) : 0,
        realized_pnl:            h ? Number(h.realized_pnl)  : 0,
        target_pct:              t ? Number(t.target_pct)     : null,
        tolerance_band_override: t?.tolerance_band_override ?? null,
      };
    });

    return res.json({ portfolio, assets });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /portfolios/:portfolioId/allocation
 * Replaces all allocation targets for a portfolio.
 * Body: { assets: [{ ticker, coingecko_id, target_pct, tolerance_band_override? }], toleranceBand? }
 */
async function saveAllocation(req, res, next) {
  try {
    const userId      = req.user.id;
    const portfolioId = req.params.portfolioId;
    const { assets, toleranceBand } = req.body;

    if (!Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({ error: 'assets array is required' });
    }

    const sum = assets.reduce((s, a) => s + Number(a.target_pct), 0);
    if (Math.abs(sum - 100) > 0.001) {
      return res.status(400).json({
        error: `target_pct must sum to 100 (got ${sum.toFixed(4)})`,
      });
    }

    // Ownership check
    const { data: portfolio, error: pErr } = await supabaseAdmin
      .from('portfolios')
      .select('id')
      .eq('id', portfolioId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (pErr) throw pErr;
    if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' });

    const now = new Date().toISOString();

    if (toleranceBand != null) {
      const { error: bandErr } = await supabaseAdmin
        .from('portfolios')
        .update({ tolerance_band: Number(toleranceBand), updated_at: now })
        .eq('id', portfolioId);

      if (bandErr) throw bandErr;
    }

    const { error: delErr } = await supabaseAdmin
      .from('portfolio_assets')
      .delete()
      .eq('portfolio_id', portfolioId);

    if (delErr) throw delErr;

    const rows = assets.map((a) => ({
      portfolio_id:            portfolioId,
      ticker:                  a.ticker.toUpperCase(),
      coingecko_id:            a.coingecko_id ?? null,   // saved from search result
      target_pct:              Number(a.target_pct),
      tolerance_band_override: a.tolerance_band_override ?? null,
    }));

    const { error: insErr } = await supabaseAdmin
      .from('portfolio_assets')
      .insert(rows);

    if (insErr) throw insErr;

    return res.json({
      portfolio: { id: portfolioId },
      assets:    rows.map(({ portfolio_id, ...r }) => r),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /portfolios/:portfolioId/allocation/band
 * Updates only the global tolerance band for a portfolio.
 * Body: { toleranceBand: number }
 */
async function updateBand(req, res, next) {
  try {
    const userId      = req.user.id;
    const portfolioId = req.params.portfolioId;
    const { toleranceBand } = req.body;

    if (typeof toleranceBand !== 'number') {
      return res.status(400).json({ error: 'toleranceBand must be a number' });
    }

    const { data, error } = await supabaseAdmin
      .from('portfolios')
      .update({ tolerance_band: toleranceBand, updated_at: new Date().toISOString() })
      .eq('id', portfolioId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('id, name, tolerance_band, updated_at')
      .single();

    if (error) throw error;
    if (!data)  return res.status(404).json({ error: 'Portfolio not found' });

    return res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllocation, saveAllocation, updateBand };