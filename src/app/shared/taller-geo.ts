import { TallerConfianza } from './interfaces/taller-confianza';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export function coordsValidas(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Distancia en km (Haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistanciaKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** Cómo llegar: URL de Google Maps Directions. No requiere API key de billing. */
export function googleMapsDirectionsUrl(
  dest: GeoPoint,
  origin?: GeoPoint | null,
): string {
  const destination = `${dest.lat},${dest.lng}`;
  const params = new URLSearchParams({ api: '1', destination });
  if (origin && coordsValidas(origin.lat, origin.lng)) {
    params.set('origin', `${origin.lat},${origin.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Pin en OpenStreetMap (mapa completo, sin API key). */
export function osmMapUrl(point: GeoPoint, zoom = 16): string {
  return `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=${zoom}/${point.lat}/${point.lng}`;
}

/** Embed OSM para widget en página (un marcador). */
export function osmEmbedUrl(point: GeoPoint, delta = 0.012): string {
  const minLng = point.lng - delta;
  const minLat = point.lat - delta;
  const maxLng = point.lng + delta;
  const maxLat = point.lat + delta;
  return (
    `https://www.openstreetmap.org/export/embed.html?bbox=` +
    `${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}` +
    `&layer=mapnik&marker=${point.lat}%2C${point.lng}`
  );
}

export function puntoDe(taller: Pick<TallerConfianza, 'latitud' | 'longitud'>): GeoPoint | null {
  const lat = Number(taller.latitud);
  const lng = Number(taller.longitud);
  return coordsValidas(lat, lng) ? { lat, lng } : null;
}

export function ordenarPorCercania(
  talleres: TallerConfianza[],
  origin: GeoPoint,
): Array<TallerConfianza & { distanciaKm: number }> {
  return talleres
    .map((t) => {
      const p = puntoDe(t);
      return {
        ...t,
        distanciaKm: p ? haversineKm(origin, p) : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
}
