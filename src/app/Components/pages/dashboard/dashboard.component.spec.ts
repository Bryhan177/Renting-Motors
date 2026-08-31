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

  it('la serie de egresos no se mezcla con la de ingresos', () => {
    const ingresos = [
      { key: '2026-08', label: 'ago 26', monto: 60000, cantidadAbonos: 2 },
    ];
    const egresos = [
      { key: '2026-08', label: 'ago 26', monto: 15000, cantidadAbonos: 1 },
    ];
    dashboardService.getResumen.mockReturnValue(
      of(kpis({ ingresosMensuales: ingresos, egresosMensuales: egresos, egresosPeriodo: 15000 })),
    );
    component.ngOnInit();
    expect(component.ingresosMensuales.map((m) => m.monto)).toEqual([60000]);
    expect(component.egresosMensuales.map((m) => m.monto)).toEqual([15000]);
    expect(component.totalEgresosPeriodoChart).toBe(15000);
    expect(component.kpis.egresosPeriodo).toBe(15000);
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

  it('si el RPC falla, el Resumen sigue con cards en cero (no loader infinito)', () => {
    dashboardService.getResumen.mockReturnValue(
      throwError(() => ({ message: 'schema cache' })),
    );
    component.ngOnInit();
    expect(component.loading).toBe(false);
    expect(component.seccion).toBe('resumen');
    expect(component.kpis.ingresosPeriodo).toBe(0);
    expect(component.kpis.egresosPeriodo).toBe(0);
    expect(component.kpis.contratosActivos).toBe(0);
    expect(component.sqlPendiente).toBe(true);
  });

  it('cop formatea COP es-CO', () => {
    expect(component.cop(25000)).toMatch(/25/);
  });

  it('por defecto abre Resumen y la gráfica en Ingresos', () => {
    expect(component.seccion).toBe('resumen');
    expect(component.serieChart).toBe('ingresos');
    expect(component.tabs.map((t) => t.id)).toEqual(['resumen', 'graficas', 'cartera', 'planes']);
  });

  it('al cambiar a Egresos la serie visible es solo egresos', () => {
    const ingresos = [
      { key: '2026-08', label: 'ago 26', monto: 60000, cantidadAbonos: 2 },
    ];
    const egresos = [
      { key: '2026-08', label: 'ago 26', monto: 15000, cantidadAbonos: 1 },
    ];
    dashboardService.getResumen.mockReturnValue(
      of(kpis({ ingresosMensuales: ingresos, egresosMensuales: egresos })),
    );
    component.ngOnInit();
    expect(component.serieVisible.map((m) => m.monto)).toEqual([60000]);

    component.setSeccion('graficas');
    component.setSerieChart('egresos');
    expect(component.seccion).toBe('graficas');
    expect(component.serieChart).toBe('egresos');
    expect(component.mostrandoEgresos).toBe(true);
    expect(component.serieVisible.map((m) => m.monto)).toEqual([15000]);
    expect(component.serieVisible.map((m) => m.monto)).not.toContain(60000);
    expect(component.totalSerieChart).toBe(15000);
  });
});
