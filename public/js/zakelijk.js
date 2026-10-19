/* Zakelijk en samenwerken: het formulier past zich aan op de keuze "afnemen" of "samenwerken".
   Knoppen met data-soort en de ankers #afnemen en #samenwerken kiezen de juiste optie alvast. */
(() => {
  const form = document.querySelector('form[name="bestellen"]');
  if (!form) return;
  const radios = [...form.querySelectorAll('input[name="soort"]')];
  if (!radios.length) return;
  const company = form.querySelector('#f-bedrijf');
  const phone = form.querySelector('#f-telefoon');
  const message = form.querySelector('#f-bericht');

  const PLACEHOLDER = {
    afnemen: 'Bijvoorbeeld: welke producten, ongeveer hoeveel en voor welke datum.',
    samenwerken: 'Bijvoorbeeld: wie je bent en wat je met ons wilt doen.'
  };

  const current = () => (radios.find((r) => r.checked) || radios[0]).value;
  const apply = () => {
    const soort = current();
    document.querySelectorAll('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== soort; });
    const needed = soort === 'afnemen';
    if (company) company.required = needed;
    if (phone) phone.required = needed;
    if (message) message.placeholder = PLACEHOLDER[soort];
  };
  const choose = (soort) => {
    const radio = radios.find((r) => r.value === soort);
    if (radio) { radio.checked = true; apply(); }
  };

  radios.forEach((r) => r.addEventListener('change', apply));
  form.addEventListener('reset', () => setTimeout(apply, 0));
  document.querySelectorAll('[data-soort]').forEach((el) => el.addEventListener('click', () => choose(el.dataset.soort)));

  const fromHash = () => {
    if (location.hash === '#samenwerken') choose('samenwerken');
    else if (location.hash === '#afnemen') choose('afnemen');
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();
  apply();

  /* Zijpaneel met details per soort afnemer. Een echte <dialog>: Esc, focusval en achtergrond-inert komen vanzelf mee. */
  const panel = document.getElementById('venue-panel');
  if (panel) {
    const head = panel.querySelector('#venue-head');
    const title = panel.querySelector('#venue-title');
    const contents = [...panel.querySelectorAll('.zb-panel__content')];
    let opener = null;
    let closing = false;

    const open = (key, trigger) => {
      const content = contents.find((c) => c.dataset.for === key);
      if (!content || closing) return;
      contents.forEach((c) => { c.hidden = c !== content; });
      title.innerHTML = content.dataset.title;
      head.style.setProperty('--panel-bg', content.dataset.bg);
      head.style.setProperty('--panel-fg', content.dataset.fg);
      panel.querySelector('.zb-panel__body').scrollTop = 0;
      opener = trigger;
      panel.showModal();
      requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('is-open')));
    };
    const close = (immediate) => {
      if (!panel.open) return;
      panel.classList.remove('is-open');
      const done = () => { panel.close(); closing = false; if (opener && !immediate) opener.focus({ preventScroll: true }); };
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (immediate || reduced) { done(); return; }
      closing = true;
      let finished = false;
      const finish = () => { if (!finished) { finished = true; done(); } };
      panel.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 600);
    };

    document.querySelectorAll('[data-venue]').forEach((btn) => btn.addEventListener('click', () => open(btn.dataset.venue, btn)));
    panel.querySelectorAll('[data-close-panel]').forEach((el) => el.addEventListener('click', () => close(el.tagName === 'A')));
    panel.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    panel.addEventListener('click', (e) => { if (e.target === panel) close(false); });
  }
})();
