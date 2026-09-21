// Maakt een Mollie-betaling aan voor de inhoud van het winkelmandje.
// Prijzen komen uit data/products.json (nooit uit de browser), zodat niemand het bedrag kan aanpassen.
//
// Instellen in Netlify: Site configuration > Environment variables > MOLLIE_API_KEY
// (begin met een test_-sleutel uit het Mollie-dashboard; zonder sleutel geeft deze functie 503 terug
// en valt de site terug op een bestelaanvraag zonder online betaling).

const catalog = require('../../data/products.json');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return json(503, { error: 'mollie_not_configured' });

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (_) {
    return json(400, { error: 'bad_json' });
  }

  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return json(400, { error: 'empty_cart' });

  let totalCents = 0;
  const summary = [];
  for (const item of items) {
    const product = catalog.products.find((p) => p.id === item.id);
    const qty = Number.parseInt(item.qty, 10);
    // Producten zonder vaste prijs (prijs op gewicht) kunnen niet online betaald worden.
    if (!product || !Number.isInteger(product.priceCents) || !(qty >= 1 && qty <= 50)) return json(400, { error: 'invalid_item' });
    totalCents += product.priceCents * qty;
    summary.push(`${qty}x ${product.name}`);
  }
  if (Number.isInteger(catalog.shippingCents)) totalCents += catalog.shippingCents;

  const customer = data.customer || {};
  const site = process.env.URL || `https://${event.headers.host}`;

  const response = await fetch('https://api.mollie.com/v2/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: { currency: catalog.currency || 'EUR', value: (totalCents / 100).toFixed(2) },
      description: `BUYT bestelling: ${summary.join(', ')}`.slice(0, 255),
      redirectUrl: `${site}/bedankt.html`,
      webhookUrl: `${site}/.netlify/functions/mollie-webhook`,
      locale: 'nl_NL',
      metadata: { email: String(customer.email || '').slice(0, 120), items: summary.join(', ').slice(0, 300) }
    })
  });
  const payment = await response.json();
  if (!response.ok) {
    console.error('Mollie error', response.status, payment);
    return json(502, { error: 'mollie_error' });
  }

  return json(200, { checkoutUrl: payment._links.checkout.href, paymentId: payment.id });
};
