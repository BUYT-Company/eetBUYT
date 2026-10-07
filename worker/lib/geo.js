// Het (voorlopige) bezorggebied als cirkel: de kleinste cirkel om de middelpunten van de bezorgsteden, plus een marge.
// Ruw, op de kaart en voor "binnen of buiten"; postcodes volgen zodra de bezorgpartner definitief is.
import { DELIVERY_CITIES } from './cities.js';

// Ongeveer het midden van elke stad (breedtegraad, lengtegraad).
export const CITY_CENTERS = {
  Amsterdam: { lat: 52.3676, lng: 4.9041 },
  Amstelveen: { lat: 52.3081, lng: 4.8642 },
  Haarlem: { lat: 52.3874, lng: 4.6462 },
  Utrecht: { lat: 52.0907, lng: 5.1214 },
  Rotterdam: { lat: 51.9225, lng: 4.4792 },
  'Den Haag': { lat: 52.0705, lng: 4.3007 }
};

// Marge rond de steden, zodat de randen van een stad (en de buurten eromheen) erbinnen vallen.
export const AREA_MARGIN_KM = 6;

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;

// Afstand over het aardoppervlak in kilometers.
export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Kleinste omcirkel van een paar punten: alle paren en drietallen proberen (bij enkele punten is dat meer dan snel genoeg).
// Er wordt gerekend op een platte kaart rond het gemiddelde; op deze afstanden (tientallen kilometers) is dat nauwkeurig genoeg.
export function enclosingCircle(points) {
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng0 = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const kx = Math.cos(rad(lat0)) * 111.32;
  const ky = 110.57;
  const pts = points.map((p) => ({ x: (p.lng - lng0) * kx, y: (p.lat - lat0) * ky }));
  const covers = (c) => pts.every((p) => Math.hypot(p.x - c.x, p.y - c.y) <= c.r + 1e-9);
  let best = null;
  const consider = (c) => { if (c && covers(c) && (!best || c.r < best.r)) best = c; };
  for (let i = 0; i < pts.length; i++) {
    consider({ x: pts[i].x, y: pts[i].y, r: 0 });
    for (let j = i + 1; j < pts.length; j++) {
      consider({ x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2, r: Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) / 2 });
      for (let k = j + 1; k < pts.length; k++) {
        const [a, b, c] = [pts[i], pts[j], pts[k]];
        const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
        if (Math.abs(d) < 1e-12) continue;
        const ux = ((a.x ** 2 + a.y ** 2) * (b.y - c.y) + (b.x ** 2 + b.y ** 2) * (c.y - a.y) + (c.x ** 2 + c.y ** 2) * (a.y - b.y)) / d;
        const uy = ((a.x ** 2 + a.y ** 2) * (c.x - b.x) + (b.x ** 2 + b.y ** 2) * (a.x - c.x) + (c.x ** 2 + c.y ** 2) * (b.x - a.x)) / d;
        consider({ x: ux, y: uy, r: Math.hypot(a.x - ux, a.y - uy) });
      }
    }
  }
  return { lat: lat0 + best.y / ky, lng: lng0 + best.x / kx, radiusKm: best.r };
}

const base = enclosingCircle(DELIVERY_CITIES.map((c) => CITY_CENTERS[c]));
export const DELIVERY_AREA = { lat: base.lat, lng: base.lng, radiusKm: base.radiusKm + AREA_MARGIN_KM };

export const insideArea = (point, area = DELIVERY_AREA) => haversineKm(area, point) <= area.radiusKm;
