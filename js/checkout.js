/* Afrekenen: legt de bestelling vast (Netlify Forms) en start daarna de Mollie-betaling.
   Is Mollie nog niet ingesteld, dan blijft het bij een bestelaanvraag. */
(() => {
  const form = document.querySelector('form[name="bestelling"]');
  if (!form) return;
  const button = document.getElementById('pay');
  const message = form.querySelector('[data-msg-err]');
  const label = button.querySelector('.btn__label');
  let idleText = label.textContent;
  window.BuytCart.ready.then(() => {
    idleText = window.BuytCart.paymentsLive() ? 'Bestelling plaatsen en betalen' : 'Bestelling plaatsen';
    if (!button.disabled) label.textContent = idleText;
  });

  const postcode = document.getElementById('c-postcode');
  const postcodeHint = document.getElementById('c-postcode-hint');
  const AMSTERDAM_FIRST = 1011;
  const AMSTERDAM_LAST = 1109;

  /* Waarschuwing, geen blokkade: we bezorgen nu in Amsterdam, andere plaatsen bespreken we per bestelling */
  const checkPostcode = () => {
    const match = /^([1-9][0-9]{3})\s?[A-Za-z]{2}$/.exec(postcode.value.trim());
    const outside = match && (Number(match[1]) < AMSTERDAM_FIRST || Number(match[1]) > AMSTERDAM_LAST);
    postcodeHint.textContent = outside
      ? 'Deze postcode ligt buiten Amsterdam en we bezorgen nu alleen in Amsterdam. Je kunt toch bestellen; we nemen dan contact met je op over de mogelijkheden.'
      : '';
  };
  postcode.addEventListener('input', checkPostcode);
  postcode.addEventListener('blur', checkPostcode);

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
    if (!items.length) { fail('Je mandje is leeg. Voeg eerst een product toe.'); return; }
    setBusy(true);

    const data = new FormData(form);
    data.set('bestelling_regels', items.map((i) => `${i.qty}x ${i.name}${i.pack ? ', ' + i.pack : ''} (${i.priceLabel})`).join('\n'));
    data.set('bestelling_totaal', cart.totalLabel());

    /* 1. De bestelling vastleggen, zodat we nooit een order kwijtraken */
    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data).toString()
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch (_) {
      fail('Je bestelling is niet verstuurd. Je mandje staat nog klaar. Controleer je verbinding en probeer het opnieuw.');
      return;
    }

    /* 2. De betaling starten, alleen als online betalen aan staat (paymentsLive in data/products.json).
       Prijzen worden op de server opnieuw berekend. */
    try {
      if (!cart.paymentsLive()) throw new Error('payments-off');
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
