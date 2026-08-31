import { of, throwError } from 'rxjs';
import { PagosComponent } from './pagos.component';
import { PagosService } from '../../../service/pagos.service';
import { MotosService } from '../../../service/motos.service';
import { CobrosService, Abono, Cobro } from '../../../service/cobros.service';
import { ContratosService, Contrato } from '../../../service/contratos.service';
import Swal from 'sweetalert2';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: false }) },
}));

const juan = {
  _id: 'u1',
  nombre: 'Juan',
  apellido: 'Pérez',
  email: 'j@x.com',
  cedula: 1,
  telefono: '1',
  rol: 'empleado' as const,
  activo: true,
};

const abonoPendiente: Abono = {
  _id: 'ab1',
  cobroId: 'c1',
  contratoId: 'ct1',
  conductorId: 'u1',
  monto: 180000,
  fechaPago: '2026-08-26T15:00:00.000Z',
  metodoPago: 'Transferencia',
  origenAbono: 'conductor',
  estado: 'pendiente_confirmacion',
};

function cobro(partial: Partial<Cobro> & Pick<Cobro, '_id' | 'numeroPeriodo' | 'saldo'>): Cobro {
  return {
    contratoId: 'ct1',
    conductorId: 'u1',
    motoId: 'm1',
    periodoInicio: '2026-08-01',
    periodoFin: '2026-08-07',
    fechaVencimiento: '2026-08-01',
    montoEsperado: 180000,
    montoPagado: 0,
    estado: 'pendiente',
    enMora: false,
    conductor: juan,
    ...partial,
  };
}

const contratoActivo: Contrato = {
  _id: 'ct1',
  conductorId: 'u1',
  motoId: { _id: 'm1', marca: 'Bajaj', modelo: 'Pulsar', placa: 'ABC123', precio: 0, estado: 'en_uso' },
  fechaInicio: '2026-08-03',
  cuotaSemanal: 180000,
  depositoPactado: 0,
  frecuenciaPago: 'semanal',
  estado: 'activo',
};

