import { of, throwError } from 'rxjs';
import { MotosComponent } from './motos.component';
import { MotosService } from '../../../service/motos.service';
import { ContratosService } from '../../../service/contratos.service';
import { OperacionService } from '../../../service/operacion.service';
import { PlanesService } from '../../../service/planes.service';
import { Plan } from '../../../shared/interfaces/plan';
import { aplicarCambioPlan, formWizardVacio } from '../../../shared/contrato-wizard';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: false }) },
}));

describe('MotosComponent contrato wizard', () => {
  const motosService = {
    getMotos: jest.fn().mockReturnValue(of([])),
    getConductoresDisponibles: jest.fn().mockReturnValue(of([])),
    createMoto: jest.fn(),
    updateMoto: jest.fn(),
    deleteMoto: jest.fn(),
  };
  const contratosService = {
    create: jest.fn(),
    getContratos: jest.fn().mockReturnValue(of([])),
  };
  const operacionService = {
    sugerencias: jest.fn().mockReturnValue(of({ accesorios: [], documentos: [] })),
    guardarEntrega: jest.fn(),
    confirmarEntrega: jest.fn(),
    getEntrega: jest.fn(),
    guardarDevolucion: jest.fn(),
    confirmarDevolucion: jest.fn(),
    getDeposito: jest.fn(),
    registrarRecepcion: jest.fn(),
    liquidar: jest.fn(),
  };
  const planesService = { getActivos: jest.fn().mockReturnValue(of([])) };

  const planPersonal: Plan = {
    _id: 'plan-personal',
    nombre: 'Personal',
    descripcion: 'Uso personal',
    condicionesUso: 'No delivery',
    periodicidadesPermitidas: ['semanal', 'quincenal'],
    valorSugerido: 115000,
    permiteNegociacion: true,
    duracionMinimaMeses: 3,
    requiereCuotaInicial: false,
    activo: true,
  };

  let component: MotosComponent;

  beforeEach(() => {
    contratosService.create.mockReset();
    component = new MotosComponent(
      motosService as unknown as MotosService,
      contratosService as unknown as ContratosService,
      operacionService as unknown as OperacionService,
      planesService as unknown as PlanesService,
    );
    component.planes = [planPersonal];
    component.motoSeleccionada = {
      _id: 'm1',
      placa: 'ABC12',
      marca: 'AKT',
      modelo: 'NKD',
      precio: 0,
      estado: 'disponible',
    };
  });

  it('no crea contrato si el wizard omite plan o valor', () => {
    component.crearContratoYContinuar({
      ...formWizardVacio('m1'),
      conductorId: 'c1',
      cuotaSemanal: 115000,
    });
    expect(contratosService.create).not.toHaveBeenCalled();

    const sinValor = aplicarCambioPlan(
      { ...formWizardVacio('m1'), conductorId: 'c1' },
      planPersonal,
    );
    sinValor.cuotaSemanal = 0;
    component.crearContratoYContinuar(sinValor);
    expect(contratosService.create).not.toHaveBeenCalled();
  });

  it('llama ContratosService.create con snapshot de plan cuando el wizard está completo', () => {
    contratosService.create.mockReturnValue(of({ _id: 'ct1', estado: 'borrador' }));
    const payload = aplicarCambioPlan(
      { ...formWizardVacio('m1'), conductorId: 'c1' },
      planPersonal,
    );
    component.crearContratoYContinuar(payload);
    expect(contratosService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        motoId: 'm1',
        conductorId: 'c1',
        planId: 'plan-personal',
        planNombre: 'Personal',
        cuotaSemanal: 115000,
      }),
    );
  });

  it('el formulario de MDD incluye campos Excel VEHICULOS', () => {
    const f = component.formVacio();
    expect(f.cilindraje).toBeNull();
    expect(f.color).toBe('');
    expect(f.anio).toBeNull();
    expect(f.tieneMultas).toBe(false);
    expect(f.uso).toBe('flota');
  });

  it('create rechazado no avanza al acta de entrega', () => {
    contratosService.create.mockReturnValue(throwError(() => ({ message: 'fail' })));
    const payload = aplicarCambioPlan(
      { ...formWizardVacio('m1'), conductorId: 'c1' },
      planPersonal,
    );
    component.pasoAsignar = 1;
    component.crearContratoYContinuar(payload);
    expect(component.pasoAsignar).toBe(1);
  });
});
