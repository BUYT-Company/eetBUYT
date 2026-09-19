// Mollie roept dit adres aan als de status van een betaling verandert (betaald, mislukt, geannuleerd).
// Nu wordt de status alleen gelogd (Netlify > Functions > mollie-webhook > Logs).

exports.handler = async (event) => {
  const apiKey = process.env.MOLLIE_API_KEY;
  const id = new URLSearchParams(event.body || '').get('id');
  if (!apiKey || !id) return { statusCode: 200, body: '' };

  const response = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const payment = await response.json();
  console.log('Mollie betaling', payment.id, payment.status);

  // TODO als payment.status === 'paid':
  //  - bevestigingsmail naar de klant sturen
  //  - de teller "ganzen met een goede bestemming" ophogen per verkochte gans
  return { statusCode: 200, body: '' };
};
