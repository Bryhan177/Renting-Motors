import { of, throwError } from 'rxjs';
import { ContratosComponent } from './contratos.component';
import { ContratosService, Contrato } from '../../../service/contratos.service';
import { CobrosService } from '../../../service/cobros.service';
import { MotosService } from '../../../service/motos.service';
import { UsuariosService } from '../../../service/usuarios.service';
import { AuthService } from '../../../auth/auth.service';
import { CUOTA_SEMANAL_ESTANDAR } from '../../../shared/constants';
import { fechaFinMinima } from '../../../shared/contrato.rules';

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
  const auth = { getUserId: jest.fn().mockReturnValue('staff-1') };

  let component: ContratosComponent;

  beforeEach(() => {
    contratosService.getContratos.mockReturnValue(of([]));
    contratosService.create.mockReset();
    component = new ContratosComponent(
      contratosService as unknown as ContratosService,
      cobrosService as unknown as CobrosService,
      motosService as unknown as MotosService,
      usuariosService as unknown as UsuariosService,
      auth as unknown as AuthService,
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('el formulario nuevo usa cuota estándar 160000 y fin a 3 meses', () => {
    const form = component.formVacio();
    expect(form.cuotaSemanal).toBe(CUOTA_SEMANAL_ESTANDAR);
    expect(form.cuotaSemanal).toBe(160000);
    expect(form.fechaFin).toBe(fechaFinMinima(form.fechaInicio));
    expect(form.frecuenciaPago).toBe('semanal');
  });

  it('al cambiar frecuencia usa 160/320/640 salvo cuota personalizada', () => {
    component.form = component.formVacio();
    component.form.frecuenciaPago = 'quincenal';
    component.onCambioFrecuencia();
    expect(component.form.cuotaSemanal).toBe(320000);

    component.form.frecuenciaPago = 'mensual';
    component.onCambioFrecuencia();
    expect(component.form.cuotaSemanal).toBe(640000);

    component.form.cuotaSemanal = 200000;
    component.form.frecuenciaPago = 'semanal';
    component.onCambioFrecuencia();
    expect(component.form.cuotaSemanal).toBe(200000);
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
      cuotaSemanal: 180000,
      depositoPactado: 300000,
      frecuenciaPago: 'semanal',
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
    component.guardar();
    expect(contratosService.create).toHaveBeenCalled();
  });
});
