import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, DELIVERY_ZONES, CITY_CENTERS, CITY_RADIUS_KM, ZONE_MARGIN_KM, insideArea } from '../lib/geo.js';
import { DELIVERY_CITIES } from '../lib/cities.js';

test('afstand: Amsterdam–Rotterdam is ongeveer 57 km, en dezelfde plek is nul', () => {
  const d = haversineKm(CITY_CENTERS.Amsterdam, CITY_CENTERS.Rotterdam);
  assert.ok(d > 54 && d < 60, `afstand ${d}`);
  assert.equal(haversineKm(CITY_CENTERS.Utrecht, CITY_CENTERS.Utrecht), 0);
});

test('elke bezorgstad heeft een eigen cirkel zonder extra marge', () => {
  assert.equal(DELIVERY_ZONES.length, DELIVERY_CITIES.length);
  assert.equal(ZONE_MARGIN_KM, 0);
  for (const z of DELIVERY_ZONES) {
    assert.equal(z.radiusKm, CITY_RADIUS_KM[z.city]);
    assert.ok(z.radiusKm >= 3 && z.radiusKm <= 12, `${z.city} straal ${z.radiusKm}`);
    assert.deepEqual([z.lat, z.lng], [CITY_CENTERS[z.city].lat, CITY_CENTERS[z.city].lng]);
  }
});

test('het midden van elke stad ligt in de eigen cirkel', () => {
  for (const city of DELIVERY_CITIES) assert.ok(insideArea(CITY_CENTERS[city]), `${city} valt buiten zijn cirkel`);
});

test('binnen en buiten: wijken van de stad binnen, plaatsen ertussen en verder weg buiten', () => {
  assert.ok(insideArea({ lat: 52.3025, lng: 4.9440 }), 'Amsterdam Zuidoost');
  assert.ok(insideArea({ lat: 52.3400, lng: 4.9600 }), 'Diemen-kant van Amsterdam');
  assert.ok(insideArea({ lat: 51.9500, lng: 4.5500 }), 'Rotterdam-Alexander');
  assert.equal(insideArea({ lat: 52.4392, lng: 4.8292 }), false, 'Zaandam');
  assert.equal(insideArea({ lat: 52.1601, lng: 4.4970 }), false, 'Leiden');
  assert.equal(insideArea({ lat: 51.9993, lng: 4.3626 }), false, 'Delft');
  assert.equal(insideArea({ lat: 51.4416, lng: 5.4697 }), false, 'Eindhoven');
  assert.equal(insideArea({ lat: 53.2194, lng: 6.5665 }), false, 'Groningen');
});

test('de randen sluiten aan op de straal: net erbinnen en net erbuiten', () => {
  const a = CITY_CENTERS.Utrecht;
  const dLat = (km) => km / 110.57;
  assert.ok(insideArea({ lat: a.lat + dLat(CITY_RADIUS_KM.Utrecht - 0.2), lng: a.lng }));
  assert.equal(insideArea({ lat: a.lat + dLat(CITY_RADIUS_KM.Utrecht + 0.5), lng: a.lng }), false);
});
