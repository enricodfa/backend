const supabaseAdmin = require('../utils/supabaseAdmin');
const { createPixPayment, createCardPayment, getPayment, validateWebhookSignature } = require('../utils/mercadopago');

async function getStatus(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('is_premium, status, current_period_start, current_period_end')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    return res.json(data ?? { is_premium: false, status: 'inactive' });
  } catch (err) {
    next(err);
  }
}

async function activatePlan(req, res, next) {
  try {
    const userId = req.user.id;
    const now    = new Date();
    const end    = new Date(now);
    end.setMonth(end.getMonth() + 1);

    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .upsert(
        {
          user_id:              userId,
          is_premium:           false,
          status:               'active',
          current_period_start: now.toISOString(),
          current_period_end:   end.toISOString(),
          updated_at:           now.toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) throw error;

    return res.json({ ok: true, subscription: data });
  } catch (err) {
    next(err);
  }
}

async function cancelPlan(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ ok: true, subscription: data });
  } catch (err) {
    next(err);
  }
}

async function activateSubscription(userId, mpPaymentId) {
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);

  await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        user_id:              userId,
        is_premium:           true,
        status:               'active',
        external_id:          String(mpPaymentId),
        current_period_start: now.toISOString(),
        current_period_end:   end.toISOString(),
        updated_at:           now.toISOString(),
      },
      { onConflict: 'user_id' }
    );
}

function recordPayment(userId, payment, method) {
  // Fire-and-forget — falha de auditoria não deve bloquear a resposta ao usuário
  supabaseAdmin
    .from('payments')
    .insert({
      user_id:       userId,
      mp_payment_id: String(payment.id),
      method,
      amount:        payment.transaction_amount,
      status:        payment.status,
      status_detail: payment.status_detail ?? null,
    })
    .then(({ error }) => {
      if (error) console.error('[payments] insert error:', error.message);
    });
}

/**
 * POST /plans/checkout/pix
 */
async function createPixCheckout(req, res, next) {
  try {
    const userId = req.user.id;

    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (pErr || !profile) return res.status(404).json({ error: 'User profile not found' });

    const idempotencyKey = `pix-checkout-${userId}`;

    const payment = await createPixPayment({
      userId,
      userEmail: profile.email,
      idempotencyKey,
    });

    recordPayment(userId, payment, 'pix');

    const pix = payment.point_of_interaction?.transaction_data;

    return res.json({
      payment_id:     payment.id,
      status:         payment.status,
      amount:         payment.transaction_amount,
      ticket_url:     pix?.ticket_url,
      qr_code:        pix?.qr_code,
      qr_code_base64: pix?.qr_code_base64,
    });
  } catch (err) {
    if (err.status) return res.status(502).json({ error: err.message, detail: err.mpError });
    next(err);
  }
}

/**
 * POST /plans/checkout/card
 * Cartão é síncrono — ativa o plano na mesma requisição se aprovado.
 */
async function createCardCheckout(req, res, next) {
  try {
    const userId = req.user.id;
    const { token, payment_method_id, issuer_id, installments, identification_type, identification_number } = req.body;

    if (!token || !payment_method_id) {
      return res.status(400).json({ error: 'token and payment_method_id are required' });
    }

    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (pErr || !profile) return res.status(404).json({ error: 'User profile not found' });

    const idempotencyKey = `card-checkout-${userId}-${token}`;

    const payment = await createCardPayment({
      userId,
      userEmail:            profile.email,
      token,
      paymentMethodId:      payment_method_id,
      issuerId:             issuer_id,
      installments,
      identificationType:   identification_type,
      identificationNumber: identification_number,
      idempotencyKey,
    });

    recordPayment(userId, payment, payment_method_id);

    if (payment.status === 'approved') {
      await activateSubscription(userId, payment.id);
    }

    return res.json({
      payment_id:    payment.id,
      status:        payment.status,
      status_detail: payment.status_detail,
    });
  } catch (err) {
    if (err.status) return res.status(502).json({ error: err.message, detail: err.mpError });
    next(err);
  }
}

/**
 * POST /plans/webhook
 * Recebe notificações do Mercado Pago — sem JWT, validado via HMAC-SHA256.
 */
async function handleWebhook(req, res) {
  const xSignature     = req.headers['x-signature'];
  const xRequestId     = req.headers['x-request-id'];
  const notificationId = req.body?.id?.toString();

  if (!validateWebhookSignature({ xSignature, xRequestId, notificationId })) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (req.body?.type !== 'payment') return res.sendStatus(200);

  const paymentId = req.body?.data?.id;
  if (!paymentId) return res.sendStatus(200);

  try {
    const payment = await getPayment(paymentId);

    const userId = payment.external_reference;
    if (!userId) return res.sendStatus(200);

    // Atualiza o registro existente (inserido como pending no createPixCheckout)
    await supabaseAdmin
      .from('payments')
      .update({ status: payment.status, status_detail: payment.status_detail ?? null })
      .eq('mp_payment_id', String(payment.id));

    if (payment.status !== 'approved') return res.sendStatus(200);

    await activateSubscription(userId, payment.id);

    return res.sendStatus(200);
  } catch (err) {
    console.error('[webhook] error:', err.message);
    return res.sendStatus(200);
  }
}

module.exports = { getStatus, activatePlan, cancelPlan, createPixCheckout, createCardCheckout, handleWebhook };
