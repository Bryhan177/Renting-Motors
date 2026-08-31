import { of, throwError, Subject } from 'rxjs';
import { ContratosComponent } from './contratos.component';
import { ContratosService, Contrato, CONTRATOS_LISTA_SELECT } from '../../../service/contratos.service';
import { CobrosService } from '../../../service/cobros.service';
import { MotosService } from '../../../service/motos.service';
import { UsuariosService } from '../../../service/usuarios.service';
import { PlanesService } from '../../../service/planes.service';
import { AuthService } from '../../../auth/auth.service';
import { Plan } from '../../../shared/interfaces/plan';
import { Moto } from '../../../shared/interfaces/moto';
import { aplicarCambioPlan, formularioListoParaCrear, formWizardVacio } from '../../../shared/contrato-wizard';

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
  const motosService = { getMotos: jest.fn().mockReturnValue(of([])), getMotosLista: jest.fn().mockReturnValue(of([])) };
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
    motosService.getMotosLista.mockReturnValue(of([]));
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

  it('el listado de contratos no embebe motos.* ni imagen', () => {
    expect(CONTRATOS_LISTA_SELECT).not.toMatch(/motos:moto_id\(\*\)/);
    expect(CONTRATOS_LISTA_SELECT).not.toMatch(/usuarios:conductor_id\(\*\)/);
    expect(CONTRATOS_LISTA_SELECT).not.toMatch(/imagen/);
    expect(CONTRATOS_LISTA_SELECT).toMatch(/motos:moto_id\(id,marca,modelo,placa,estado\)/);
  });

  it('pinta la tabla de contratos sin pedir motos', () => {
    contratosService.getContratos.mockReturnValue(
      of([
        {
          estado: 'activo',
          conductorId: { _id: 'c1', nombre: 'Wbelmar', apellido: 'Berrio' },
          motoId: { _id: 'm1', placa: 'FSS51B', marca: 'AUTECO', modelo: '2008' },
          fechaInicio: '2026-01-01',
          cuotaSemanal: 180000,
          depositoPactado: 0,
          frecuenciaPago: 'semanal',
        },
      ] as Contrato[]),
    );
    component.cargar();
    expect(component.contratos).toHaveLength(1);
    expect(component.cargando).toBe(false);
    expect(component.motos).toEqual([]);
    expect(motosService.getMotosLista).not.toHaveBeenCalled();
    expect(usuariosService.getUsuarios).not.toHaveBeenCalled();
  });

  it('carga motos solo al abrir el wizard de crear', () => {
    const motos$ = new Subject<Moto[]>();
    motosService.getMotosLista.mockReturnValue(motos$);
    component.abrirCrear();
    expect(motosService.getMotosLista).toHaveBeenCalled();
    expect(component.motos).toEqual([]);
    motos$.next([{ _id: 'm1', placa: 'FSS51B', marca: 'AUTECO', modelo: '2008', precio: 0, estado: 'en_uso' }]);
    expect(component.motos).toHaveLength(1);
  });

  it('no llama create sin plan (red de seguridad del wizard)', () => {
    const payload = {
      ...formWizardVacio('m1'),
      conductorId: 'u1',
      cuotaSemanal: 115000,
    };
    expect(formularioListoParaCrear(payload, null).ok).toBe(false);
    component.crearDesdeWizard(payload);
    expect(contratosService.create).not.toHaveBeenCalled();
  });

  it('no llama create si la duración es menor a la del plan', () => {
    const payload = aplicarCambioPlan(
      { ...formWizardVacio('m1'), conductorId: 'u1', fechaInicio: '2026-01-01' },
      planPersonal,
    );
    payload.duracionMeses = 1;
    payload.fechaFin = '2026-02-01';
    component.crearDesdeWizard(payload);
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
    const payload = aplicarCambioPlan(
      { ...formWizardVacio('m1'), conductorId: 'u1' },
      planPersonal,
    );
    component.crearDesdeWizard(payload);
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
