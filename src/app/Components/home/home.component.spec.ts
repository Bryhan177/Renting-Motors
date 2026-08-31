import { of } from 'rxjs';
import { HomeComponent } from './home.component';
import { MotosService, mapMotoCatalogo } from '../../service/motos.service';
import { Moto } from '../../shared/interfaces/moto';

describe('HomeComponent catálogo', () => {
  const motosService = {
    getMotosPublicas: jest.fn(),
    getMotos: jest.fn(),
  };

  const catalogo: Moto[] = [
    mapMotoCatalogo({
      id: '1',
      marca: 'AUTECO',
      modelo: '2008',
      placa: 'FSS51B',
      estado: 'en_uso',
      modalidad: 'liquidacion',
      imagen_url: 'https://cdn.example/fss51b.jpg',
    }),
    mapMotoCatalogo({
      id: '2',
      marca: 'BAJAJ',
      modelo: 'Pulsar',
      placa: 'DAN78D',
      estado: 'disponible',
      modalidad: 'arriendo',
      imagen_url: 'data:image/jpeg;base64,/9j/broken',
    }),
    mapMotoCatalogo({
      id: '3',
      marca: 'AKT',
      modelo: 'NKD',
      placa: 'RIP-44G',
      estado: 'en_uso',
      modalidad: 'arriendo',
      imagen_url: 'https://storage.example/broken.jpg',
    }),
  ];

  let component: HomeComponent;

  beforeEach(() => {
    motosService.getMotosPublicas.mockReturnValue(of(catalogo));
    motosService.getMotos.mockClear();
    component = new HomeComponent(motosService as unknown as MotosService, 'browser');
    component.ngOnInit();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('en SSR no apaga el loader (evita mismatch de hidratación)', () => {
    motosService.getMotosPublicas.mockClear();
    const ssr = new HomeComponent(motosService as unknown as MotosService, 'server');
    ssr.ngOnInit();
    expect(ssr.cargando).toBe(true);
    expect(ssr.mdds).toEqual([]);
    expect(motosService.getMotosPublicas).not.toHaveBeenCalled();
  });

  it('la landing pide catálogo público y no getMotos (join conductor)', () => {
    expect(motosService.getMotosPublicas).toHaveBeenCalled();
    expect(motosService.getMotos).not.toHaveBeenCalled();
    expect(component.mdds).toHaveLength(3);
    expect(component.mdds.every((m) => m.conductor === undefined)).toBe(true);
    expect(component.mdds.every((m) => m.conductorId == null)).toBe(true);
    expect(component.cargando).toBe(false);
  });

  it('siempre tiene marca, placa y estado aunque la foto sea data: o falle', () => {
    for (const m of component.mdds) {
      expect(component.tituloMdd(m).length).toBeGreaterThan(0);
      expect(component.placaMdd(m).length).toBeGreaterThan(0);
      expect(component.etiquetaEstado(m).length).toBeGreaterThan(0);
    }
    expect(component.tituloMdd(component.mdds[0])).toContain('AUTECO');
    expect(component.placaMdd(component.mdds[1])).toBe('DAN78D');
    expect(component.etiquetaEstado(component.mdds[2])).toBe('En uso');
  });

  it('imagen data: usa fallback, no src', () => {
    const dan = component.mdds.find((m) => m.placa === 'DAN78D')!;
    expect(dan.imagen).toBeUndefined();
    expect(component.mostrarFoto(dan)).toBe(false);
    expect(component.fotoSrc(dan)).toBeNull();
    expect(component.tituloMdd(dan)).toContain('BAJAJ');
    expect(component.placaMdd(dan)).toBe('DAN78D');
  });

  it('img onerror pasa a fallback y conserva el texto', () => {
    const rip = component.mdds.find((m) => m.placa === 'RIP-44G')!;
    expect(component.mostrarFoto(rip)).toBe(true);
    component.onFotoError(rip);
    expect(component.mostrarFoto(rip)).toBe(false);
    expect(component.fotoSrc(rip)).toBeNull();
    expect(component.tituloMdd(rip)).toContain('AKT');
    expect(component.placaMdd(rip)).toBe('RIP-44G');
    expect(component.etiquetaEstado(rip)).toBe('En uso');
  });
});
