/* "Waarom gans?": vier tabbladen boven een foto, de tekstkaart wisselt mee.
   Pijltjestoetsen, Home en End werken zoals bij elk tabblad; zonder JavaScript staat alleen het eerste blok open. */
(() => {
  const root = document.getElementById('waarom-gans');
  if (!root) return;
  const stage = root.querySelector('.wg__stage');
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));

  const select = (index, focus) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    stage.dataset.active = tabs[index].id.replace('wg-tab-', '');
    /* Op smalle schermen scrollt de tabbalk: houd het gekozen tabblad in beeld */
    if (bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: Math.max(0, tabs[index].offsetLeft - 16), behavior: 'smooth' });
    if (focus) tabs[index].focus();
  };

  /* De tabbalk scrolt op smalle schermen. Met vinger gaat dat vanzelf; met een muis (ook in de mobiele weergave van
     een browser) laten we hem ook slepen. Na een sleep telt het loslaten niet als klik op een tabblad. */
  const bar = root.querySelector('.wg__tabs');
  let drag = null;
  let dragged = false;
  bar.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || bar.scrollWidth <= bar.clientWidth) return;
    drag = { x: e.clientX, left: bar.scrollLeft, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 5) return;
    drag.moved = true;
    bar.classList.add('is-dragging');
    bar.scrollLeft = drag.left - dx;
  });
  const endDrag = () => {
    if (!drag) return;
    dragged = drag.moved;
    drag = null;
    bar.classList.remove('is-dragging');
    if (dragged) setTimeout(() => { dragged = false; }, 0);
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  bar.addEventListener('click', (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); } }, true);

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i, false));
    tab.addEventListener('keydown', (e) => {
      const last = tabs.length - 1;
      const keys = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: last };
      if (e.key in keys) { e.preventDefault(); select(keys[e.key], true); }
    });
  });

  /* Vorige/volgende-pijlen naast de tekstkaart: bladeren door de vier blokken, rond van het laatste naar het eerste.
     De pijl staat in elke kaart; na het wisselen krijgt dezelfde pijl in de nieuwe kaart de focus. */
  root.addEventListener('click', (e) => {
    const step = e.target.closest('[data-wg-step]');
    if (!step) return;
    const dir = Number(step.dataset.wgStep);
    const current = Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
    const next = (current + dir + tabs.length) % tabs.length;
    select(next, false);
    const again = panels[next].querySelector(`[data-wg-step="${dir}"]`);
    if (again) again.focus({ preventScroll: true });
  });
})();
