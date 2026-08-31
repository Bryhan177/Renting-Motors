import {
  MOTOS_CATALOGO_SELECT,
  MOTOS_LISTA_SELECT,
  MOTOS_LISTA_CONDUCTOR_SELECT,
  MOTOS_FOTOS_HTTP_PATTERN,
  imagenCatalogoPublico,
  mapMotoCatalogo,
  mapMotoLista,
  mergeFotosHttp,
} from './motos.service';

describe('listas livianas de motos', () => {
  it('el select de landing no pide imagen, * ni usuarios', () => {
    expect(MOTOS_CATALOGO_SELECT).not.toMatch(/\*/);
    expect(MOTOS_CATALOGO_SELECT).not.toMatch(/usuarios/);
    expect(MOTOS_CATALOGO_SELECT).not.toMatch(/conductor/);
    expect(MOTOS_CATALOGO_SELECT).not.toMatch(/imagen/);
    expect(MOTOS_CATALOGO_SELECT).toMatch(/marca/);
    expect(MOTOS_CATALOGO_SELECT).toMatch(/placa/);
  });

  it('el select de lista staff no pide imagen ni *', () => {
    expect(MOTOS_LISTA_SELECT).not.toMatch(/\*/);
    expect(MOTOS_LISTA_SELECT).not.toMatch(/imagen/);
    expect(MOTOS_LISTA_SELECT).not.toMatch(/usuarios/);
    expect(MOTOS_LISTA_CONDUCTOR_SELECT).toMatch(/usuarios:conductor_id\(id,nombre,apellido\)/);
    expect(MOTOS_LISTA_CONDUCTOR_SELECT).not.toMatch(/conductor_id\(\*\)/);
    expect(MOTOS_FOTOS_HTTP_PATTERN).toBe('http%');
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

  it('descarta imagen data: y no-http para no colgar el <img>', () => {
    expect(imagenCatalogoPublico('data:image/jpeg;base64,/9j/AAA')).toBeUndefined();
    expect(imagenCatalogoPublico('  DATA:image/png;base64,xx  ')).toBeUndefined();
    expect(imagenCatalogoPublico('')).toBeUndefined();
    expect(imagenCatalogoPublico(null)).toBeUndefined();
    expect(imagenCatalogoPublico('/storage/motos/x.jpg')).toBeUndefined();
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

  it('mergeFotosHttp ignora data: y solo aplica http', () => {
    const motos = [
      mapMotoLista({ id: '1', marca: 'A', modelo: '1', placa: 'AAA', estado: 'disponible' }),
      mapMotoLista({ id: '2', marca: 'B', modelo: '2', placa: 'BBB', estado: 'en_uso' }),
    ];
    const merged = mergeFotosHttp(motos, [
      { id: '1', imagen: 'data:image/jpeg;base64,XXXX' },
      { id: '2', imagen: 'https://cdn.example/bbb.jpg' },
    ]);
    expect(merged[0].imagen).toBeUndefined();
    expect(merged[1].imagen).toBe('https://cdn.example/bbb.jpg');
    expect(merged[0].placa).toBe('AAA');
    expect(merged[1].placa).toBe('BBB');
  });
});
