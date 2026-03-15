const supabaseAdmin = require('../utils/supabaseAdmin');

/**
 * POST /auth/callback
 * Chamado após o OAuth do Google.
 * Retorna has_plan para o frontend decidir o redirect: /dashboard ou /planos.
 */
async function checkPlanAndRedirect(req, res, next) {
  try {
    const { data: sub, error } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    const isActive = sub?.status === 'active';
    return res.json({ redirect: isActive ? '/dashboard' : '/planos' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/me
 * Returns the authenticated user's profile + subscription status.
 */
async function getMe(req, res, next) {
  try {
    const userId = req.user.id;

    const [profileResult, subResult] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('id', userId).single(),
      supabaseAdmin.from('subscriptions').select('is_premium, status, current_period_end').eq('user_id', userId).maybeSingle(),
    ]);

    if (profileResult.error) throw profileResult.error;

    return res.json({
      profile:      profileResult.data,
      subscription: subResult.data ?? { is_premium: false, status: 'inactive' },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { checkPlanAndRedirect, getMe };
