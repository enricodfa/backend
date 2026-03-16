const supabaseAdmin = require('../utils/supabaseAdmin');

async function checkPlanAndRedirect(req, res, next) {
  try {
    console.log('[Auth:checkPlan] Iniciando para user_id:', req.user?.id);

    const { data: sub, error } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) {
      console.error('[Auth:checkPlan] Erro no Supabase:', error);
      throw error;
    }

    console.log('[Auth:checkPlan] Dados da subscription retornados:', sub);

    const isActive = sub?.status === 'active';
    console.log('[Auth:checkPlan] isActive final:', isActive);

    return res.json({ redirect: isActive ? '/dashboard' : '/planos' });
  } catch (err) {
    console.error('[Auth:checkPlan] Catch error:', err);
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const userId = req.user?.id;
    console.log('[Auth:getMe] Buscando profile e sub para user_id:', userId);

    const [profileResult, subResult] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('id', userId).single(),
      supabaseAdmin.from('subscriptions').select('is_premium, status, current_period_end').eq('user_id', userId).maybeSingle(),
    ]);

    if (profileResult.error) {
      console.error('[Auth:getMe] Erro ao buscar profile:', profileResult.error);
      throw profileResult.error;
    }

    if (subResult.error) {
      console.error('[Auth:getMe] Erro ao buscar subscription:', subResult.error);
    }

    console.log('[Auth:getMe] Profile data:', profileResult.data);
    console.log('[Auth:getMe] Subscription raw data:', subResult.data);

    const payload = {
      profile: profileResult.data,
      subscription: subResult.data ?? { is_premium: false, status: 'inactive' },
    };

    console.log('[Auth:getMe] Payload enviado ao frontend:', payload);

    return res.json(payload);
  } catch (err) {
    console.error('[Auth:getMe] Catch error:', err);
    next(err);
  }
}

module.exports = { checkPlanAndRedirect, getMe };