const supabaseAdmin      = require('../utils/supabaseAdmin');
const { getPrices }      = require('../utils/priceService');
const { computeSignals } = require('../utils/rebalanceEngine');

/**
 * GET /analysis/:portfolioId
 * Full rebalance analysis + P&L. Holdings derived from trades via RPC.
 */
async function getAnalysis(req, res, next) {
  try {
    const userId      = req.user.id;
    const portfolioId = req.params.portfolioId;

    const { data: portfolio, error: pErr } = await supabaseAdmin
      .from('portfolios')
      .select('id, name, tolerance_band')
      .eq('id', portfolioId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (pErr || !portfolio) return res.status(404).json({ error: 'Portfolio not found' });

    const [{ data: paRows, error: paErr }, { data: holdings, error: hErr }] = await Promise.all([
      supabaseAdmin
        .from('portfolio_assets')
        .select('ticker, target_pct, tolerance_band_override')
        .eq('portfolio_id', portfolioId),
      supabaseAdmin
        .rpc('get_portfolio_holdings', { p_portfolio_id: portfolioId }),
    ]);

    if (paErr) throw paErr;
    if (hErr)  throw hErr;

    const targets = paRows ?? [];

    const allTickers = [...new Set([
      ...(holdings ?? []).map((h) => h.ticker),
      ...targets.map((t) => t.ticker),
    ])];

    if (!allTickers.length) {
      return res.json({ portfolio, signals: [], actionPlan: [] });
    }

    const prices     = await getPrices(allTickers);
    const holdingMap = Object.fromEntries((holdings ?? []).map((h) => [h.ticker, h]));

    const assetInputs = allTickers.map((ticker) => {
      const h = holdingMap[ticker];
      const t = targets.find((tg) => tg.ticker === ticker);
      return {
        ticker,
        targetPct:     t ? Number(t.target_pct) / 100 : 0,
        toleranceBand: t?.tolerance_band_override != null
          ? Number(t.tolerance_band_override)
          : Number(portfolio.tolerance_band),
        quantity:      h ? Number(h.net_quantity)  : 0,
        priceUsd:      prices[ticker]?.usd ?? 0,
        avgCost:       h ? Number(h.avg_cost)       : 0,
        totalInvested: h ? Number(h.total_invested) : 0,
        totalReceived: h ? Number(h.total_received) : 0,
        realizedPnl:   h ? Number(h.realized_pnl)  : 0,
      };
    });

    const signals = computeSignals(assetInputs);

    const enrichedSignals = signals.map((s) => {
      const input         = assetInputs.find((a) => a.ticker === s.ticker);
      const unrealizedPnl = input ? (s.priceUsd - input.avgCost) * input.quantity : 0;
      return {
        ...s,
        quantity:      input?.quantity      ?? 0,
        avgCost:       input?.avgCost       ?? 0,
        totalInvested: input?.totalInvested ?? 0,
        totalReceived: input?.totalReceived ?? 0,
        realizedPnl:   input?.realizedPnl   ?? 0,
        unrealizedPnl,
        totalPnl:      (input?.realizedPnl ?? 0) + unrealizedPnl,
      };
    });

    const actionPlan = enrichedSignals
      .filter((s) => s.signal !== 'HOLD')
      .map((s) => ({
        ticker:         s.ticker,
        signal:         s.signal,
        actionValueUsd: s.actionValueUsd,
        actionPct:      s.actionPct,
        currentPct:     s.currentPct,
        targetPct:      s.targetPct,
        deviationPct:   s.deviationPct,
        priceUsd:       s.priceUsd,
        unitsToTrade:   s.priceUsd > 0 ? s.actionValueUsd / s.priceUsd : 0,
      }));

    return res.json({ portfolio, signals: enrichedSignals, actionPlan });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /analysis
 * Auto-resolves the user's latest portfolio, then calls getAnalysis.
 */
async function getLatestAnalysis(req, res, next) {
  try {
    const { data: portfolio, error } = await supabaseAdmin
      .from('portfolios')
      .select('id')
      .eq('user_id', req.user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!portfolio) return res.json({ portfolio: null, signals: [], actionPlan: [] });

    req.params.portfolioId = portfolio.id;
    return getAnalysis(req, res, next);
  } catch (err) {
    next(err);
  }
}

module.exports = { getAnalysis, getLatestAnalysis };
