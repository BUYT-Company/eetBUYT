/* De poldergroene balk schuift weg als je naar beneden scrolt en komt terug zodra je omhoog scrolt.
   Hij blijft staan bovenaan de pagina, bij een open menu, bij toetsenbordfocus in de balk en tijdens een anker-scroll. */
(() => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const TOP = 120;
  const STEP = 8;
  let lastY = window.scrollY;
  let ticking = false;

  const update = () => {
    ticking = false;
    const y = Math.max(0, window.scrollY);
    const delta = y - lastY;
    const pinned = y < TOP
      || header.contains(document.activeElement)
      || document.querySelector('.nav.open')
      || header.querySelector('.scroll-line.on');
    if (pinned || delta < -STEP) {
      header.classList.remove('is-hidden');
    } else if (delta > STEP) {
      header.classList.add('is-hidden');
    }
    if (Math.abs(delta) > STEP || pinned) lastY = y;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
})();
