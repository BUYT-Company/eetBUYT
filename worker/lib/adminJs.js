// Klein beetje JavaScript voor het beheer, uitgeleverd op /admin/admin.js (geen inline script, zodat de
// Content-Security-Policy strikt blijft). Alles werkt ook zonder dit bestand.
export default `
(() => {
  // Authenticatiecode: alleen cijfers, maximaal 6. Ook bij plakken ("123 456" wordt "123456").
  document.querySelectorAll('input[data-otp]').forEach((input) => {
    const clean = () => {
      const v = input.value.replace(/\\D/g, '').slice(0, 6);
      if (v !== input.value) input.value = v;
    };
    input.addEventListener('input', clean);
    input.addEventListener('paste', () => setTimeout(clean, 0));
  });

  // Een formulier maar één keer versturen (voorkomt dubbel klikken op een statusknop).
  document.querySelectorAll('form[data-once]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (form.dataset.sent) { e.preventDefault(); return; }
      form.dataset.sent = '1';
      form.querySelectorAll('button[type="submit"]').forEach((b) => { b.setAttribute('aria-disabled', 'true'); });
    });
  });

  // Kopieer-knop (bijvoorbeeld voor de gedeelde link) en veld dat zichzelf selecteert
  document.querySelectorAll('input[data-select]').forEach((input) => input.addEventListener('focus', () => input.select()));
  document.querySelectorAll('button[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
    const field = document.getElementById(btn.dataset.copy);
    if (!field) return;
    field.select();
    try { await navigator.clipboard.writeText(field.value); btn.textContent = 'Gekopieerd'; } catch (_) { document.execCommand('copy'); btn.textContent = 'Gekopieerd'; }
  }));

  // Grafieken: bij aanwijzen (muis), klikken of tikken (telefoon) of toetsenbordfocus op een kolom staat het aantal groot
  // boven de staaf. Tikken naast de grafiek of scrollen sluit het weer.
  const tip = document.createElement('div');
  tip.className = 'charttip';
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);
  let active = null;
  const part = (cls, text) => { const el = document.createElement('div'); el.className = cls; el.textContent = text; return el; };
  const hideTip = () => { tip.hidden = true; if (active) active.classList.remove('is-active'); active = null; };
  const showTip = (col) => {
    if (active && active !== col) active.classList.remove('is-active');
    active = col;
    col.classList.add('is-active');
    tip.textContent = '';
    tip.appendChild(part('charttip__date', col.dataset.d));
    tip.appendChild(part('charttip__value', col.dataset.v));
    if (col.dataset.p) tip.appendChild(part('charttip__prev', 'Vorige periode: ' + col.dataset.p));
    tip.hidden = false;
    const bar = col.querySelector('.chart__bar').getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.min(Math.max(8, bar.left + bar.width / 2 - w / 2), window.innerWidth - w - 8);
    tip.style.left = left + 'px';
    tip.style.top = Math.max(8, bar.top - h - 8) + 'px';
  };
  const colOf = (e) => (e.target.closest ? e.target.closest('.chart__col') : null);
  document.addEventListener('pointerover', (e) => { const col = colOf(e); if (col && e.pointerType === 'mouse') showTip(col); });
  document.addEventListener('pointerout', (e) => { if (e.pointerType === 'mouse' && colOf(e) && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.chart__col'))) hideTip(); });
  document.addEventListener('click', (e) => { const col = colOf(e); if (col) showTip(col); else hideTip(); });
  document.addEventListener('focusin', (e) => { const col = colOf(e); if (col) showTip(col); });
  document.addEventListener('focusout', (e) => { if (colOf(e)) hideTip(); });
  window.addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });

  // QR-code voor de 2FA-instelpagina
  const qr = document.getElementById('qr');
  if (qr && window.QRCode && qr.dataset.text) new window.QRCode(qr, { text: qr.dataset.text, width: 200, height: 200 });
})();
`;
