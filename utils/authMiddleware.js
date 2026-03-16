const supabaseAdmin = require('./supabaseAdmin');

/**
 * Verifies the Supabase JWT from the Authorization header.
 * Attaches req.user = { id, email, isPremium, ... } on success.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = data.user;

  try {
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('is_premium')
      .eq('user_id', data.user.id)
      .maybeSingle();

    req.user.isPremium = sub?.is_premium ?? false;
  } catch {
    req.user.isPremium = false;
  }

  next();
}

module.exports = { requireAuth };