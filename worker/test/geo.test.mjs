import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, enclosingCircle, DELIVERY_AREA, CITY_CENTERS, insideArea, AREA_MARGIN_KM } from '../lib/geo.js';
import { DELIVERY_CITIES } from '../lib/cities.js';

test('afstand: Amsterdam–Rotterdam is ongeveer 57 km, en dezelfde plek is nul', () => {
  const d = haversineKm(CITY_CENTERS.Amsterdam, CITY_CENTERS.Rotterdam);
  assert.ok(d > 54 && d < 60, `afstand ${d}`);
  assert.equal(haversineKm(CITY_CENTERS.Utrecht, CITY_CENTERS.Utrecht), 0);
});

test('kleinste omcirkel: bevat alle punten en is niet groter dan nodig', () => {
  const pts = [{ lat: 52, lng: 4 }, { lat: 52, lng: 5 }, { lat: 52.5, lng: 4.5 }, { lat: 52.1, lng: 4.5 }];
  const c = enclosingCircle(pts);
  for (const p of pts) assert.ok(haversineKm(c, p) <= c.radiusKm + 0.3);
  // twee punten op één lijn: de cirkel heeft het midden als middelpunt en de halve afstand als straal
  const two = enclosingCircle([{ lat: 52, lng: 4 }, { lat: 52, lng: 5 }]);
  assert.ok(Math.abs(two.radiusKm - haversineKm({ lat: 52, lng: 4 }, { lat: 52, lng: 5 }) / 2) < 0.3);
});

test('bezorggebied: alle zes steden erin, met de marge, en een redelijke straal', () => {
  for (const city of DELIVERY_CITIES) assert.ok(insideArea(CITY_CENTERS[city]), `${city} valt buiten de cirkel`);
  assert.ok(DELIVERY_AREA.radiusKm > 25 + AREA_MARGIN_KM && DELIVERY_AREA.radiusKm < 45, `straal ${DELIVERY_AREA.radiusKm}`);
  assert.ok(DELIVERY_AREA.lat > 52.0 && DELIVERY_AREA.lat < 52.25 && DELIVERY_AREA.lng > 4.6 && DELIVERY_AREA.lng < 4.95);
});

test('binnen en buiten: nabije plaatsen binnen, verre plaatsen buiten', () => {
  assert.ok(insideArea({ lat: 52.4392, lng: 4.8292 }), 'Zaandam');
  assert.ok(insideArea({ lat: 52.1601, lng: 4.4970 }), 'Leiden');
  assert.ok(insideArea({ lat: 52.3025, lng: 4.9440 }), 'Amsterdam Zuidoost');
  assert.equal(insideArea({ lat: 51.4416, lng: 5.4697 }), false, 'Eindhoven');
  assert.equal(insideArea({ lat: 53.2194, lng: 6.5665 }), false, 'Groningen');
  assert.equal(insideArea({ lat: 51.2194, lng: 4.4025 }), false, 'Antwerpen');
});
