const supabaseAdmin = require('../utils/supabaseAdmin');

/**
 * GET /operations
 * Returns all trades for the authenticated user, ordered by date desc.
 * Supports query params: ?portfolioId=&ticker=&type=BUY|SELL&limit=50&offset=0
 */
async function listOperations(req, res, next) {
  try {
    const userId = req.user.id;
    const { portfolioId, ticker, type, limit = 50, offset = 0 } = req.query;

    let query = supabaseAdmin
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('traded_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (portfolioId) query = query.eq('portfolio_id', portfolioId);
    if (ticker)      query = query.eq('ticker', ticker.toUpperCase());
    if (type)        query = query.eq('type', type.toUpperCase());

    const { data, error, count } = await query;

    if (error) throw error;

    return res.json({ trades: data ?? [], total: count });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /operations
 * Creates a new trade record.
 * Body: { portfolioId, ticker, coingecko_id, logo, type, quantity, price_usd, traded_at?, notes? }
 */
async function createOperation(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      portfolioId, ticker, coingecko_id, logo,
      type, quantity, price_usd, traded_at, notes,
    } = req.body;

    if (!portfolioId || !ticker || !type || !quantity || price_usd == null) {
      return res.status(400).json({ error: 'portfolioId, ticker, type, quantity, and price_usd are required' });
    }
    if (!['BUY', 'SELL'].includes(type.toUpperCase())) {
      return res.status(400).json({ error: 'type must be BUY or SELL' });
    }

    const { data: portfolio, error: pErr } = await supabaseAdmin
      .from('portfolios')
      .select('id')
      .eq('id', portfolioId)
      .eq('user_id', userId)
      .single();

    if (pErr || !portfolio) return res.status(404).json({ error: 'Portfolio not found' });

    const { data, error } = await supabaseAdmin
      .from('trades')
      .insert({
        user_id:      userId,
        portfolio_id: portfolioId,
        ticker:       ticker.toUpperCase(),
        coingecko_id: coingecko_id ?? null,
        logo:         logo ?? null,
        type:         type.toUpperCase(),
        quantity:     Number(quantity),
        price_usd:    Number(price_usd),
        traded_at:    traded_at ?? new Date().toISOString(),
        notes:        notes ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /operations/:id
 * Updates a trade. Only allows editing notes, quantity, price_usd, traded_at.
 */
async function updateOperation(req, res, next) {
  try {
    const userId  = req.user.id;
    const tradeId = req.params.id;
    const { quantity, price_usd, traded_at, notes } = req.body;

    const updates = {};
    if (quantity  != null) updates.quantity  = Number(quantity);
    if (price_usd != null) updates.price_usd = Number(price_usd);
    if (traded_at != null) updates.traded_at = traded_at;
    if (notes     != null) updates.notes     = notes;

    const { data, error } = await supabaseAdmin
      .from('trades')
      .update(updates)
      .eq('id', tradeId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    if (!data)  return res.status(404).json({ error: 'Trade not found' });

    return res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /operations/:id
 */
async function deleteOperation(req, res, next) {
  try {
    const { error } = await supabaseAdmin
      .from('trades')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listOperations, createOperation, updateOperation, deleteOperation };