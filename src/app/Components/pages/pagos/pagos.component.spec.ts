import { of, throwError } from 'rxjs';
import { PagosComponent } from './pagos.component';
import { PagosService } from '../../../service/pagos.service';
import { MotosService } from '../../../service/motos.service';
import { CobrosService, Abono } from '../../../service/cobros.service';
import { ContratosService } from '../../../service/contratos.service';
import Swal from 'sweetalert2';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: false }) },
}));

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

describe('PagosComponent', () => {
  const pagosService = {
    getPagos: jest.fn(),
    registrarManual: jest.fn(),
  };
  const motosService = { getMotos: jest.fn() };
  const cobrosService = {
    getAbonos: jest.fn(),
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
    motosService.getMotos.mockReturnValue(of([]));
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

  it('registrar abono directo desde cartera también recarga la lista de pagos', () => {
    cobrosService.registrarAbono.mockReturnValue(of([{ ...abonoPendiente, estado: 'registrado' }]));
    component.cobroPagoForm = {
      cobroId: 'c1',
      conductorNombre: 'Juan',
      periodoLabel: '#1',
      saldo: 180000,
      monto: 180000,
      metodoPago: 'Transferencia',
      observaciones: '',
    };
    component.guardarPagoCobro();
    expect(cobrosService.registrarAbono).toHaveBeenCalled();
    expect(pagosService.getPagos).toHaveBeenCalled();
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
