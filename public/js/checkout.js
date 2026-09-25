/* Afrekenen: stuurt de bestelling naar de Worker (/api/order), die ze in Supabase vastlegt.
   Online betalen komt in fase 2; nu blijft het bij een bestelaanvraag. */
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
    if (data.get('bot-field')) { fail('Je bestelling kon niet worden verstuurd.'); return; }

    /* Eén verzoek: de server controleert alles, bepaalt de prijzen en legt de bestelling vast.
       Het request-id voorkomt een dubbele bestelling bij dubbelklikken of opnieuw proberen. */
    let requestId = null;
    try { requestId = sessionStorage.getItem('buyt-request-id'); } catch (_) {}
    if (!requestId) {
      requestId = crypto.randomUUID();
      try { sessionStorage.setItem('buyt-request-id', requestId); } catch (_) {}
    }

    let result = null;
    let code = '';
    try {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_request_id: requestId,
          items: items.map(({ id, qty }) => ({ id, qty })),
          customer: Object.fromEntries(['naam', 'email', 'telefoon', 'adres', 'postcode', 'plaats', 'opmerking'].map((k) => [k, data.get(k) || ''])),
          turnstile: data.get('cf-turnstile-response'),
          'bot-field': data.get('bot-field') || ''
        })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) result = body;
      else code = body.error || 'server_error';
    } catch (_) {
      code = 'network';
    }

    if (!result) {
      /* Een Turnstile-token werkt maar één keer */
      if (window.turnstile) window.turnstile.reset();
      fail({
        network: 'Je bestelling is niet verstuurd. Je mandje staat nog klaar. Controleer je verbinding en probeer het opnieuw.',
        invalid_input: 'Controleer je gegevens (naam, e-mailadres, adres en postcode) en probeer het opnieuw.',
        turnstile_failed: 'We konden niet controleren dat je geen robot bent. Probeer het opnieuw.',
        rate_limited: 'Je hebt kort achter elkaar meerdere bestellingen geplaatst. Probeer het over een uur opnieuw of neem contact met ons op.'
      }[code] || 'Je bestelling is niet verstuurd. Je mandje staat nog klaar. Probeer het later opnieuw.');
      return;
    }

    try { sessionStorage.removeItem('buyt-request-id'); } catch (_) {}
    /* Online betalen (fase 2): heeft de server een betaallink gemaakt, dan gaat de klant daarheen */
    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }
    cart.clear();
    window.location.href = 'bedankt.html?s=aanvraag';
  });
})();
