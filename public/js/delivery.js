/* Bezorgmoment kiezen: haalt de eerstvolgende boekbare data en tijdsloten op bij de server
   (capaciteit en cutoff worden altijd op de server bepaald, nooit in de browser) en zet ze
   als keuzerondjes neer, gegroepeerd per dag. */
(() => {
  const panel = document.querySelector('[data-delivery-panel]');
  if (!panel) return;
  const container = panel.querySelector('[data-delivery-slots]');
  const err = panel.querySelector('[data-delivery-err]');

  const dayLabel = (dateStr, weekday) => {
    const d = new Date(dateStr + 'T00:00:00');
    const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `${cap} ${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' }).format(d)}`;
  };
  const capLabel = (remaining) => (remaining === 0 ? 'Vol' : remaining <= 2 ? `Nog ${remaining} plekken` : 'Plek beschikbaar');

  function render(slots) {
    err.hidden = true;
    if (!slots.length) {
      container.innerHTML = '<p class="field__hint">Er zijn op dit moment geen bezorgmomenten beschikbaar. Neem contact met ons op.</p>';
      return;
    }
    const byDate = new Map();
    slots.forEach((s) => {
      if (!byDate.has(s.date)) byDate.set(s.date, { weekday: s.weekday, items: [] });
      byDate.get(s.date).items.push(s);
    });
    container.innerHTML = [...byDate.entries()].map(([date, { weekday, items }]) => `
      <fieldset class="field field--choice delivery-day">
        <legend>${dayLabel(date, weekday)}</legend>
        ${items.map((s) => `
          <label>
            <input type="radio" name="delivery_slot" value="${date}|${s.window}" ${s.remaining === 0 ? 'disabled' : ''} required>
            <span>${s.window.replace('-', ' – ')} uur</span>
            <span class="delivery-slot__cap">${capLabel(s.remaining)}</span>
          </label>
        `).join('')}
      </fieldset>
    `).join('');
  }

  function load() {
    container.innerHTML = '<p class="field__hint">Bezorgmomenten laden…</p>';
    return fetch('/api/delivery-slots')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(({ slots }) => render(slots || []))
      .catch(() => {
        container.innerHTML = '';
        err.textContent = 'Bezorgmomenten konden niet worden geladen. Ververs de pagina of probeer het later opnieuw.';
        err.hidden = false;
      });
  }

  load();
  // checkout.js roept dit aan als een gekozen slot intussen vol bleek te zijn.
  window.BuytDelivery = { refresh: load };
})();