describe('PagosComponent', () => {
  const pagosService = {
    getPagos: jest.fn(),
    registrarManual: jest.fn(),
    registrarOtroIngreso: jest.fn(),
  };
  const motosService = { getMotos: jest.fn(), getMotosLista: jest.fn() };
  const cobrosService = {
    getAbonos: jest.fn(),
    getAbonoComprobante: jest.fn(),
    getCobros: jest.fn(),
    generarPendientes: jest.fn(),
    confirmarAbono: jest.fn(),
    rechazarAbono: jest.fn(),
    registrarAbono: jest.fn(),
  };
  const contratosService = { getContratos: jest.fn() };

  let component: PagosComponent;

  beforeEach(() => {
    jest.clearAllMocks();
    pagosService.getPagos.mockReturnValue(of([]));
    pagosService.registrarOtroIngreso.mockReturnValue(of({ valorPagado: 30000, gastos: 0 }));
    motosService.getMotosLista.mockReturnValue(of([]));
    cobrosService.getAbonos.mockReturnValue(of([]));
    cobrosService.getCobros.mockReturnValue(of([]));
    cobrosService.generarPendientes.mockReturnValue(of([]));
    cobrosService.confirmarAbono.mockReturnValue(of({ ...abonoPendiente, estado: 'registrado' }));
    contratosService.getContratos.mockReturnValue(of([]));
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: false });
    component = new PagosComponent(
      pagosService as unknown as PagosService,
      motosService as unknown as MotosService,
      cobrosService as unknown as CobrosService,
      contratosService as unknown as ContratosService,
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('staff ve varios periodos con saldo del mismo conductor, no solo el vigente', () => {
    cobrosService.getCobros.mockReturnValue(
      of([
        cobro({
          _id: 'mora',
          numeroPeriodo: 1,
          saldo: 180000,
          enMora: true,
          fechaVencimiento: '2026-08-03',
        }),
        cobro({
          _id: 'vigente',
          numeroPeriodo: 5,
          saldo: 180000,
          fechaVencimiento: '2026-08-31',
        }),
        cobro({
          _id: 'pagado',
          numeroPeriodo: 3,
          saldo: 0,
          estado: 'pagado',
        }),
      ]),
    );
    contratosService.getContratos.mockReturnValue(of([contratoActivo]));
    component.cargarCartera(true);

    expect(component.cartera.map((i) => i.cobro._id).sort()).toEqual(['mora', 'vigente']);
    expect(component.gruposCartera).toHaveLength(1);
    expect(component.gruposCartera[0].items).toHaveLength(2);
    expect(component.gruposCartera[0].conductorNombre).toBe('Juan Pérez');
    expect(component.gruposCartera[0].saldoTotal).toBe(360000);
  });

  it('pagar un periodo registra abono admin registrado, no pendiente_confirmacion', () => {
    cobrosService.registrarAbono.mockReturnValue(of([{ ...abonoPendiente, estado: 'registrado' }]));
    component.cobroPagoForm = {
      cobroId: 'mora',
      conductorNombre: 'Juan Pérez',
      periodoLabel: '#1',
      saldo: 180000,
      monto: 50000,
      metodoPago: 'Efectivo',
      observaciones: 'parcial',
      comprobante: null,
    };
    component.guardarPagoCobro();
    expect(cobrosService.registrarAbono).toHaveBeenCalledWith({
      cobroId: 'mora',
      monto: 50000,
      metodoPago: 'Efectivo',
      observaciones: 'parcial',
      comprobante: undefined,
      origenAbono: 'admin',
      pendienteConfirmacion: false,
    });
    expect(pagosService.getPagos).toHaveBeenCalled();
    expect(pagosService.registrarManual).not.toHaveBeenCalled();
  });

  it('otros ingresos no tocan cobros ni dejan el abono pendiente', () => {
    component.form = {
      motoId: 'm1',
      fechaPago: '2026-08-20',
      valorPagado: 30000,
      metodoPago: 'Efectivo',
      observaciones: 'Alquiler puntual',
    };
    component.motos = [
      {
        _id: 'm1',
        marca: 'Bajaj',
        modelo: 'Pulsar',
        placa: 'ABC123',
        precio: 0,
        estado: 'disponible',
      },
    ];
    component.guardar();
    expect(pagosService.registrarOtroIngreso).toHaveBeenCalledWith(
      expect.objectContaining({
        motoId: 'm1',
        valorPagado: 30000,
        observaciones: 'Alquiler puntual',
      }),
    );
    expect(cobrosService.registrarAbono).not.toHaveBeenCalled();
  });

  it('al confirmar un abono recarga Pagos (tabla pagos) además de cartera y pendientes', async () => {
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: true });
    component.ngOnInit();
    expect(pagosService.getPagos).toHaveBeenCalledTimes(1);

    component.confirmarAbono(abonoPendiente);
    await Promise.resolve();
    await Promise.resolve();

    expect(cobrosService.confirmarAbono).toHaveBeenCalledWith('ab1');
    expect(pagosService.getPagos).toHaveBeenCalledTimes(2);
    expect(cobrosService.getAbonos).toHaveBeenCalled();
  });

  it('si el staff cancela el diálogo no llama confirmarAbono', async () => {
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: false });
    component.confirmarAbono(abonoPendiente);
    await Promise.resolve();
    expect(cobrosService.confirmarAbono).not.toHaveBeenCalled();
  });

  it('confirmarAbono con error no rompe el componente', async () => {
    (Swal.fire as jest.Mock).mockResolvedValue({ isConfirmed: true });
    cobrosService.confirmarAbono.mockReturnValue(throwError(() => ({ message: 'fail' })));
    component.confirmarAbono(abonoPendiente);
    await Promise.resolve();
    await Promise.resolve();
    expect(component).toBeTruthy();
  });
});
