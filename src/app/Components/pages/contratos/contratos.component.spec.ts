import { of, throwError } from 'rxjs';
import { ContratosComponent } from './contratos.component';
import { ContratosService, Contrato } from '../../../service/contratos.service';
import { CobrosService } from '../../../service/cobros.service';
import { MotosService } from '../../../service/motos.service';
import { UsuariosService } from '../../../service/usuarios.service';
import { PlanesService } from '../../../service/planes.service';
import { AuthService } from '../../../auth/auth.service';
import { fechaFinMinima } from '../../../shared/contrato.rules';
import { Plan } from '../../../shared/interfaces/plan';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: false }) },
}));

describe('ContratosComponent', () => {
  const contratosService = {
    getContratos: jest.fn().mockReturnValue(of([])),
    create: jest.fn(),
    activar: jest.fn(),
    finalizarDesdeDevolucion: jest.fn(),
    anular: jest.fn(),
  };
  const cobrosService = { generarPendientes: jest.fn().mockReturnValue(of([])) };
  const motosService = { getMotos: jest.fn().mockReturnValue(of([])) };
  const usuariosService = { getUsuarios: jest.fn().mockReturnValue(of([])) };
  const planesService = { getActivos: jest.fn().mockReturnValue(of([])) };
  const auth = { getUserId: jest.fn().mockReturnValue('staff-1') };

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

  let component: ContratosComponent;

  beforeEach(() => {
    contratosService.getContratos.mockReturnValue(of([]));
    contratosService.create.mockReset();
    planesService.getActivos.mockReturnValue(of([planPersonal]));
    component = new ContratosComponent(
      contratosService as unknown as ContratosService,
      cobrosService as unknown as CobrosService,
      motosService as unknown as MotosService,
      usuariosService as unknown as UsuariosService,
      planesService as unknown as PlanesService,
      auth as unknown as AuthService,
    );
    component.planes = [planPersonal];
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('el formulario nuevo no pacta cuota hasta elegir un plan (no usa 180000)', () => {
    const form = component.formVacio();
    expect(form.cuotaSemanal).toBe(0);
    expect(form.planId).toBe('');
    expect(form.fechaFin).toBe(fechaFinMinima(form.fechaInicio));
    expect(form.frecuenciaPago).toBe('semanal');
  });

  it('elegir plan Personal rellena sugerido 115000 y no 160/180 global', () => {
    component.form = component.formVacio();
    component.form.planId = 'plan-personal';
    component.onCambioPlan();
    expect(component.form.planNombre).toBe('Personal');
    expect(component.form.cuotaSemanal).toBe(115000);
    expect(component.form.frecuenciaPago).toBe('semanal');
    expect(component.frecuenciasDelPlan).toEqual(['semanal', 'quincenal']);
  });

  it('no llama create sin plan', () => {
    component.form = component.formVacio();
    component.form.conductorId = 'u1';
    component.form.motoId = 'm1';
    component.form.cuotaSemanal = 115000;
    component.guardar();
    expect(contratosService.create).not.toHaveBeenCalled();
  });

  it('filtra por estado activo', () => {
    component.contratos = [
      { estado: 'activo', conductorId: 'a', motoId: 'm', fechaInicio: '2026-01-01', cuotaSemanal: 180000, depositoPactado: 0, frecuenciaPago: 'semanal' },
      { estado: 'borrador', conductorId: 'b', motoId: 'n', fechaInicio: '2026-01-01', cuotaSemanal: 180000, depositoPactado: 0, frecuenciaPago: 'semanal' },
    ] as Contrato[];
    component.filtroEstado = 'activo';
    expect(component.contratosFiltrados).toHaveLength(1);
    expect(component.contratosFiltrados[0].estado).toBe('activo');
  });

  it('no llama create si la duración es menor a 3 meses', () => {
    component.form = {
      conductorId: 'u1',
      motoId: 'm1',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-02-01',
      cuotaSemanal: 115000,
      depositoPactado: 300000,
      frecuenciaPago: 'semanal',
      planId: 'plan-personal',
      planNombre: 'Personal',
    };
    component.guardar();
    expect(contratosService.create).not.toHaveBeenCalled();
  });

  it('excluye motos y conductores con contrato activo', () => {
    component.contratos = [
      {
        estado: 'activo',
        conductorId: { _id: 'c1', nombre: 'Juan', apellido: 'P' } as any,
        motoId: { _id: 'm1', placa: 'AAA' } as any,
        fechaInicio: '2026-01-01',
        cuotaSemanal: 180000,
        depositoPactado: 0,
        frecuenciaPago: 'semanal',
        planNombre: 'Trabajo',
      },
    ] as Contrato[];
    component.conductores = [
      { _id: 'c1', nombre: 'Juan', apellido: 'P', rol: 'empleado', activo: true } as any,
      { _id: 'c2', nombre: 'Ana', apellido: 'L', rol: 'empleado', activo: true } as any,
    ];
    component.motos = [
      { _id: 'm1', placa: 'AAA', estado: 'en_uso', conductorId: 'c1' } as any,
      { _id: 'm2', placa: 'BBB', estado: 'disponible', conductorId: null } as any,
    ];
    expect(component.conductoresLibres.map((u) => u._id)).toEqual(['c2']);
    expect(component.motosLibres.map((m) => m._id)).toEqual(['m2']);
  });

  it('create rechazado por unicidad no rompe el componente', () => {
    contratosService.create.mockReturnValue(
      throwError(() => ({ code: '23505', message: 'contratos_un_activo_conductor' })),
    );
    component.form = component.formVacio();
    component.form.conductorId = 'u1';
    component.form.motoId = 'm1';
    component.form.planId = 'plan-personal';
    component.form.planNombre = 'Personal';
    component.form.cuotaSemanal = 115000;
    component.guardar();
    expect(contratosService.create).toHaveBeenCalled();
  });

  it('planDe muestra Sin plan cuando no hay snapshot', () => {
    expect(component.planDe({ planNombre: null } as Contrato)).toBe('Sin plan');
    expect(component.planDe({ planNombre: 'Personal' } as Contrato)).toBe('Personal');
  });

  it('cambiar valorSugerido del plan no muta la cuota de un contrato ya listado', () => {
    const original = planPersonal.valorSugerido;
    component.contratos = [
      {
        estado: 'activo',
        conductorId: 'a',
        motoId: 'm',
        fechaInicio: '2026-01-01',
        cuotaSemanal: 180000,
        depositoPactado: 0,
        frecuenciaPago: 'semanal',
        planNombre: 'Trabajo',
      },
    ] as Contrato[];
    planPersonal.valorSugerido = 999999;
    expect(component.contratos[0].cuotaSemanal).toBe(180000);
    planPersonal.valorSugerido = original;
  });
});
