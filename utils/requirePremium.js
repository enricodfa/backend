const supabaseAdmin = require('./supabaseAdmin');

async function requirePremium(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('is_premium')
      .eq('user_id', req.user.id)
      .single();

    if (error || !data?.is_premium) {
      return res.status(403).json({ error: 'Plano Premium necessário' });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requirePremium };
