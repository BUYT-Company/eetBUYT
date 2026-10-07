// Script voor de kaart op de Analytics-pagina, uitgeleverd op /admin/map.js. Leest de gegevens uit het blok
// <script type="application/json" id="buyt-map-data"> (alleen bestelnummer, plaats en punt, geen namen of adressen),
// tekent het bezorggebied als grote cirkel en elke bestelling als stip: lime binnen het gebied, koraal erbuiten.
// De stippen blijven op elk zoomniveau even groot op het scherm. Google roept initBuytMap aan zodra de kaart geladen is.
export default `
(function () {
  var COLORS = { inside: { fill: '#D8ED36', stroke: '#6F8200' }, outside: { fill: '#FF6652', stroke: '#B73A2A' } };
  var PIXELS = 6;

  function show(el, text) {
    el.textContent = '';
    var p = document.createElement('p');
    p.className = 'map__msg';
    p.textContent = text;
    el.appendChild(p);
  }

  window.gm_authFailure = function () {
    var el = document.getElementById('buyt-map');
    if (el) show(el, 'Google Maps kon niet laden. Controleer de API-sleutel: staat de Maps JavaScript API aan, is er een betaalrekening aan het project gekoppeld, en staat eetbuyt.nl bij de toegestane websites?');
  };

  window.initBuytMap = function () {
    var el = document.getElementById('buyt-map');
    var raw = document.getElementById('buyt-map-data');
    if (!el || !raw || !window.google || !google.maps) return;
    var data;
    try { data = JSON.parse(raw.textContent); } catch (e) { show(el, 'De kaartgegevens konden niet worden gelezen.'); return; }

    var center = { lat: data.area.lat, lng: data.area.lng };
    var map = new google.maps.Map(el, {
      center: center, zoom: 9, mapTypeControl: false, streetViewControl: false,
      fullscreenControl: true, clickableIcons: false, gestureHandling: 'cooperative'
    });
    var area = new google.maps.Circle({
      map: map, center: center, radius: data.area.radiusKm * 1000, clickable: false,
      strokeColor: '#007F4F', strokeOpacity: 0.9, strokeWeight: 2, fillColor: '#007F4F', fillOpacity: 0.06
    });
    map.fitBounds(area.getBounds());

    var info = new google.maps.InfoWindow();
    var dots = data.points.map(function (p) {
      var c = COLORS[p.in ? 'inside' : 'outside'];
      var dot = new google.maps.Circle({
        map: map, center: { lat: p.lat, lng: p.lng }, radius: 500,
        strokeColor: c.stroke, strokeOpacity: 1, strokeWeight: 1.5, fillColor: c.fill, fillOpacity: 1, zIndex: p.in ? 2 : 3
      });
      dot.addListener('click', function () {
        var box = document.createElement('div');
        box.textContent = 'BUYT-' + p.n + ' \\u00b7 ' + p.c;
        info.setContent(box);
        info.setPosition(dot.getCenter());
        info.open(map);
      });
      return dot;
    });

    function resize() {
      var z = map.getZoom() || 9;
      var metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, z);
      dots.forEach(function (d) { d.setRadius(PIXELS * metersPerPixel); });
    }
    map.addListener('zoom_changed', resize);
    resize();
  };
})();
`;
