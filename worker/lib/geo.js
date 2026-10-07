// Het (voorlopige) bezorggebied: een eigen cirkel per bezorgstad, ongeveer zo groot als de stad zelf en zonder extra marge.
// Een punt ligt "binnen" als het in een van de cirkels valt. Ruw, voor de kaart en voor "binnen of buiten"; postcodes volgen
// zodra de bezorgpartner definitief is.
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

// Ongeveer de straal van de bebouwde kom van elke stad, in kilometers. Bijstellen kan hier.
export const CITY_RADIUS_KM = { Amsterdam: 8, Amstelveen: 4, Haarlem: 4, Utrecht: 6, Rotterdam: 10, 'Den Haag': 6.5 };

// Extra kilometers rond elke stad. Nu geen: de cirkel is de stad zelf.
export const ZONE_MARGIN_KM = 0;

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;

// Afstand over het aardoppervlak in kilometers.
export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const DELIVERY_ZONES = DELIVERY_CITIES.map((city) => ({
  city,
  lat: CITY_CENTERS[city].lat,
  lng: CITY_CENTERS[city].lng,
  radiusKm: CITY_RADIUS_KM[city] + ZONE_MARGIN_KM
}));

export const insideArea = (point, zones = DELIVERY_ZONES) => zones.some((z) => haversineKm(z, point) <= z.radiusKm);
