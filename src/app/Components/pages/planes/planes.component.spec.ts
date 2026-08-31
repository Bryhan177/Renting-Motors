import { of, throwError } from 'rxjs';
import { PlanesComponent } from './planes.component';
import { PlanesService, PLANES_LISTA_SELECT } from '../../../service/planes.service';
import { Plan } from '../../../shared/interfaces/plan';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: false }) },
}));

describe('PlanesComponent', () => {
  const planesService = {
    getPlanes: jest.fn().mockReturnValue(of([])),
    create: jest.fn(),
    update: jest.fn(),
    setActivo: jest.fn(),
  };

  let component: PlanesComponent;

  beforeEach(() => {
    planesService.getPlanes.mockReturnValue(of([]));
    planesService.create.mockReset();
    component = new PlanesComponent(planesService as unknown as PlanesService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('el listado de planes no usa select *', () => {
    expect(PLANES_LISTA_SELECT).not.toMatch(/\*/);
    expect(PLANES_LISTA_SELECT).not.toMatch(/imagen/);
    expect(PLANES_LISTA_SELECT).toMatch(/nombre/);
    expect(PLANES_LISTA_SELECT).toMatch(/valor_sugerido/);
  });

  it('el formulario nuevo no usa 160000/180000 como tarifa global', () => {
    const form = component.formVacio();
    expect(form.valorSugerido).toBe(0);
    expect(form.permiteNegociacion).toBe(true);
    expect(form.periodicidadesPermitidas).toEqual(['semanal']);
  });

  it('no llama create sin nombre', () => {
    component.form = component.formVacio();
    component.guardar();
    expect(planesService.create).not.toHaveBeenCalled();
  });

  it('filtra inactivos cuando el checkbox está apagado', () => {
    component.planes = [
      { nombre: 'Personal', activo: true, descripcion: '', condicionesUso: '', periodicidadesPermitidas: ['semanal'], valorSugerido: 115000, permiteNegociacion: true, duracionMinimaMeses: 3, requiereCuotaInicial: false },
      { nombre: 'Viejo', activo: false, descripcion: '', condicionesUso: '', periodicidadesPermitidas: ['semanal'], valorSugerido: 1, permiteNegociacion: true, duracionMinimaMeses: 3, requiereCuotaInicial: false },
    ] as Plan[];
    component.mostrarInactivos = false;
    expect(component.planesFiltrados.map((p) => p.nombre)).toEqual(['Personal']);
  });

  it('create rechazado no rompe el componente', () => {
    planesService.create.mockReturnValue(throwError(() => ({ message: 'duplicate' })));
    component.form = component.formVacio();
    component.form.nombre = 'Personal';
    component.guardar();
    expect(planesService.create).toHaveBeenCalled();
  });
});
