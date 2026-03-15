const supabaseAdmin = require('../utils/supabaseAdmin');

/**
 * GET /allocation
 * Returns the user's portfolio, trade-derived holdings, and saved allocation targets.
 */
async function getAllocation(req, res, next) {
  try {
    const userId = req.user.id;

    const { data: portfolio, error: pErr } = await supabaseAdmin
      .from('portfolios')
      .select('id, name, tolerance_band, created_at, updated_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pErr) throw pErr;
    if (!portfolio) return res.json({ portfolio: null, assets: [] });

    const [{ data: paRows, error: paErr }, { data: holdings, error: hErr }] = await Promise.all([
      supabaseAdmin
        .from('portfolio_assets')
        .select('ticker, target_pct, tolerance_band_override')
        .eq('portfolio_id', portfolio.id),
      supabaseAdmin
        .rpc('get_portfolio_holdings', { p_portfolio_id: portfolio.id }),
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
        net_quantity:            h ? Number(h.net_quantity)          : 0,
        avg_cost:                h ? Number(h.avg_cost)               : 0,
        total_invested:          h ? Number(h.total_invested)         : 0,
        total_received:          h ? Number(h.total_received)         : 0,
        realized_pnl:            h ? Number(h.realized_pnl)          : 0,
        target_pct:              t ? Number(t.target_pct)             : null,
        tolerance_band_override: t?.tolerance_band_override ?? null,
      };
    });

    return res.json({ portfolio, assets });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /allocation
 * Saves target percentages to portfolio_assets table.
 */
async function saveAllocation(req, res, next) {
  try {
    const userId = req.user.id;
    const { portfolioName, toleranceBand, assets } = req.body;

    if (!Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({ error: 'assets array is required' });
    }

    const sum = assets.reduce((s, a) => s + Number(a.target_pct), 0);
    if (Math.abs(sum - 100) > 0.001) {
      return res.status(400).json({ error: `target_pct values must sum to 100 (got ${sum.toFixed(4)})` });
    }

    const now = new Date().toISOString();

    const { data: existing } = await supabaseAdmin
      .from('portfolios')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let portfolioId;

    if (existing) {
      const { error: upErr } = await supabaseAdmin
        .from('portfolios')
        .update({
          name:           portfolioName ?? 'Minha Carteira',
          tolerance_band: toleranceBand ?? 0.15,
          updated_at:     now,
        })
        .eq('id', existing.id);

      if (upErr) {
        console.error('[alloc] portfolio UPDATE failed:', upErr.message);
        return res.status(500).json({ error: upErr.message });
      }
      portfolioId = existing.id;
    } else {
      const { data: created, error: cErr } = await supabaseAdmin
        .from('portfolios')
        .insert({
          user_id:        userId,
          name:           portfolioName ?? 'Minha Carteira',
          tolerance_band: toleranceBand ?? 0.15,
        })
        .select('id')
        .single();

      if (cErr) {
        console.error('[alloc] portfolio INSERT failed:', cErr.message);
        return res.status(500).json({ error: cErr.message });
      }
      portfolioId = created.id;
    }

    // Replace portfolio_assets for this portfolio
    const { error: delErr } = await supabaseAdmin
      .from('portfolio_assets')
      .delete()
      .eq('portfolio_id', portfolioId);

    if (delErr) {
      console.error('[alloc] portfolio_assets DELETE failed:', delErr.message);
      return res.status(500).json({ error: delErr.message });
    }

    const rows = assets.map((a) => ({
      portfolio_id:            portfolioId,
      ticker:                  a.ticker.toUpperCase(),
      target_pct:              Number(a.target_pct),
      tolerance_band_override: a.tolerance_band_override ?? null,
    }));

    const { error: insErr } = await supabaseAdmin
      .from('portfolio_assets')
      .insert(rows);

    if (insErr) {
      console.error('[alloc] portfolio_assets INSERT failed:', insErr.message);
      return res.status(500).json({ error: insErr.message });
    }

    return res.json({
      portfolio: { id: portfolioId },
      assets: rows.map(({ portfolio_id, ...r }) => r),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /allocation/band
 * Updates only the global tolerance band.
 */
async function updateBand(req, res, next) {
  try {
    const { toleranceBand } = req.body;

    if (typeof toleranceBand !== 'number') {
      return res.status(400).json({ error: 'toleranceBand must be a number' });
    }

    const { data: portfolio, error: pErr } = await supabaseAdmin
      .from('portfolios')
      .select('id')
      .eq('user_id', req.user.id)
      .is('deleted_at', null)
      .single();

    if (pErr || !portfolio) return res.status(404).json({ error: 'Portfolio not found' });

    const { data, error } = await supabaseAdmin
      .from('portfolios')
      .update({ tolerance_band: toleranceBand, updated_at: new Date().toISOString() })
      .eq('id', portfolio.id)
      .select()
      .single();

    if (error) throw error;

    return res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllocation, saveAllocation, updateBand };
