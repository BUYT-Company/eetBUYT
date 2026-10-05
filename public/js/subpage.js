/* Menu en headerschaduw voor de pagina's naast de homepage (afrekenen, bedankt). */
(() => {
  const header = document.querySelector('.site-header');
  const burger = document.querySelector('.burger');
  const nav = document.getElementById('nav');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  if (!burger || !nav) return;
  let menuY = 0;
  const setMenu = (open) => {
    if (open) menuY = window.scrollY;
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
  };
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  window.addEventListener('scroll', () => { if (nav.classList.contains('open') && window.scrollY - menuY > 40) setMenu(false); }, { passive: true });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
})();
