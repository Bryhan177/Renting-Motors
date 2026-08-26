import { of, throwError } from 'rxjs';
import { TalleresComponent } from './talleres.component';
import { TalleresService } from '../../../service/talleres.service';
import { TallerConfianza } from '../../../shared/interfaces/taller-confianza';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: false }) },
}));

const sanitizer = {
  bypassSecurityTrustResourceUrl: (url: string) => url,
};

function taller(partial: Partial<TallerConfianza> = {}): TallerConfianza {
  return {
    _id: 't1',
    nombre: 'Central',
    direccion: 'Cra 7 #1',
    telefono: '3001112233',
    latitud: 4.711,
    longitud: -74.0721,
    horario: '8-18',
    servicios: 'Llantas, aceite',
    activo: true,
    ...partial,
  };
}

describe('TalleresComponent', () => {
  const talleresService = {
    getTalleres: jest.fn().mockReturnValue(of([])),
    create: jest.fn(),
    update: jest.fn(),
    setActivo: jest.fn(),
  };

  let component: TalleresComponent;

  beforeEach(() => {
    talleresService.getTalleres.mockReturnValue(of([]));
    talleresService.create.mockReset();
    component = new TalleresComponent(
      talleresService as unknown as TalleresService,
      sanitizer as any,
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('no llama create sin nombre, dirección, teléfono o coordenadas', () => {
    component.form = component.formVacio();
    component.guardar();
    expect(talleresService.create).not.toHaveBeenCalled();
    component.form.nombre = 'X';
    component.guardar();
    expect(talleresService.create).not.toHaveBeenCalled();
    component.form.direccion = 'Y';
    component.guardar();
    expect(talleresService.create).not.toHaveBeenCalled();
    component.form.telefono = '300';
    component.guardar();
    expect(talleresService.create).not.toHaveBeenCalled();
  });

  it('filtra inactivos cuando el checkbox está apagado', () => {
    component.talleres = [
      taller({ nombre: 'Activo', activo: true }),
      taller({ _id: 't2', nombre: 'Viejo', activo: false }),
    ];
    component.mostrarInactivos = false;
    expect(component.talleresFiltrados.map((t) => t.nombre)).toEqual(['Activo']);
  });

  it('create rechazado no rompe el componente', () => {
    talleresService.create.mockReturnValue(throwError(() => ({ message: 'fail' })));
    component.form = {
      ...component.formVacio(),
      nombre: 'Central',
      direccion: 'Cra 1',
      telefono: '300',
      latitud: 4.71,
      longitud: -74.07,
    };
    component.guardar();
    expect(talleresService.create).toHaveBeenCalled();
  });

  it('Cómo llegar usa Google Maps directions sin API key', () => {
    const url = component.comoLlegarUrl(taller());
    expect(url).toContain('https://www.google.com/maps/dir/');
    expect(url).toContain('destination=4.711');
    expect(url).not.toContain('key=');
  });
});
