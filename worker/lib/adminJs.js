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

  // QR-code voor de 2FA-instelpagina
  const qr = document.getElementById('qr');
  if (qr && window.QRCode && qr.dataset.text) new window.QRCode(qr, { text: qr.dataset.text, width: 200, height: 200 });
})();
`;
