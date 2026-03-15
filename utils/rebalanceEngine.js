/**
 * Core rebalance logic — mirrors the frontend mockData engine.
 *
 * Relative band formula:
 *   bandVariance    = targetPct * toleranceBand
 *   upperThreshold  = targetPct + bandVariance
 *   lowerThreshold  = targetPct - bandVariance
 *
 *   SELL  → currentPct >= upperThreshold  (return exactly to target)
 *   BUY   → currentPct <= lowerThreshold  (return exactly to target)
 *   HOLD  → inside band
 */

/**
 * @typedef {Object} AssetInput
 * @property {string} ticker
 * @property {number} targetPct        - 0–1 (e.g. 0.5 for 50%)
 * @property {number} toleranceBand    - 0–1 (e.g. 0.15 for 15%)
 * @property {number} quantity         - units held
 * @property {number} priceUsd
 */

/**
 * @typedef {Object} SignalResult
 * @property {string} ticker
 * @property {'BUY'|'SELL'|'HOLD'} signal
 * @property {number} currentPct
 * @property {number} targetPct
 * @property {number} upperThreshold
 * @property {number} lowerThreshold
 * @property {number} deviationPct     - normalized: (current-target)/target
 * @property {number} actionPct        - weight delta needed to return to target
 * @property {number} actionValueUsd   - USD to buy/sell
 * @property {number} priceUsd
 * @property {number} totalValueUsd
 */

/**
 * Computes rebalance signals for a portfolio.
 *
 * @param {AssetInput[]} assets
 * @returns {SignalResult[]}
 */
function computeSignals(assets) {
  const totalValueUsd = assets.reduce((s, a) => s + a.quantity * a.priceUsd, 0);

  return assets.map((asset) => {
    const value      = asset.quantity * asset.priceUsd;
    const currentPct = totalValueUsd > 0 ? value / totalValueUsd : 0;

    const bandVariance   = asset.targetPct * asset.toleranceBand;
    const upperThreshold = asset.targetPct + bandVariance;
    const lowerThreshold = asset.targetPct - bandVariance;

    const deviationPct = (currentPct - asset.targetPct) / asset.targetPct;

    let signal     = 'HOLD';
    let actionPct  = 0;

    if (currentPct >= upperThreshold) {
      signal    = 'SELL';
      actionPct = currentPct - asset.targetPct;
    } else if (currentPct <= lowerThreshold) {
      signal    = 'BUY';
      actionPct = asset.targetPct - currentPct;
    }

    const actionValueUsd = actionPct * totalValueUsd;

    return {
      ticker:         asset.ticker,
      signal,
      currentPct,
      targetPct:      asset.targetPct,
      upperThreshold,
      lowerThreshold,
      deviationPct,
      actionPct,
      actionValueUsd,
      priceUsd:       asset.priceUsd,
      totalValueUsd,
    };
  });
}

module.exports = { computeSignals };
