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
      <span class="cart-line__img" style="--tile:${esc(p.tile || '#DDE6C4')}"><img src="${esc(p.image)}" alt="" width="72" height="72"></span>
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

    if (!catalog) return;
    const focused = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.qty
      ? { qty: document.activeElement.dataset.qty, id: document.activeElement.dataset.id } : null;
    $$('[data-cart-lines]').forEach((list) => {
      const editable = list.hasAttribute('data-editable');
      list.innerHTML = lines.filter((l) => product(l.id)).map((l) => lineHTML(l, product(l.id), editable)).join('');
    });
    if (focused) {
      const again = $(`[data-qty="${focused.qty}"][data-id="${focused.id}"]`) || $('[data-qty="inc"]');
      if (again) again.focus();
    }
    const ship = shipping();
    $$('[data-cart-subtotal]').forEach((el) => { el.textContent = fmt(subtotal()); });
    $$('[data-cart-shipping]').forEach((el) => { el.textContent = ship === null ? 'Wordt berekend' : ship === 0 ? 'Gratis' : fmt(ship); });
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

  /* Mandje-paneel: verschijnt als je iets toevoegt */
  let drawer = null;
  let lastTrigger = null;
  const buildDrawer = () => {
    drawer = document.createElement('div');
    drawer.className = 'drawer';
    drawer.innerHTML = `
      <div class="drawer__scrim" data-drawer-close></div>
      <aside class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabindex="-1">
        <div class="drawer__head">
          <h2 id="drawer-title">Toegevoegd aan je mandje</h2>
          <button type="button" class="round round--sm" data-drawer-close aria-label="Mandje sluiten"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
        </div>
        <div class="drawer__body">
          <ul class="cart-lines" data-cart-lines data-editable></ul>
        </div>
        <div class="drawer__foot">
          <p class="drawer__sum"><span>Subtotaal</span><strong data-cart-subtotal></strong></p>
          <a class="btn btn--primary btn--block" href="afrekenen.html"><span class="btn__label">Afrekenen</span><span class="btn__arrow" aria-hidden="true">&rarr;</span></a>
          <button type="button" class="drawer__continue" data-drawer-close>Verder winkelen</button>
          <p class="drawer__note">Veilig betalen via Mollie.</p>
        </div>
      </aside>`;
    document.body.appendChild(drawer);
  };
  const openDrawer = (trigger) => {
    if (!drawer) buildDrawer();
    lastTrigger = trigger || null;
    render();
    document.documentElement.classList.add('drawer-open');
    requestAnimationFrame(() => {
      drawer.classList.add('open');
      $('.drawer__panel', drawer).focus({ preventScroll: true });
    });
  };
  const closeDrawer = () => {
    if (!drawer) return;
    drawer.classList.remove('open');
    document.documentElement.classList.remove('drawer-open');
    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus({ preventScroll: true });
  };

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
      add(addBtn.dataset.add);
      bump();
      const arrow = $('.btn__arrow', addBtn);
      if (arrow) {
        arrow.textContent = '✓';
        setTimeout(() => { arrow.textContent = '+'; }, 1600);
      }
      openDrawer(addBtn);
      return;
    }
    const q = e.target.closest('[data-qty]');
    if (q) {
      const line = lines.find((l) => l.id === q.dataset.id);
      if (!line) return;
      if (q.dataset.qty === 'inc') setQty(line.id, line.qty + 1);
      else if (q.dataset.qty === 'dec') setQty(line.id, line.qty - 1);
      else setQty(line.id, 0);
      return;
    }
    if (e.target.closest('[data-drawer-close]')) closeDrawer();
  });

  document.addEventListener('keydown', (e) => {
    if (!drawer || !drawer.classList.contains('open')) return;
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    const focusable = $$('a[href], button:not([disabled])', $('.drawer__panel', drawer)).filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === $('.drawer__panel', drawer))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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
    subtotal,
    shipping,
    items: () => lines.filter((l) => product(l.id)).map((l) => ({ id: l.id, name: product(l.id).name, qty: l.qty, priceCents: product(l.id).priceCents }))
  };

  render();
})();
