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
})();
