import {
  MOTOS_CATALOGO_SELECT,
  MOTOS_LISTA_SELECT,
  MOTOS_LISTA_CONDUCTOR_SELECT,
  MOTOS_EMBED_SELECT,
  MOTOS_OPERATIVO_SELECT,
  columnasDelSelect,
  esMotoCatalogoPublico,
  imagenCatalogoPublico,
  fotoDesdeImagenUrl,
  mapMotoCatalogo,
  mapMotoLista,
  normalizarUsoMoto,
} from './motos.service';

describe('listas livianas de motos (imagen_url)', () => {
  it('el select de landing pide imagen_url y nunca la columna imagen', () => {
    const cols = columnasDelSelect(MOTOS_CATALOGO_SELECT);
    expect(cols).toContain('imagen_url');
    expect(cols).not.toContain('imagen');
    expect(MOTOS_CATALOGO_SELECT).not.toMatch(/\*/);
    expect(MOTOS_CATALOGO_SELECT).not.toMatch(/usuarios/);
    expect(MOTOS_CATALOGO_SELECT).not.toMatch(/conductor/);
    expect(cols).toContain('uso');
  });

  it('el select de lista staff pide imagen_url y nunca la columna imagen ni *', () => {
    const cols = columnasDelSelect(MOTOS_LISTA_SELECT);
    expect(cols).toContain('imagen_url');
    expect(cols).toContain('cilindraje');
    expect(cols).toContain('color');
    expect(cols).toContain('anio');
    expect(cols).toContain('tiene_multas');
    expect(cols).toContain('uso');
    expect(cols).not.toContain('imagen');
    expect(MOTOS_LISTA_SELECT).not.toMatch(/\*/);
    expect(MOTOS_LISTA_SELECT).not.toMatch(/usuarios/);
    expect(MOTOS_LISTA_CONDUCTOR_SELECT).toMatch(/usuarios:conductor_id\(id,nombre,apellido\)/);
    expect(MOTOS_LISTA_CONDUCTOR_SELECT).not.toMatch(/conductor_id\(\*\)/);
  });

  it('el embed y el operativo piden imagen_url y nunca la columna imagen', () => {
    expect(columnasDelSelect(MOTOS_EMBED_SELECT)).toContain('imagen_url');
    expect(columnasDelSelect(MOTOS_EMBED_SELECT)).not.toContain('imagen');
    expect(MOTOS_EMBED_SELECT).not.toMatch(/\*/);
    expect(columnasDelSelect(MOTOS_OPERATIVO_SELECT)).toContain('imagen_url');
    expect(columnasDelSelect(MOTOS_OPERATIVO_SELECT)).not.toContain('imagen');
    expect(MOTOS_OPERATIVO_SELECT).not.toMatch(/\*/);
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
      imagen_url: 'https://cdn.example/dan78d.jpg',
      imagen: 'data:image/jpeg;base64,NOPE',
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
    expect(moto.imagenUrl).toBe('https://cdn.example/dan78d.jpg');
  });

  it('fotoDesdeImagenUrl solo acepta http en imagen_url; ignora el blob imagen', () => {
    expect(fotoDesdeImagenUrl({ imagen_url: 'https://cdn.example/ok.jpg', imagen: 'data:xx' })).toBe(
      'https://cdn.example/ok.jpg',
    );
    expect(fotoDesdeImagenUrl({ imagen_url: 'data:image/jpeg;base64,AAA', imagen: 'https://x/y.jpg' })).toBeUndefined();
    expect(fotoDesdeImagenUrl({ imagen: 'https://cdn.example/ignored.jpg' })).toBeUndefined();
    expect(imagenCatalogoPublico('data:image/jpeg;base64,/9j/AAA')).toBeUndefined();
    expect(imagenCatalogoPublico('https://storage.example/rip44g.jpg')).toBe(
      'https://storage.example/rip44g.jpg',
    );
  });

  it('mapMotoCatalogo no deja data: ni usa la columna imagen', () => {
    const moto = mapMotoCatalogo({
      id: 'm3',
      marca: 'AUTECO',
      modelo: '2008',
      placa: 'RIP-44G',
      estado: 'disponible',
      modalidad: 'liquidacion',
      imagen: 'data:image/jpeg;base64,' + 'A'.repeat(200),
      imagen_url: null,
    });
    expect(moto.imagen).toBeUndefined();
    expect(moto.imagenUrl).toBeUndefined();
    expect(moto.placa).toBe('RIP-44G');
  });

  it('mapMotoLista toma la foto solo de imagen_url http', () => {
    const conFoto = mapMotoLista({
      id: '1',
      marca: 'A',
      modelo: '1',
      placa: 'AAA',
      estado: 'disponible',
      imagen_url: 'https://cdn.example/aaa.jpg',
      imagen: 'data:image/jpeg;base64,XXXX',
    });
    const sinFoto = mapMotoLista({
      id: '2',
      marca: 'B',
      modelo: '2',
      placa: 'BBB',
      estado: 'en_uso',
      imagen_url: 'data:image/png;base64,YY',
      imagen: 'https://cdn.example/should-not-use.jpg',
    });
    expect(conFoto.imagen).toBe('https://cdn.example/aaa.jpg');
    expect(sinFoto.imagen).toBeUndefined();
    expect(sinFoto.placa).toBe('BBB');
  });

  it('la landing trata null como flota y oculta uso personal (QBQ-68D, PVT88H)', () => {
    expect(normalizarUsoMoto(null)).toBe('flota');
    expect(normalizarUsoMoto(undefined)).toBe('flota');
    expect(normalizarUsoMoto('flota')).toBe('flota');
    expect(esMotoCatalogoPublico({ uso: null })).toBe(true);
    expect(esMotoCatalogoPublico({ uso: 'flota' })).toBe(true);
    expect(esMotoCatalogoPublico({ uso: 'personal' })).toBe(false);
    const qbq = mapMotoCatalogo({
      id: 'p1',
      marca: 'BAJAJ',
      modelo: 'Pulsar',
      placa: 'QBQ-68D',
      estado: 'disponible',
      uso: 'personal',
    });
    const pvt = mapMotoCatalogo({
      id: 'p2',
      marca: 'AKT',
      modelo: 'NKD',
      placa: 'PVT88H',
      estado: 'disponible',
      uso: 'personal',
    });
    expect(qbq.uso).toBe('personal');
    expect(esMotoCatalogoPublico(qbq)).toBe(false);
    expect(esMotoCatalogoPublico(pvt)).toBe(false);
  });

  it('mapMotoLista trae cilindraje, color, anio, tiene_multas y uso', () => {
    const moto = mapMotoLista({
      id: '1',
      marca: 'AUTECO',
      modelo: '2008',
      placa: 'FSS51B',
      estado: 'disponible',
      cilindraje: 150,
      color: 'Rojo',
      anio: 2022,
      tiene_multas: true,
      uso: 'flota',
    });
    expect(moto.cilindraje).toBe(150);
    expect(moto.color).toBe('Rojo');
    expect(moto.anio).toBe(2022);
    expect(moto.tieneMultas).toBe(true);
    expect(moto.uso).toBe('flota');
  });
});
