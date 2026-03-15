const crypto = require('crypto');

const MP_BASE = 'https://api.mercadopago.com';

async function mpFetch(path, options = {}) {
  const res = await fetch(`${MP_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      ...options.headers,
    },
  });

  const body = await res.json();

  if (!res.ok) {
    const err = new Error(`Mercado Pago ${res.status}: ${body?.message ?? 'unknown error'}`);
    err.status  = res.status;
    err.mpError = body;
    throw err;
  }

  return body;
}

async function createPixPayment({ userId, userEmail, idempotencyKey }) {
  const amount = parseFloat(process.env.MP_PLAN_PRICE_BRL ?? '29.90');

  return mpFetch('/v1/payments', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      transaction_amount: amount,
      description:        'Plano Premium',
      payment_method_id:  'pix',
      external_reference: userId,
      date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      payer: { email: userEmail },
    }),
  });
}

async function createCardPayment({ userId, userEmail, token, paymentMethodId, issuerId, installments, identificationType, identificationNumber, idempotencyKey }) {
  const amount = parseFloat(process.env.MP_PLAN_PRICE_BRL ?? '29.90');

  return mpFetch('/v1/payments', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      transaction_amount: amount,
      description:        'Plano Premium',
      payment_method_id:  paymentMethodId,
      token,
      installments:       installments ?? 1,
      issuer_id:          issuerId,
      external_reference: userId,
      payer: {
        email:          userEmail,
        identification: { type: identificationType, number: identificationNumber },
      },
    }),
  });
}

async function getPayment(paymentId) {
  return mpFetch(`/v1/payments/${paymentId}`);
}

/**
 * Valida a assinatura HMAC-SHA256 enviada pelo MP no header x-signature.
 * Template: id:<notificationId>;request-id:<xRequestId>;ts:<timestamp>
 */
function validateWebhookSignature({ xSignature, xRequestId, notificationId }) {
  const secret = process.env.MP_WEBHOOK_SECRET;

  if (!secret) return true;

  const tsEntry = xSignature?.split(',').find((p) => p.startsWith('ts='));
  const v1Entry = xSignature?.split(',').find((p) => p.startsWith('v1='));

  if (!tsEntry || !v1Entry) return false;

  const ts       = tsEntry.slice(3);
  const received = v1Entry.slice(3);
  const template = `id:${notificationId};request-id:${xRequestId};ts:${ts}`;
  const expected = crypto.createHmac('sha256', secret).update(template).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  } catch {
    return false;
  }
}

module.exports = { createPixPayment, createCardPayment, getPayment, validateWebhookSignature };
