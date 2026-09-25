// Invoercontrole en prijsberekening. Prijzen komen altijd uit data/products.json, nooit uit de browser.
import catalog from '../../data/products.json';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTCODE = /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/;
// Stuurtekens (behalve tab en regeleinde) worden verwijderd.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const clean = (value, max) => (typeof value === 'string' ? value.replace(CONTROL, '').trim() : '').slice(0, max);
const fail = () => ({ ok: false });

export const formatEuro = (cents) => '€ ' + (cents / 100).toFixed(2).replace('.', ',');
const priceLabel = (p) => (!Number.isInteger(p.priceCents) ? 'Prijs op gewicht' : (p.priceApprox ? 'ca. ' : '') + formatEuro(p.priceCents));

export function validateOrder(data) {
  if (!data || typeof data !== 'object') return fail();

  const clientRequestId = clean(data.client_request_id, 36).toLowerCase();
  if (!UUID.test(clientRequestId)) return fail();

  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 20) return fail();
  const merged = new Map();
  for (const item of data.items) {
    const qty = typeof item?.qty === 'number' ? item.qty : Number(item?.qty);
    const product = catalog.products.find((p) => p.id === item?.id);
    if (!product || !Number.isInteger(qty) || qty < 1 || qty > 50) return fail();
    merged.set(product.id, (merged.get(product.id) || 0) + qty);
  }

  const c = data.customer && typeof data.customer === 'object' ? data.customer : {};
  const customer = {
    customer_name: clean(c.naam, 120),
    email: clean(c.email, 200),
    phone: clean(c.telefoon, 40),
    street: clean(c.adres, 160),
    postcode: clean(c.postcode, 10),
    city: clean(c.plaats, 100),
    note: clean(c.opmerking, 1000)
  };
  if (!customer.customer_name || !customer.street || !customer.city) return fail();
  if (!EMAIL.test(customer.email)) return fail();
  if (!POSTCODE.test(customer.postcode)) return fail();

  let total = 0;
  let indicative = false;
  let unpriced = false;
  const lines = [];
  for (const [id, qty] of merged) {
    if (qty > 50) return fail();
    const p = catalog.products.find((x) => x.id === id);
    const priced = Number.isInteger(p.priceCents);
    if (priced) total += p.priceCents * qty;
    else unpriced = true;
    if (!priced || p.priceApprox === true) indicative = true;
    lines.push({
      product_id: p.id,
      name: p.name,
      pack: p.pack || '',
      qty,
      unit_price_cents: priced ? p.priceCents : null,
      price_approx: p.priceApprox === true,
      price_label: priceLabel(p)
    });
  }

  return {
    ok: true,
    value: {
      client_request_id: clientRequestId,
      customer,
      total_estimate_cents: total,
      is_indicative: indicative,
      has_unpriced: unpriced,
      lines
    }
  };
}

export function validateRequest(data) {
  if (!data || typeof data !== 'object') return fail();
  const value = {
    name: clean(data.naam ?? data.name, 120),
    email: clean(data.email, 200),
    type: clean(data.type, 20),
    message: clean(data.bericht ?? data.message, 3000)
  };
  if (!value.name || !EMAIL.test(value.email)) return fail();
  if (value.type !== 'particulier' && value.type !== 'zakelijk') return fail();
  return { ok: true, value };
}
