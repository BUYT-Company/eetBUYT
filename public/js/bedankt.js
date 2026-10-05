/* Bedankpagina: toont het resultaat van de betaling of van de bestelaanvraag. */
(() => {
  const $ = (sel) => document.querySelector(sel);

  /* Samenvatting van de bestelling: bewaard door checkout.js op het moment van plaatsen (alleen in dit tabblad). */
  const readOrder = () => { try { return JSON.parse(sessionStorage.getItem('buyt-last-order') || 'null'); } catch (_) { return null; } };
  const dutchDate = (iso) => {
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  };
  const renderOrder = (state) => {
    const ok = state === 'aanvraag' || state === 'betaald';
    const next = $('[data-next]');
    const summary = $('[data-summary]');
    next.hidden = !ok;
    if (ok) {
      $('[data-status-title]').textContent = state === 'betaald' ? 'Betaling verwerkt' : 'Bestelling ontvangen';
      $('[data-status-text]').textContent = state === 'betaald' ? 'Goed nieuws! Je betaling is succesvol verwerkt.' : 'Goed nieuws! Je bestelling is bij ons binnen.';
    }
    const order = ok ? readOrder() : null;
    summary.hidden = !order;
    if (!order) return;

    $('[data-order-number]').textContent = `BUYT-${order.number}`;
    $('[data-order-badge]').textContent = state === 'betaald' ? 'Betaald' : 'Ontvangen';
    if (order.email) $('[data-email-to]').textContent = ` naar ${order.email}`;

    const list = $('[data-summary-lines]');
    list.textContent = '';
    (order.items || []).forEach((line) => {
      const li = document.createElement('li');
      const info = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = `${line.qty} × ${line.name}`;
      info.appendChild(name);
      if (line.pack) {
        const pack = document.createElement('span');
        pack.textContent = line.pack;
        info.appendChild(pack);
      }
      const price = document.createElement('span');
      price.className = 'thanks__price';
      price.textContent = line.total || '';
      li.append(info, price);
      list.appendChild(li);
    });

    const setRow = (key, selector, value) => {
      const row = $(`[data-row="${key}"]`);
      if (row) row.hidden = !value;
      if (value) $(selector).textContent = value;
    };
    setRow('delivery', '[data-delivery]', order.deliveryDate ? `${dutchDate(order.deliveryDate)}, ${String(order.deliveryWindow || '').replace('-', ' – ')} uur` : '');
    setRow('subtotal', '[data-subtotal]', order.subtotal);
    setRow('shipping', '[data-shipping]', order.shipping);
    $('[data-total]').textContent = order.total || '';
  };

  const show = (state) => {
    document.querySelectorAll('[data-state]').forEach((el) => { el.hidden = el.dataset.state !== state; });
    renderOrder(state);
  };
  /* Nieuwsbrief in de footer: zelfde aanroep als op de homepage */
  const news = $('form[name="nieuwsbrief"]');
  if (news) {
    const ok = news.querySelector('.form__msg--ok');
    const err = news.querySelector('.form__msg--err');
    news.addEventListener('submit', async (e) => {
      e.preventDefault();
      ok.hidden = true;
      err.hidden = true;
      try {
        const data = Object.fromEntries(new FormData(news));
        const res = await fetch('/api/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, turnstile: data['cf-turnstile-response'] })
        });
        if (!res.ok) throw new Error(String(res.status));
        news.reset();
        ok.hidden = false;
        try { localStorage.setItem('buyt-nieuwsbrief', 'ingeschreven'); } catch (_) {}
      } catch (_) {
        err.hidden = false;
      }
      if (window.turnstile) window.turnstile.reset();
    });
  }

  /* Bestelblok in- en uitklappen. `inert` houdt de verborgen inhoud buiten het toetsenbord en de schermlezer. */
  const toggle = $('#summary-toggle');
  if (toggle) {
    const body = $('#summary-body');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      body.inert = !open;
      toggle.closest('.thanks__card').classList.toggle('is-open', open);
    });
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('s') === 'aanvraag') { show('aanvraag'); return; }

  /* Fase 2: ?o=<token> toont de betaalstatus via /api/order-status */
  const token = params.get('o');
  if (!token) { show('onbekend'); return; }

  fetch(`/api/order-status?t=${encodeURIComponent(token)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then(({ status }) => {
      if (status === 'betaald') {
        window.BuytCart.clear();
        show('betaald');
      } else if (status === 'betaling_mislukt') {
        show('mislukt');
      } else if (status === 'wacht_op_betaling') {
        show('open');
      } else {
        show('onbekend');
      }
    })
    .catch(() => show('onbekend'));
})();
