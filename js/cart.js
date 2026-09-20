/* Winkelmandje: bewaart de bestelling in de browser (localStorage) en werkt op elke pagina.
   Prijzen en namen komen uit data/products.json. */
(() => {
  const KEY = 'buyt-cart';
  const MAX_QTY = 50;
  const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
  const fmt = (cents) => euro.format(cents / 100);
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let catalog = null;
  let lines = [];
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(stored)) {
      lines = stored
        .filter((l) => l && typeof l.id === 'string' && Number.isInteger(l.qty) && l.qty > 0)
        .map((l) => ({ id: l.id, qty: Math.min(l.qty, MAX_QTY) }));
    }
  } catch (_) {}

  const product = (id) => (catalog ? catalog.products.find((p) => p.id === id) : null);
  const count = () => lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = () => lines.reduce((sum, l) => sum + (product(l.id) ? product(l.id).priceCents * l.qty : 0), 0);
  const shipping = () => (catalog && Number.isInteger(catalog.shippingCents) ? catalog.shippingCents : null);
  const total = () => subtotal() + (shipping() || 0);

  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch (_) {}
    render();
    window.dispatchEvent(new CustomEvent('buyt:cart'));
  };
  const setQty = (id, qty) => {
    const i = lines.findIndex((l) => l.id === id);
    if (qty <= 0) { if (i > -1) lines.splice(i, 1); }
    else if (i > -1) lines[i].qty = Math.min(qty, MAX_QTY);
    else lines.push({ id, qty: Math.min(qty, MAX_QTY) });
    persist();
  };
  const add = (id) => {
    const l = lines.find((x) => x.id === id);
    setQty(id, (l ? l.qty : 0) + 1);
  };
  const clear = () => { lines = []; persist(); };

  const lineHTML = (l, p, editable) => {
    const name = esc(p.name);
    const controls = editable
      ? `<div class="qty" role="group" aria-label="Aantal ${name}">
           <button type="button" data-qty="dec" data-id="${esc(l.id)}" aria-label="Minder ${name}">&minus;</button>
           <span aria-live="polite">${l.qty}</span>
           <button type="button" data-qty="inc" data-id="${esc(l.id)}" aria-label="Meer ${name}">+</button>
         </div>
         <button type="button" class="cart-line__remove" data-qty="remove" data-id="${esc(l.id)}" aria-label="${name} verwijderen">Verwijderen</button>`
      : `<span class="cart-line__qty">Aantal: ${l.qty}</span>`;
    return `<li class="cart-line">
      <span class="cart-line__img" style="--tile:${esc(p.tile || '#D8ED36')}"><img src="${esc(p.image)}" alt="" width="72" height="72"></span>
      <div class="cart-line__info">
        <p class="cart-line__name">${name}</p>
        <p class="cart-line__price">${fmt(p.priceCents)}</p>
        <div class="cart-line__controls">${controls}</div>
      </div>
      <p class="cart-line__total">${fmt(p.priceCents * l.qty)}</p>
    </li>`;
  };

  const render = () => {
    const n = count();
    $$('[data-cart-count]').forEach((el) => { el.textContent = String(n); el.hidden = n === 0; });
    $$('.cart-btn').forEach((el) => {
      el.setAttribute('aria-label', n === 0 ? 'Winkelmandje, leeg' : `Winkelmandje, ${n} ${n === 1 ? 'product' : 'producten'}`);
    });
    $$('[data-cart-empty]').forEach((el) => { el.hidden = n > 0; });
    $$('[data-cart-filled]').forEach((el) => { el.hidden = n === 0; });

    /* Op de productkaart wordt "In mandje" een aantal-keuze zodra het product in het mandje zit */
    $$('[data-stepper]').forEach((box) => {
      const id = box.dataset.stepper;
      const line = lines.find((l) => l.id === id);
      const qty = line ? line.qty : 0;
      const addBtn = $(`[data-add="${id}"]`);
      box.hidden = qty === 0;
      if (addBtn) addBtn.hidden = qty > 0;
      const shown = $('[data-step-count]', box);
      if (shown) shown.textContent = String(qty);
      const inc = $('[data-qty="inc"]', box);
      if (inc) inc.disabled = qty >= MAX_QTY;
    });

    if (!catalog) return;
    const active = document.activeElement;
    const activeList = active && active.closest ? active.closest('[data-cart-lines]') : null;
    const focused = activeList && active.dataset && active.dataset.qty
      ? { qty: active.dataset.qty, id: active.dataset.id, list: activeList } : null;
    $$('[data-cart-lines]').forEach((list) => {
      const editable = list.hasAttribute('data-editable');
      list.innerHTML = lines.filter((l) => product(l.id)).map((l) => lineHTML(l, product(l.id), editable)).join('');
    });
    if (focused) {
      const again = $(`[data-qty="${focused.qty}"][data-id="${focused.id}"]`, focused.list) || $('[data-qty="inc"]', focused.list);
      if (again) again.focus();
    }
    const ship = shipping();
    /* Eén schakelaar: "paymentsLive" in data/products.json. Zolang die uit staat beloven we geen online betaling. */
    $$('[data-payment-note]').forEach((el) => {
      el.textContent = catalog.paymentsLive === true ? 'Veilig betalen via Mollie.' : 'We nemen contact met je op over betaling en bezorging.';
    });
    $$('[data-total-label]').forEach((el) => { el.textContent = ship === null ? 'Totaal exclusief bezorging' : 'Totaal'; });
    $$('[data-cart-subtotal]').forEach((el) => { el.textContent = fmt(subtotal()); });
    $$('[data-cart-shipping]').forEach((el) => { el.textContent = ship === null ? 'Kosten volgen' : ship === 0 ? 'Gratis' : fmt(ship); });
    $$('[data-cart-total]').forEach((el) => { el.textContent = fmt(total()); });
  };

  const ready = fetch('data/products.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data) => {
      catalog = data;
      const known = lines.filter((l) => product(l.id));
      if (known.length !== lines.length) lines = known;
      $$('[data-price-for]').forEach((el) => {
        const p = product(el.dataset.priceFor);
        if (p) el.textContent = fmt(p.priceCents);
      });
    })
    .catch(() => {})
    .then(render);

  /* Klein mandje-paneel onder het icoon. Het opent alleen als je op het icoon klikt, nooit vanzelf.
     Zonder JavaScript blijft het icoon een gewone link naar de afrekenpagina. */
  let panel = null;
  let scrim = null;
  let iconBtn = null;
  const isOpen = () => Boolean(panel && !panel.hidden);
  const buildPanel = () => {
    const header = $('.site-header');
    const shopHref = document.getElementById('producten') ? '#producten' : 'index.html#producten';
    panel = document.createElement('section');
    panel.className = 'minicart';
    panel.id = 'minicart';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Je mandje');
    panel.tabIndex = -1;
    panel.hidden = true;
    panel.innerHTML = `
      <div class="minicart__head">
        <h2>Je mandje</h2>
        <button type="button" class="round round--sm" data-minicart-close aria-label="Mandje sluiten"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
      </div>
      <div class="minicart__filled" data-cart-filled hidden>
        <ul class="cart-lines" data-cart-lines data-editable></ul>
        <div class="minicart__foot">
          <p class="minicart__sum"><span>Subtotaal</span><strong data-cart-subtotal></strong></p>
          <a class="btn btn--primary btn--block" href="afrekenen.html"><span class="btn__label">Afrekenen</span><span class="btn__arrow" aria-hidden="true">&rarr;</span></a>
          <p class="minicart__note" data-payment-note>We nemen contact met je op over betaling en bezorging.</p>
        </div>
      </div>
      <div class="minicart__empty" data-cart-empty>
        <p>Je mandje is nog leeg.</p>
        <a class="btn btn--dark" href="${shopHref}" data-minicart-close><span class="btn__label">Bekijk de producten</span><span class="btn__arrow" aria-hidden="true">&rarr;</span></a>
      </div>`;
    scrim = document.createElement('div');
    scrim.className = 'minicart__scrim';
    scrim.setAttribute('data-minicart-close', '');
    scrim.hidden = true;
    /* direct na de header, zodat de tabvolgorde bij het icoon aansluit */
    header.after(scrim);
    header.after(panel);
  };
  const openPanel = (btn) => {
    if (!panel) buildPanel();
    iconBtn = btn;
    render();
    panel.hidden = false;
    scrim.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    panel.focus({ preventScroll: true });
  };
  const closePanel = (returnFocus = true) => {
    if (!isOpen()) return;
    panel.hidden = true;
    scrim.hidden = true;
    if (iconBtn) {
      iconBtn.setAttribute('aria-expanded', 'false');
      if (returnFocus) iconBtn.focus({ preventScroll: true });
    }
  };

  $$('.cart-btn').forEach((btn) => {
    if (btn.getAttribute('aria-current') === 'page') return;
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'minicart');
    btn.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (isOpen()) closePanel(); else openPanel(btn);
    });
  });

  const bump = () => {
    $$('.cart-btn').forEach((el) => {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    });
  };

  document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-add]');
    if (addBtn) {
      const id = addBtn.dataset.add;
      add(id);
      bump();
      const inc = $(`[data-stepper="${id}"] [data-qty="inc"]`);
      if (inc) inc.focus({ preventScroll: true });
      return;
    }
    const q = e.target.closest('[data-qty]');
    if (q) {
      const line = lines.find((l) => l.id === q.dataset.id);
      if (!line) return;
      const fromCard = q.closest('[data-stepper]');
      if (q.dataset.qty === 'inc') setQty(line.id, line.qty + 1);
      else if (q.dataset.qty === 'dec') setQty(line.id, line.qty - 1);
      else setQty(line.id, 0);
      if (fromCard && !lines.some((l) => l.id === line.id)) {
        const back = $(`[data-add="${line.id}"]`);
        if (back) back.focus({ preventScroll: true });
      }
      return;
    }
    if (e.target.closest('[data-minicart-close]')) closePanel(!e.target.closest('a'));
  });

  /* Sluiten met een klik naast het paneel, met Esc, of als de focus het paneel verlaat */
  document.addEventListener('pointerdown', (e) => {
    if (!isOpen()) return;
    if (panel.contains(e.target) || e.target.closest('.cart-btn')) return;
    closePanel(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) closePanel();
  });
  document.addEventListener('focusin', (e) => {
    if (!isOpen()) return;
    if (panel.contains(e.target) || e.target.closest('.cart-btn')) return;
    closePanel(false);
  });

  /* Mandje bijwerken als er in een ander tabblad iets verandert */
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try { lines = JSON.parse(e.newValue || '[]'); } catch (_) { lines = []; }
    render();
  });

  window.BuytCart = {
    ready,
    fmt,
    clear,
    count,
    total,
    paymentsLive: () => Boolean(catalog && catalog.paymentsLive === true),
    subtotal,
    shipping,
    items: () => lines.filter((l) => product(l.id)).map((l) => ({ id: l.id, name: product(l.id).name, qty: l.qty, priceCents: product(l.id).priceCents }))
  };

  render();
})();
