import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsReminder } from '../lib/payMail.js';
import { orderConfirmationEmail, paymentReminderEmail, orderInternalEmail } from '../lib/emailTemplates.js';

const NOW = new Date('2026-10-27T14:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600e3).toISOString();
const base = { status: 'nieuw', paid_at: null, reminder_sent_at: null, mollie_payment_id: 'tr_abc123', mollie_status: 'expired', created_at: hoursAgo(3), delivery_date: '2026-10-31' };

test('herinnering: onbetaalde bestelling tussen een half uur en een dag oud', () => {
  assert.equal(needsReminder(base, NOW), true);
  assert.equal(needsReminder({ ...base, mollie_status: 'open' }, NOW), true);
  assert.equal(needsReminder({ ...base, mollie_status: 'failed' }, NOW), true);
});

test('herinnering: nooit bij bewust geannuleerd, betaald, geannuleerde bestelling of al herinnerd', () => {
  assert.equal(needsReminder({ ...base, mollie_status: 'canceled' }, NOW), false);
  assert.equal(needsReminder({ ...base, mollie_status: 'paid', paid_at: hoursAgo(2) }, NOW), false);
  assert.equal(needsReminder({ ...base, status: 'geannuleerd' }, NOW), false);
  assert.equal(needsReminder({ ...base, reminder_sent_at: hoursAgo(1) }, NOW), false);
  assert.equal(needsReminder({ ...base, mollie_payment_id: null, mollie_status: null }, NOW), false);
});

test('herinnering: te vroeg, te laat of bezorgdatum voorbij', () => {
  assert.equal(needsReminder({ ...base, created_at: hoursAgo(0.25) }, NOW), false);
  assert.equal(needsReminder({ ...base, created_at: hoursAgo(0.6) }, NOW), true);
  assert.equal(needsReminder({ ...base, created_at: hoursAgo(25) }, NOW), false);
  assert.equal(needsReminder({ ...base, delivery_date: '2026-10-26' }, NOW), false);
  assert.equal(needsReminder({ ...base, delivery_date: '2026-10-27' }, NOW), true);
});

const order = {
  customer: { customer_name: 'Skip <b>Broers', email: 'skip@example.com', phone: '', street: 'Teststraat 1', postcode: '1011AA', city: 'Amsterdam', note: '' },
  lines: [{ qty: 2, name: 'Ganzenborstfilet', pack: 'Per 2 stuks verpakt, ca. 700 gram', unit_price_cents: 1747, price_label: '€ 17,47' }],
  total_estimate_cents: 3494, has_unpriced: false, is_indicative: false,
  delivery_date: '2026-10-31', delivery_window: '10:00-12:00'
};

test('bevestiging na betaling: bedrag, betaalmethode, vaste prijs, geen schatting', () => {
  const mail = orderConfirmationEmail(order, { order_number: 1018 }, 'https://eetbuyt.nl', { paid: true, method: 'ideal', paidAt: '2026-10-27T10:00:00Z' });
  assert.match(mail.subject, /BUYT-1018/);
  assert.match(mail.html, /Totaal betaald/);
  assert.match(mail.html, /€ 34,94/);
  assert.match(mail.html, /Betaald met iDEAL op 27 oktober 2026/);
  assert.match(mail.html, /Zaterdag 31 oktober, 10:00–12:00 uur/);
  assert.match(mail.html, /Daar word je wild van!/);
  assert.doesNotMatch(mail.html, /schatting|indicatief|Gans verdient beter/);
  assert.match(mail.text, /Totaal betaald: € 34,94/);
});

test('mails: klantnaam wordt geëscaped in de html', () => {
  const evil = { ...order, customer: { ...order.customer, customer_name: '<b>Skip Broers', street: '<i>Straat' } };
  const mail = orderConfirmationEmail(evil, { order_number: 1018 }, 'https://eetbuyt.nl', { paid: true });
  assert.doesNotMatch(mail.html, /<b>Skip|<i>Straat/);
  assert.match(mail.html, /Bedankt, <span[^>]*>&lt;b&gt;Skip<\/span>/);
});

test('bevestiging zonder online betaling zegt dat we over de betaling contact opnemen', () => {
  const mail = orderConfirmationEmail(order, { order_number: 1018 }, 'https://eetbuyt.nl');
  assert.match(mail.html, /We nemen contact met je op over de betaling/);
  assert.doesNotMatch(mail.html, /Totaal betaald/);
});

test('herinnering: knop naar de bedankpagina en bedrag dat nog betaald moet worden', () => {
  const url = 'https://eetbuyt.nl/bedankt.html?o=tok';
  const mail = paymentReminderEmail(order, { order_number: 1018 }, 'https://eetbuyt.nl', url);
  assert.match(mail.html, /href="https:\/\/eetbuyt\.nl\/bedankt\.html\?o=tok"/);
  assert.match(mail.html, /Betaling afronden/);
  assert.match(mail.html, /Nog te betalen/);
  assert.match(mail.text, /Betaling afronden: https:\/\/eetbuyt\.nl\/bedankt\.html\?o=tok/);
});

test('interne mail meldt dat de bestelling betaald is', () => {
  const mail = orderInternalEmail(order, { order_number: 1018 }, 'https://eetbuyt.nl', { paid: true });
  assert.match(mail.subject, /^Betaalde bestelling BUYT-1018/);
});
