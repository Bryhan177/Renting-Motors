import {
  MOTOS_CATALOGO_SELECT,
  imagenCatalogoPublico,
  mapMotoCatalogo,
} from './motos.service';

describe('catálogo público de motos', () => {
  it('el select de landing no embebe usuarios ni pide *', () => {
    expect(MOTOS_CATALOGO_SELECT).not.toMatch(/\*/);
    expect(MOTOS_CATALOGO_SELECT).not.toMatch(/usuarios/);
    expect(MOTOS_CATALOGO_SELECT).not.toMatch(/conductor/);
    expect(MOTOS_CATALOGO_SELECT).toMatch(/marca/);
    expect(MOTOS_CATALOGO_SELECT).toMatch(/placa/);
    expect(MOTOS_CATALOGO_SELECT).toMatch(/imagen/);
  });

  it('mapea motos sin join de conductor aunque el row traiga usuarios', () => {
    const moto = mapMotoCatalogo({
      id: 'm2',
      marca: 'BAJAJ',
      modelo: 'Pulsar',
      placa: 'DAN78D',
      estado: 'en_uso',
      modalidad: 'arriendo',
      precio_cobro: 150000,
      imagen: 'https://cdn.example/dan78d.jpg',
      conductor_id: 'u-secret',
      usuarios: {
        id: 'u-secret',
        nombre: 'PII',
        apellido: 'Oculto',
        cedula: '123',
        email: 'hidden@test.com',
      },
    });
    expect(moto.placa).toBe('DAN78D');
    expect(moto.marca).toBe('BAJAJ');
    expect(moto.modelo).toBe('Pulsar');
    expect(moto.estado).toBe('en_uso');
    expect(moto.conductor).toBeUndefined();
    expect(moto.conductorId).toBeNull();
    expect(moto.imagen).toBe('https://cdn.example/dan78d.jpg');
  });

  it('descarta imagen data: para no colgar el <img>', () => {
    expect(imagenCatalogoPublico('data:image/jpeg;base64,/9j/AAA')).toBeUndefined();
    expect(imagenCatalogoPublico('  DATA:image/png;base64,xx  ')).toBeUndefined();
    expect(imagenCatalogoPublico('')).toBeUndefined();
    expect(imagenCatalogoPublico(null)).toBeUndefined();
    expect(imagenCatalogoPublico('https://storage.example/rip44g.jpg')).toBe(
      'https://storage.example/rip44g.jpg',
    );
  });

  it('mapMotoCatalogo no deja data: en imagen', () => {
    const moto = mapMotoCatalogo({
      id: 'm3',
      marca: 'AUTECO',
      modelo: '2008',
      placa: 'RIP-44G',
      estado: 'disponible',
      modalidad: 'liquidacion',
      imagen: 'data:image/jpeg;base64,' + 'A'.repeat(200),
    });
    expect(moto.imagen).toBeUndefined();
    expect(moto.placa).toBe('RIP-44G');
    expect(moto.marca).toBe('AUTECO');
  });
});
