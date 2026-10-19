/* "Waarom gans?": vier tabbladen boven een foto, de tekstkaart wisselt mee.
   Pijltjestoetsen, Home en End werken zoals bij elk tabblad; zonder JavaScript staat alleen het eerste blok open. */
(() => {
  const root = document.getElementById('waarom-gans');
  if (!root) return;
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));

  const select = (index, focus) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) tabs[index].focus();
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i, false));
    tab.addEventListener('keydown', (e) => {
      const last = tabs.length - 1;
      const keys = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: last };
      if (e.key in keys) { e.preventDefault(); select(keys[e.key], true); }
    });
  });
})();
