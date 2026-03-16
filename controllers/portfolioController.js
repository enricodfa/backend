const supabaseAdmin = require('../utils/supabaseAdmin');

/**
 * GET /portfolios
 * Lists all active portfolios for the authenticated user.
 */
async function listPortfolios(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('portfolios')
      .select('id, name, tolerance_band, created_at, updated_at')
      .eq('user_id', req.user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json({ portfolios: data ?? [] });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /portfolios
 * Creates a new portfolio.
 * Body: { name?, tolerance_band? }
 *
 * Free users are limited to 1 portfolio.
 * Premium users can have unlimited.
 */
async function createPortfolio(req, res, next) {
  try {
    const userId    = req.user.id;
    const isPremium = req.user.isPremium ?? false;
    const { name = 'Minha Carteira', tolerance_band = 0.15 } = req.body;

    if (!isPremium) {
      const { count, error: countErr } = await supabaseAdmin
        .from('portfolios')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('deleted_at', null);

      if (countErr) throw countErr;

      if (count > 0) {
        return res.status(403).json({
          error:   'free_plan_limit',
          message: 'Plano gratuito permite apenas 1 carteira. Assine o Premium para criar múltiplas carteiras.',
        });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('portfolios')
      .insert({ user_id: userId, name, tolerance_band })
      .select('id, name, tolerance_band, created_at, updated_at')
      .single();

    if (error) throw error;

    return res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /portfolios/:id
 * Updates name and/or tolerance_band of a portfolio.
 * Body: { name?, tolerance_band? }
 */
async function updatePortfolio(req, res, next) {
  try {
    const userId      = req.user.id;
    const portfolioId = req.params.id;
    const { name, tolerance_band } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (name           != null) updates.name           = name;
    if (tolerance_band != null) updates.tolerance_band = Number(tolerance_band);

    const { data, error } = await supabaseAdmin
      .from('portfolios')
      .update(updates)
      .eq('id', portfolioId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('id, name, tolerance_band, created_at, updated_at')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Portfolio not found' });

    return res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /portfolios/:id
 * Soft-deletes a portfolio and all its assets.
 * Prevents deleting the last active portfolio.
 */
async function deletePortfolio(req, res, next) {
  try {
    const userId      = req.user.id;
    const portfolioId = req.params.id;

    // Guard: don't allow deleting the last portfolio
    const { count, error: countErr } = await supabaseAdmin
      .from('portfolios')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (countErr) throw countErr;

    if (count <= 1) {
      return res.status(400).json({
        error:   'last_portfolio',
        message: 'Você precisa manter ao menos uma carteira.',
      });
    }

    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('portfolios')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', portfolioId)
      .eq('user_id', userId);

    if (error) throw error;

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /portfolios/find-or-create
 * Returns the user's most recent active portfolio, or creates a default one.
 * Used internally and by the operations flow when no portfolioId is provided.
 */
async function findOrCreatePortfolio(req, res, next) {
  try {
    const userId = req.user.id;

    const { data: existing } = await supabaseAdmin
      .from('portfolios')
      .select('id, name, tolerance_band, created_at, updated_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return res.json(existing);

    const { data: created, error } = await supabaseAdmin
      .from('portfolios')
      .insert({ user_id: userId, name: 'Minha Carteira', tolerance_band: 0.15 })
      .select('id, name, tolerance_band, created_at, updated_at')
      .single();

    if (error) throw error;

    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

// Exported helper for other controllers (e.g. operationsController)
async function findOrCreatePortfolioForUser(userId) {
  const { data: existing } = await supabaseAdmin
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from('portfolios')
    .insert({ user_id: userId, name: 'Minha Carteira', tolerance_band: 0.15 })
    .select('id')
    .single();

  if (error) throw error;
  return created.id;
}

module.exports = {
  listPortfolios,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  findOrCreatePortfolio,
  findOrCreatePortfolioForUser, // internal helper
};