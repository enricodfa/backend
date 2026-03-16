const supabaseAdmin = require('../utils/supabaseAdmin');
const { getPrices } = require('../utils/priceService');
const { computeSignals } = require('../utils/rebalanceEngine');

async function getSummary(req, res, next) {
  try {
    const userId = req.user.id;
    const portfolioId = req.query.portfolio_id;

    console.log(`[Dashboard] Iniciando para usuário ${userId}, portfolioId: ${portfolioId || 'último'}`);

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
    if (!portfolio) {
      console.log('[Dashboard] Nenhum portfolio encontrado');
      return res.json({
        portfolio: null,
        signals: [],
        totalValueUsd: 0,
        totalPnl: 0,
        totalRealized: 0,
        totalUnrealized: 0,
        sellCount: 0,
        buyCount: 0,
        assetCount: 0,
      });
    }

    console.log(`[Dashboard] Portfolio encontrado: ${portfolio.id} - ${portfolio.name}`);

    const [
      { data: paRows, error: paErr },
      { data: holdings, error: hErr }
    ] = await Promise.all([
      supabaseAdmin
        .from('portfolio_assets')
        .select('ticker, target_pct, tolerance_band_override, coingecko_id, logo')
        .eq('portfolio_id', portfolio.id),
      supabaseAdmin
        .rpc('get_portfolio_holdings', { p_portfolio_id: portfolio.id }),
    ]);

    if (paErr) throw paErr;
    if (hErr) throw hErr;

    const targets = paRows ?? [];
    const holdingsArray = holdings ?? [];

    console.log(`[Dashboard] Targets encontrados: ${targets.length}, Holdings encontrados: ${holdingsArray.length}`);

    const allTickers = [
      ...new Set([
        ...holdingsArray.map((h) => h.ticker),
        ...targets.map((t) => t.ticker),
      ]),
    ];

    console.log('[Dashboard] Todos os tickers:', allTickers);

    if (!allTickers.length) {
      console.log('[Dashboard] Nenhum ticker para processar');
      return res.json({
        portfolio,
        signals: [],
        totalValueUsd: 0,
        totalPnl: 0,
        totalRealized: 0,
        totalUnrealized: 0,
        sellCount: 0,
        buyCount: 0,
        assetCount: 0,
      });
    }

    // Mapa de metadados vindo de portfolio_assets
    const assetMetadata = {};
    targets.forEach((t) => {
      const ticker = t.ticker.toUpperCase();
      assetMetadata[ticker] = {
        coingecko_id: t.coingecko_id,
        logo: t.logo,
      };
      console.log(`[Metadata] De portfolio_assets: ${ticker} -> coingecko_id: ${t.coingecko_id}, logo: ${t.logo}`);
    });

    // Tickers sem metadata em portfolio_assets
    const missingTickers = allTickers.filter(
      (t) => !assetMetadata[t.toUpperCase()]?.coingecko_id
    );

    if (missingTickers.length > 0) {
      console.log('[Dashboard] Tickers sem metadata em portfolio_assets, buscando em trades:', missingTickers);

      // Primeiro, vamos ver todos os trades desses tickers (sem filtro de null)
      const { data: allTradesForTickers } = await supabaseAdmin
        .from('trades')
        .select('ticker, coingecko_id, logo')
        .eq('portfolio_id', portfolio.id)
        .in('ticker', missingTickers);

      console.log('[Dashboard] Todos os trades encontrados para esses tickers (incluindo nulls):', allTradesForTickers);

      // Agora a query com filtro not null (a original)
      const { data: tradeRows } = await supabaseAdmin
        .from('trades')
        .select('ticker, coingecko_id, logo')
        .eq('portfolio_id', portfolio.id)
        .in('ticker', missingTickers)
        .not('coingecko_id', 'is', null);

      console.log('[Dashboard] Trades com coingecko_id não nulo:', tradeRows);

      for (const row of tradeRows ?? []) {
        const ticker = row.ticker.toUpperCase();
        if (!assetMetadata[ticker]) {
          assetMetadata[ticker] = {};
        }
        if (!assetMetadata[ticker].coingecko_id) {
          assetMetadata[ticker].coingecko_id = row.coingecko_id;
        }
        if (!assetMetadata[ticker].logo) {
          assetMetadata[ticker].logo = row.logo;
        }
        console.log(`[Metadata] De trades: ${ticker} -> coingecko_id: ${row.coingecko_id}, logo: ${row.logo}`);
      }
    }

    // Após tentar preencher, vamos ver o estado final do metadata
    console.log('[Dashboard] assetMetadata final:', assetMetadata);

    const tickerToId = Object.fromEntries(
      allTickers
        .map((t) => [t.toUpperCase(), assetMetadata[t.toUpperCase()]?.coingecko_id])
        .filter(([_, id]) => id)
    );

    console.log('[Dashboard] tickerToId para preços:', tickerToId);

    const prices = await getPrices(allTickers, tickerToId);
    console.log('[Dashboard] Preços recebidos:', prices);

    const holdingMap = Object.fromEntries(
      holdingsArray.map((h) => [h.ticker, h])
    );

    const assetInputs = allTickers.map((ticker) => {
      const h = holdingMap[ticker];
      const t = targets.find((tg) => tg.ticker === ticker);
      return {
        ticker,
        targetPct: t ? Number(t.target_pct) / 100 : 0,
        toleranceBand: t?.tolerance_band_override != null
          ? Number(t.tolerance_band_override)
          : Number(portfolio.tolerance_band),
        quantity: h ? Number(h.net_quantity) : 0,
        priceUsd: prices[ticker]?.usd ?? 0,
        avgCost: h ? Number(h.avg_cost) : 0,
        realizedPnl: h ? Number(h.realized_pnl) : 0,
      };
    });

    const signals = computeSignals(assetInputs);

    const enrichedSignals = signals.map((s) => {
      const input = assetInputs.find((a) => a.ticker === s.ticker);
      const meta = assetMetadata[s.ticker] || {};

      const quantity = input?.quantity ?? 0;
      const priceUsd = s.priceUsd ?? 0;
      const avgCost = input?.avgCost ?? 0;
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
        coingecko_id: meta.coingecko_id,
        logo: meta.logo,
      };
    });

    console.log('[Dashboard] Primeiro sinal enriquecido:', enrichedSignals.length ? {
      ticker: enrichedSignals[0].ticker,
      logo: enrichedSignals[0].logo,
      coingecko_id: enrichedSignals[0].coingecko_id
    } : 'nenhum');

    const totalValueUsd = enrichedSignals.reduce((sum, s) => sum + s.totalValueUsd, 0);
    const sellCount = enrichedSignals.filter((s) => s.signal === 'SELL').length;
    const buyCount = enrichedSignals.filter((s) => s.signal === 'BUY').length;
    const totalPnl = enrichedSignals.reduce((sum, s) => sum + s.totalPnl, 0);
    const totalRealized = enrichedSignals.reduce((sum, s) => sum + s.realizedPnl, 0);
    const totalUnrealized = enrichedSignals.reduce((sum, s) => sum + s.unrealizedPnl, 0);

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
    console.error('[Dashboard] Erro:', err);
    next(err);
  }
}

module.exports = { getSummary };