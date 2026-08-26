import {
  coordsValidas,
  formatDistanciaKm,
  googleMapsDirectionsUrl,
  haversineKm,
  ordenarPorCercania,
  osmEmbedUrl,
  osmMapUrl,
} from './taller-geo';
import { TallerConfianza } from './interfaces/taller-confianza';
import { mapTallerFromRow, serviciosLista, tallerToDb } from './interfaces/taller-confianza';

describe('taller-geo', () => {
  it('haversine entre dos puntos de Bogotá es unos pocos km', () => {
    const km = haversineKm(
      { lat: 4.711, lng: -74.0721 },
      { lat: 4.653, lng: -74.083 },
    );
    expect(km).toBeGreaterThan(4);
    expect(km).toBeLessThan(10);
  });

  it('rechaza 0,0 y rangos inválidos', () => {
    expect(coordsValidas(4.71, -74.07)).toBe(true);
    expect(coordsValidas(91, 0)).toBe(false);
    expect(coordsValidas(0, 181)).toBe(false);
  });

  it('Cómo llegar no pide billing key; OSM sirve de pin y embed', () => {
    const dest = { lat: 4.711, lng: -74.0721 };
    const dir = googleMapsDirectionsUrl(dest, { lat: 4.65, lng: -74.08 });
    expect(dir).toContain('https://www.google.com/maps/dir/?');
    expect(dir).toContain('api=1');
    expect(dir).toContain('destination=4.711');
    expect(dir).toContain('origin=4.65');
    expect(dir).not.toMatch(/key=/);
    expect(osmMapUrl(dest)).toContain('openstreetmap.org');
    expect(osmEmbedUrl(dest)).toContain('export/embed.html');
    expect(osmEmbedUrl(dest)).toContain('marker=4.711');
  });

  it('ordenarPorCercania pone primero el más cerca y formatea m/km', () => {
    const origen = { lat: 4.711, lng: -74.0721 };
    const talleres: TallerConfianza[] = [
      {
        _id: 'lejos',
        nombre: 'Lejos',
        direccion: 'a',
        telefono: '1',
        latitud: 6.25,
        longitud: -75.56,
        horario: '',
        servicios: '',
        activo: true,
      },
      {
        _id: 'cerca',
        nombre: 'Cerca',
        direccion: 'b',
        telefono: '2',
        latitud: 4.712,
        longitud: -74.073,
        horario: '',
        servicios: '',
        activo: true,
      },
    ];
    const ordered = ordenarPorCercania(talleres, origen);
    expect(ordered[0]._id).toBe('cerca');
    expect(formatDistanciaKm(0.35)).toBe('350 m');
    expect(formatDistanciaKm(12)).toBe('12 km');
  });
});

describe('taller mapper', () => {
  it('mapea snake_case de Postgres a camelCase', () => {
    const t = mapTallerFromRow({
      id: 'abc',
      nombre: 'Central',
      direccion: 'Cra 7',
      telefono: '300',
      latitud: '4.711',
      longitud: '-74.0721',
      horario: '8-18',
      servicios: 'Llantas, aceite',
      activo: true,
      created_at: '2026-08-26',
      updated_at: '2026-08-26',
    });
    expect(t._id).toBe('abc');
    expect(t.latitud).toBeCloseTo(4.711);
    expect(t.longitud).toBeCloseTo(-74.0721);
    expect(serviciosLista(t.servicios)).toEqual(['Llantas', 'aceite']);
  });

  it('tallerToDb recorta textos y convierte números', () => {
    const db = tallerToDb({
      nombre: '  Central  ',
      direccion: ' Cra 7 ',
      telefono: ' 300 ',
      latitud: 4.7 as any,
      longitud: -74.1 as any,
      horario: ' 8-18 ',
      servicios: ' Llantas ',
      activo: true,
    });
    expect(db['nombre']).toBe('Central');
    expect(db['latitud']).toBe(4.7);
    expect(db['activo']).toBe(true);
  });
});
