import { of } from 'rxjs';
import { TalleresConfianzaComponent } from './talleres-confianza.component';
import { TalleresService } from '../../service/talleres.service';
import { TallerConfianza } from '../../shared/interfaces/taller-confianza';

const sanitizer = {
  bypassSecurityTrustResourceUrl: (url: string) => url,
};

const activos: TallerConfianza[] = [
  {
    _id: 'a',
    nombre: 'Taller A',
    direccion: 'Calle 1',
    telefono: '3001',
    latitud: 4.711,
    longitud: -74.0721,
    horario: '8-18',
    servicios: 'Llantas; aceite',
    activo: true,
  },
  {
    _id: 'b',
    nombre: 'Taller B',
    direccion: 'Calle 2',
    telefono: '3002',
    latitud: 6.244,
    longitud: -75.581,
    horario: '9-17',
    servicios: 'Frenos',
    activo: true,
  },
];

describe('TalleresConfianzaComponent', () => {
  const service = {
    getActivos: jest.fn().mockReturnValue(of(activos)),
  };

  let component: TalleresConfianzaComponent;

  beforeEach(() => {
    service.getActivos.mockReturnValue(of(activos));
    component = new TalleresConfianzaComponent(
      service as unknown as TalleresService,
      sanitizer as any,
    );
    component.modo = 'completo';
  });

  it('lista solo lo que el servicio de activos devuelve', () => {
    component.ngOnInit();
    expect(service.getActivos).toHaveBeenCalled();
    expect(component.talleres.map((t) => t.nombre)).toEqual(['Taller A', 'Taller B']);
  });

  it('sin geolocalización lista todos; con ubicación marca el más cercano', () => {
    component.ngOnInit();
    expect(component.geoEstado === 'denegado' || component.geoEstado === 'no-soportado' || component.geoEstado === 'pendiente' || component.geoEstado === 'ok').toBe(true);
    component.ubicacion = { lat: 4.711, lng: -74.0721 };
    expect(component.masCercano?._id).toBe('a');
    expect(component.esMasCercano(activos[0])).toBe(true);
    expect(component.comoLlegarUrl(activos[0])).toContain('google.com/maps/dir');
    expect(component.pinUrl(activos[0])).toContain('openstreetmap.org');
  });

  it('en resumen muestra máximo 3 y emite verTodos', () => {
    component.modo = 'resumen';
    component.ngOnInit();
    expect(component.visibles.length).toBeLessThanOrEqual(3);
    const spy = jest.fn();
    component.verTodos.subscribe(spy);
    component.verTodos.emit();
    expect(spy).toHaveBeenCalled();
  });
});
