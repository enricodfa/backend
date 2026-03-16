const supabaseAdmin      = require('../utils/supabaseAdmin');
const { getPrices }      = require('../utils/priceService');
const { computeSignals } = require('../utils/rebalanceEngine');

/**
 * GET /dashboard?portfolio_id=<uuid>
 * Portfolio summary with live P&L and rebalancing signals.
 * Holdings are derived from trades via RPC.
 */
async function getSummary(req, res, next) {
  try {
    const userId      = req.user.id;
    const portfolioId = req.query.portfolio_id;

    let portfolioQuery = supabaseAdmin
      .from('portfolios')
      .select('id, name, tolerance_band')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (portfolioId) {
      portfolioQuery = portfolioQuery.eq('id', portfolioId);
    } else {
      portfolioQuery = portfolioQuery
        .order('created_at', { ascending: false })
        .limit(1);
    }

    const { data: portfolio, error: pErr } = await portfolioQuery.maybeSingle();

    if (pErr) throw pErr;
    if (!portfolio) return res.json({ portfolio: null, signals: [], totalValueUsd: 0, totalPnl: 0 });

    const [{ data: paRows, error: paErr }, { data: holdings, error: hErr }] = await Promise.all([
      supabaseAdmin
        .from('portfolio_assets')
        .select('ticker, target_pct, tolerance_band_override, coingecko_id')
        .eq('portfolio_id', portfolio.id),
      supabaseAdmin
        .rpc('get_portfolio_holdings', { p_portfolio_id: portfolio.id }),
    ]);

    if (paErr) throw paErr;
    if (hErr)  throw hErr;

    const targets = paRows ?? [];

    const allTickers = [...new Set([
      ...(holdings ?? []).map((h) => h.ticker),
      ...targets.map((t) => t.ticker),
    ])];

    if (!allTickers.length) {
      return res.json({ portfolio, signals: [], totalValueUsd: 0, totalPnl: 0 });
    }

    // Build tickerToId from portfolio_assets first
    const tickerToId = Object.fromEntries(
      targets
        .filter((r) => r.coingecko_id)
        .map((r) => [r.ticker.toUpperCase(), r.coingecko_id])
    );

    // For tickers not covered by portfolio_assets (free users),
    // fall back to coingecko_id stored in trades
    const missingTickers = allTickers.filter((t) => !tickerToId[t.toUpperCase()]);

    if (missingTickers.length > 0) {
      const { data: tradeRows } = await supabaseAdmin
        .from('trades')
        .select('ticker, coingecko_id')
        .eq('portfolio_id', portfolio.id)
        .in('ticker', missingTickers)
        .not('coingecko_id', 'is', null);

      for (const row of tradeRows ?? []) {
        const key = row.ticker.toUpperCase();
        if (!tickerToId[key]) tickerToId[key] = row.coingecko_id;
      }
    }

    const prices     = await getPrices(allTickers, tickerToId);
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
        quantity:      h ? Number(h.net_quantity) : 0,
        priceUsd:      prices[ticker]?.usd ?? 0,
        avgCost:       h ? Number(h.avg_cost)     : 0,
        realizedPnl:   h ? Number(h.realized_pnl) : 0,
      };
    });

    const signals = computeSignals(assetInputs);

    const enrichedSignals = signals.map((s) => {
      const input = assetInputs.find((a) => a.ticker === s.ticker);

      const quantity    = input?.quantity    ?? 0;
      const priceUsd    = s.priceUsd         ?? 0;
      const avgCost     = input?.avgCost     ?? 0;
      const realizedPnl = input?.realizedPnl ?? 0;

      const unrealizedPnl = (priceUsd - avgCost) * quantity;
      const totalValueUsd = quantity * priceUsd;

      return {
        ...s,
        totalValueUsd,
        quantity,
        avgCost,
        realizedPnl,
        unrealizedPnl,
        totalPnl: realizedPnl + unrealizedPnl,
      };
    });

    const totalValueUsd   = enrichedSignals.reduce((sum, s) => sum + s.totalValueUsd, 0);
    const sellCount       = enrichedSignals.filter((s) => s.signal === 'SELL').length;
    const buyCount        = enrichedSignals.filter((s) => s.signal === 'BUY').length;
    const totalPnl        = enrichedSignals.reduce((sum, s) => sum + s.totalPnl,       0);
    const totalRealized   = enrichedSignals.reduce((sum, s) => sum + s.realizedPnl,    0);
    const totalUnrealized = enrichedSignals.reduce((sum, s) => sum + s.unrealizedPnl,  0);

    return res.json({
      portfolio,
      signals: enrichedSignals,
      totalValueUsd,
      sellCount,
      buyCount,
      assetCount: allTickers.length,
      totalPnl,
      totalRealized,
      totalUnrealized,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary };