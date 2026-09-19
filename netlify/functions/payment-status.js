// Geeft de status van een Mollie-betaling terug aan de bedankpagina (paid, open, failed, canceled, expired).

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  const apiKey = process.env.MOLLIE_API_KEY;
  const id = (event.queryStringParameters || {}).id;
  if (!apiKey) return json(503, { error: 'mollie_not_configured' });
  if (!id || !/^tr_[A-Za-z0-9]+$/.test(id)) return json(400, { error: 'invalid_id' });

  const response = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) return json(502, { error: 'mollie_error' });
  const payment = await response.json();
  return json(200, { status: payment.status });
};
