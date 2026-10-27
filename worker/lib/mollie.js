// Mollie-betalingen: betaling aanmaken, status ophalen en de bestelling bijwerken.
// De API-sleutel (MOLLIE_API_KEY) staat als secret in Cloudflare, nooit in een bestand. De browser praat nooit met Mollie.
import { select, update, insert } from './supabase.js';

const API = 'https://api.mollie.com/v2';
const PAYMENT_ID = /^tr_[A-Za-z0-9]{3,40}$/;

// Mollie wil bedragen als tekst met twee decimalen: 1250 -> "12.50".
export const amountValue = (cents) => (cents / 100).toFixed(2);

// Mollie-status -> bestelstatus. null = niets veranderen (bijv. "authorized").
export function orderStatusFor(mollieStatus) {
  if (mollieStatus === 'paid') return 'betaald';
  if (mollieStatus === 'failed' || mollieStatus === 'canceled' || mollieStatus === 'expired') return 'betaling_mislukt';
  if (mollieStatus === 'open' || mollieStatus === 'pending') return 'wacht_op_betaling';
  return null;
}

// Online betalen staat alleen aan als de sleutel er is, de schakelaar in products.json aan staat
// en het bedrag vaststaat (geen "prijs op gewicht"-regels).
export const canPayOnline = (env, catalog, order) =>
  Boolean(env.MOLLIE_API_KEY) && catalog?.paymentsLive === true && !order.has_unpriced && order.total_estimate_cents > 0;

async function mollie(env, path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.MOLLIE_API_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`mollie_${res.status}`);
  return body;
}

export const getPayment = (env, id) => mollie(env, `/payments/${id}`);

export async function createPayment(env, { orderNumber, token, cents, origin }) {
  const body = {
    amount: { currency: 'EUR', value: amountValue(cents) },
    description: `BUYT bestelling ${orderNumber}`,
    redirectUrl: `${origin}/bedankt.html?o=${token}`,
    locale: 'nl_NL',
    metadata: { order_number: orderNumber }
  };
  // Mollie kan localhost niet bereiken: zonder webhook werkt lokaal testen via /api/order-status.
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(origin)) body.webhookUrl = `${origin}/api/mollie-webhook`;
  const payment = await mollie(env, '/payments', { method: 'POST', body: JSON.stringify(body) });
  return { id: payment.id, checkoutUrl: payment._links?.checkout?.href || null };
}

// Betaalstand voor de bedankpagina, afgeleid van de Mollie-status die bij de bestelling staat.
// De bestelstatus (orders.status, het beheer: nieuw/klaargemaakt/...) blijft hier buiten: betalen is een eigen spoor.
export const paymentStateFor = (mollieStatus) => orderStatusFor(mollieStatus) || 'onbekend';

// Haalt de betaling op bij Mollie (de enige bron van waarheid) en slaat de betaalstatus op bij de bestelling.
// Geeft { status, justPaid, orderNumber } terug, of null als het ID onbekend of ongeldig is.
export async function syncPayment(env, paymentId) {
  if (typeof paymentId !== 'string' || !PAYMENT_ID.test(paymentId)) return null;
  const rows = await select(env, 'orders', `select=order_number,mollie_status,total_estimate_cents&mollie_payment_id=eq.${paymentId}`);
  const order = rows?.[0];
  if (!order) return null;

  const payment = await mollie(env, `/payments/${paymentId}`);
  // Het bedrag moet kloppen met de bestelling; zo kan een afwijkende betaling nooit "betaald" worden.
  if (payment.amount?.currency !== 'EUR' || payment.amount?.value !== amountValue(order.total_estimate_cents)) {
    throw new Error('mollie_amount_mismatch');
  }

  const status = orderStatusFor(payment.status);
  await insert(env, 'payment_events', { mollie_payment_id: paymentId, mollie_status: payment.status }).catch(() => {});
  if (!status) return { status: paymentStateFor(order.mollie_status), justPaid: false, orderNumber: order.order_number };

  // Een eenmaal betaalde bestelling blijft betaald (een latere melding mag dat nooit terugdraaien).
  const patch = { mollie_status: payment.status };
  if (status === 'betaald') patch.paid_at = payment.paidAt || new Date().toISOString();
  const changed = await update(
    env,
    'orders',
    `mollie_payment_id=eq.${paymentId}&or=(mollie_status.is.null,mollie_status.neq.paid)`,
    patch
  );
  const applied = Array.isArray(changed) && changed.length > 0;
  return {
    status: applied ? status : paymentStateFor(order.mollie_status),
    justPaid: applied && status === 'betaald',
    orderNumber: order.order_number
  };
}
