import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { MotosService } from '../../../service/motos.service';
import { CobrosService } from '../../../service/cobros.service';
import { NovedadesService } from '../../../service/novedades.service';
import { DashboardService } from '../../../service/dashboard.service';
import { emptyResumenDashboard, ResumenDashboard } from '../../../shared/dashboard-kpis';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: false }) },
}));

function kpis(partial: Partial<ResumenDashboard> = {}): ResumenDashboard {
  return { ...emptyResumenDashboard('mes'), ...partial };
}

describe('DashboardComponent', () => {
  const motosService = { getMotos: jest.fn() };
  const cobrosService = {
    getCobros: jest.fn(),
    getAbonos: jest.fn(),
    confirmarAbono: jest.fn(),
    rechazarAbono: jest.fn(),
  };
  const novedadesService = { list: jest.fn() };
  const dashboardService = { getResumen: jest.fn() };

  let component: DashboardComponent;

  beforeEach(() => {
    motosService.getMotos.mockReturnValue(of([]));
    cobrosService.getCobros.mockReturnValue(of([]));
    cobrosService.getAbonos.mockReturnValue(of([]));
    novedadesService.list.mockReturnValue(of([]));
    dashboardService.getResumen.mockReturnValue(of(emptyResumenDashboard('mes')));
    component = new DashboardComponent(
      motosService as unknown as MotosService,
      cobrosService as unknown as CobrosService,
      novedadesService as unknown as NovedadesService,
      dashboardService as unknown as DashboardService,
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('por defecto pide el mes calendario y muestra ceros si la DB está vacía', () => {
    component.ngOnInit();
    expect(dashboardService.getResumen).toHaveBeenCalledWith('mes');
    expect(component.kpis.ingresosPeriodo).toBe(0);
    expect(component.kpis.contratosActivos).toBe(0);
    expect(component.kpis.cartera).toBe(0);
    expect(component.kpis.moraCantidad).toBe(0);
    expect(component.cop(0)).toBe('$ 0');
    expect(component.loading).toBe(false);
  });

  it('el filtro semana/año vuelve a llamar el RPC sin agregar filas en el browser', () => {
    component.ngOnInit();
    dashboardService.getResumen.mockReturnValue(
      of(kpis({ periodo: 'semana', ingresosPeriodo: 25000 })),
    );
    component.setPeriodo('semana');
    expect(dashboardService.getResumen).toHaveBeenCalledWith('semana');
    expect(component.periodo).toBe('semana');
    expect(component.kpis.ingresosPeriodo).toBe(25000);
  });

  it('lista operativa pide cobros con saldo (no todo el histórico pagado)', () => {
    component.ngOnInit();
    expect(cobrosService.getCobros).toHaveBeenCalledWith({ soloConSaldo: true });
  });

  it('si falta el SQL, deja ceros y marca sqlPendiente', () => {
    dashboardService.getResumen.mockReturnValue(
      throwError(() => ({ message: 'Could not find the function public.resumen_dashboard' })),
    );
    component.ngOnInit();
    expect(component.kpis.ingresosPeriodo).toBe(0);
    expect(component.sqlPendiente).toBe(true);
    expect(component.loading).toBe(false);
  });

  it('cop formatea COP es-CO', () => {
    expect(component.cop(25000)).toMatch(/25/);
  });
});
