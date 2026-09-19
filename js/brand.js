/* Logo in de header: in rust een stilstaand logo, bij hover of toetsenbordfocus speelt de logo-animatie
   (dezelfde als bij het opstarten) één keer af. */
(() => {
  const img = document.querySelector('.brand img');
  if (!img || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ANIMATION = 'assets/logo-animatie.svg';
  const DURATION_MS = 1800;
  let blob = null;
  let loading = null;
  let playing = false;
  let currentUrl = null;

  const load = () => {
    if (!loading) {
      loading = fetch(ANIMATION)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then((b) => { blob = b; })
        .catch(() => { loading = null; });
    }
    return loading;
  };

  /* Elke keer een nieuwe blob-URL: dan start de SVG-animatie opnieuw bij 0 */
  const play = async () => {
    if (playing) return;
    await load();
    if (!blob || playing) return;
    playing = true;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(blob);
    img.src = currentUrl;
    setTimeout(() => { playing = false; }, DURATION_MS);
  };

  const brand = img.closest('.brand');
  brand.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') play(); });
  brand.addEventListener('focus', () => { if (brand.matches(':focus-visible')) play(); });

  /* Op desktop alvast ophalen zodra de pagina rustig is, zodat de eerste hover direct werkt */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    window.addEventListener('load', () => idle(load));
  }
})();
