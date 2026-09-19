/* Afrekenen: legt de bestelling vast (Netlify Forms) en start daarna de Mollie-betaling.
   Is Mollie nog niet ingesteld, dan blijft het bij een bestelaanvraag. */
(() => {
  const form = document.querySelector('form[name="bestelling"]');
  if (!form) return;
  const button = document.getElementById('pay');
  const message = form.querySelector('[data-msg-err]');
  const label = button.querySelector('.btn__label');
  const idleText = label.textContent;

  const setBusy = (busy) => {
    button.disabled = busy;
    label.textContent = busy ? 'Bezig…' : idleText;
  };
  const fail = (text) => {
    setBusy(false);
    message.textContent = text;
    message.hidden = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    message.hidden = true;
    await window.BuytCart.ready;
    const cart = window.BuytCart;
    const items = cart.items();
    if (!items.length) { fail('Je mandje is leeg.'); return; }
    setBusy(true);

    const data = new FormData(form);
    data.set('bestelling_regels', items.map((i) => `${i.qty}x ${i.name} (${cart.fmt(i.priceCents)})`).join('\n'));
    data.set('bestelling_totaal', cart.fmt(cart.total()));

    /* 1. De bestelling vastleggen, zodat we nooit een order kwijtraken */
    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data).toString()
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch (_) {
      fail('Versturen is niet gelukt. Probeer het zo nog eens of neem contact met ons op.');
      return;
    }

    /* 2. De betaling starten. Prijzen worden op de server opnieuw berekend. */
    try {
      const res = await fetch('/.netlify/functions/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(({ id, qty }) => ({ id, qty })),
          customer: { naam: data.get('naam'), email: data.get('email') }
        })
      });
      if (res.ok) {
        const pay = await res.json();
        if (pay.checkoutUrl) {
          try { localStorage.setItem('buyt-pending', pay.paymentId); } catch (_) {}
          window.location.href = pay.checkoutUrl;
          return;
        }
      }
    } catch (_) {}

    /* 3. Geen online betaling beschikbaar: de bestelaanvraag is ontvangen */
    cart.clear();
    window.location.href = 'bedankt.html?s=aanvraag';
  });
})();
