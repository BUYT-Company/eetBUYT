/* Tekstblokken schuiven zacht omhoog en verschijnen terwijl je scrolt, zoals op upfront.nl/pages/het-plan:
   kort (0,5 s), uitlopend en met een korte trap van 75 ms tussen blokken die tegelijk in beeld komen.
   Dit bestand regelt alles met de klasse .reveal en geeft de lopende teksten zelf die klasse. */
(() => {
  const TEXT = [
    '.story-teaser__lead', '.story-links', '.faq__soon', '.contact__lead', '.products-foot__note', '.newsletter__text',
    '.why__lead', '.why__close', '.why__item', '.mission__cols p',
    '.thanks__status [data-state] > p', '.thanks__help',
    '.panel__note', '.checkout__empty p'
  ].join(',');

  document.querySelectorAll(TEXT).forEach((el) => {
    if (!el.closest('.reveal, .hero, [data-in]')) el.classList.add('reveal');
  });

  const items = Array.from(document.querySelectorAll('.reveal')).filter((el) => !el.closest('.hero'));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    let i = 0;
    entries.filter((e) => e.isIntersecting).forEach((entry) => {
      const el = entry.target;
      el.style.setProperty('--rd', `${Math.min(i++, 5) * 75}ms`);
      el.classList.add('in');
      io.unobserve(el);
      setTimeout(() => el.style.removeProperty('--rd'), 1000);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  items.forEach((el) => io.observe(el));
})();
