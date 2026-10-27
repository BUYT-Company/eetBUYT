// Mails rond betalen: de bevestiging na betaling en de herinnering aan wie een betaling startte maar niet afrondde.
// De herinnering draait elke 15 minuten via een Cloudflare Cron Trigger (wrangler.jsonc, scheduled() in index.js).
import { select, update } from './supabase.js';
import { syncPayment } from './mollie.js';
import { sendOrderConfirmation } from './resend.js';
import { orderConfirmationEmail, orderInternalEmail, paymentReminderEmail } from './emailTemplates.js';

const REMINDER_AFTER_MS = 60 * 60 * 1000; // pas na een uur: de klant is er dan echt niet meer mee bezig
const REMINDER_UNTIL_MS = 24 * 60 * 60 * 1000; // na een dag is een herinnering te laat
// Geen herinnering bij "canceled": dat is een bewuste keuze van de klant.
const REMINDABLE = ['open', 'pending', 'expired', 'failed'];

export const siteOrigin = (env) => env.SITE_URL || 'https://eetbuyt.nl';

// De rij uit de database in de vorm die de mailtemplates verwachten (zoals een net geplaatste bestelling).
function mailOrder(row) {
  return {
    customer: { customer_name: row.customer_name, email: row.email, phone: row.phone, street: row.street, postcode: row.postcode, city: row.city, note: row.note },
    lines: row.order_lines || [],
    total_estimate_cents: row.total_estimate_cents,
    has_unpriced: row.has_unpriced,
    is_indicative: row.is_indicative,
    delivery_date: row.delivery_date,
    delivery_window: row.delivery_window
  };
}

async function loadOrder(env, orderNumber) {
  const [row] = await select(env, 'orders', `select=*,order_lines(*)&order_number=eq.${orderNumber}`);
  return row || null;
}

// Na een geslaagde betaling: bevestiging naar de klant en de interne mail naar jullie. Faalt nooit hardop.
export async function sendPaidMails(env, orderNumber, method) {
  try {
    const row = await loadOrder(env, orderNumber);
    if (!row) return;
    const order = mailOrder(row);
    const result = { order_number: row.order_number };
    const origin = siteOrigin(env);
    await sendOrderConfirmation(env, orderConfirmationEmail(order, result, origin, { paid: true, method, paidAt: row.paid_at }));
    await sendOrderConfirmation(env, orderInternalEmail(order, result, origin, { paid: true }));
  } catch (e) {
    console.error('paid_mails_failed', e instanceof Error ? e.message : 'unknown');
  }
}

const amsterdamDay = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(now);

// Krijgt deze bestelling een herinnering? Alleen bij een gestarte, niet afgeronde en niet bewust geannuleerde betaling,
// tussen een uur en een dag na het bestellen, één keer, en zolang de bezorgdatum niet voorbij is.
export function needsReminder(o, now = new Date()) {
  if (!o || o.status === 'geannuleerd') return false;
  if (o.paid_at || o.mollie_status === 'paid' || o.reminder_sent_at) return false;
  if (!o.mollie_payment_id || !REMINDABLE.includes(o.mollie_status)) return false;
  const age = now.getTime() - new Date(o.created_at).getTime();
  if (!(age >= REMINDER_AFTER_MS && age <= REMINDER_UNTIL_MS)) return false;
  return Boolean(o.delivery_date) && o.delivery_date >= amsterdamDay(now);
}

// De geplande controle. Geeft het aantal verstuurde herinneringen terug.
export async function sendReminders(env, now = new Date()) {
  if (!env.RESEND_API_KEY || !env.MOLLIE_API_KEY) return 0;
  const before = encodeURIComponent(new Date(now.getTime() - REMINDER_AFTER_MS).toISOString());
  const after = encodeURIComponent(new Date(now.getTime() - REMINDER_UNTIL_MS).toISOString());
  let rows;
  try {
    rows = await select(
      env,
      'orders',
      `select=*,order_lines(*)&status=neq.geannuleerd&paid_at=is.null&reminder_sent_at=is.null&mollie_payment_id=not.is.null` +
        `&mollie_status=in.(${REMINDABLE.join(',')})&created_at=lt.${before}&created_at=gt.${after}&limit=20`
    );
  } catch (e) {
    console.error('reminders_query_failed', e instanceof Error ? e.message : 'unknown');
    return 0;
  }

  let sent = 0;
  for (const row of rows || []) {
    if (!needsReminder(row, now)) continue;
    try {
      // Vlak voor het versturen de echte status bij Mollie: net betaald of bewust geannuleerd krijgt geen herinnering.
      const synced = await syncPayment(env, row.mollie_payment_id);
      if (!synced) continue;
      if (synced.justPaid) await sendPaidMails(env, row.order_number, synced.method);
      if (synced.status === 'betaald' || synced.mollieStatus === 'canceled') continue;

      // Eerst claimen (alleen als er nog geen herinnering is), dan versturen: nooit twee keer.
      const claimed = await update(env, 'orders', `order_number=eq.${row.order_number}&reminder_sent_at=is.null`, { reminder_sent_at: now.toISOString() });
      if (!Array.isArray(claimed) || !claimed.length) continue;

      const origin = siteOrigin(env);
      const payUrl = `${origin}/bedankt.html?o=${row.lookup_token}`;
      const { sent: ok } = await sendOrderConfirmation(env, paymentReminderEmail(mailOrder(row), { order_number: row.order_number }, origin, payUrl));
      if (ok) sent += 1;
      else await update(env, 'orders', `order_number=eq.${row.order_number}`, { reminder_sent_at: null }).catch(() => {});
    } catch (e) {
      console.error('reminder_failed', e instanceof Error ? e.message : 'unknown');
    }
  }
  return sent;
}
