import { parseRpcJson } from './cobro-finanzas.mapper';
import { parseDateOnly } from './periodo.util';

/** Filtro del dashboard. Default: mes calendario en America/Bogota. */
export type PeriodoDashboard = 'semana' | 'mes' | 'anio';

export interface PlanKpi {
  planNombre: string;
  contratosActivos: number;
  ingresos: number;
}

export interface IngresoMensualKpi {
  /** YYYY-MM */
  key: string;
  label: string;
  monto: number;
  cantidadAbonos: number;
}

export interface ResumenDashboard {
  periodo: PeriodoDashboard;
  periodoDesde: string;
  periodoHasta: string;
  ingresosPeriodo: number;
  cantidadAbonosPeriodo: number;
  contratosActivos: number;
  /** Contratos con fecha_inicio en el periodo y estado <> anulado. */
  contratosNuevos: number;
  conductoresActivos: number;
  motosTotal: number;
  /** motos.estado = en_uso */
  motosAlquiladas: number;
  /** motos.estado = disponible */
  motosDisponibles: number;
  motosEnMantenimiento: number;
  motosFueraServicio: number;
  cartera: number;
  moraCantidad: number;
  moraMonto: number;
  ingresosMesActual: number;
  ingresosMesAnterior: number;
  /** % mes actual vs anterior. 0 si ambos son 0; 100 si anterior es 0 y hay ingresos. */
  crecimientoMensualPct: number;
  planes: PlanKpi[];
  ingresosMensuales: IngresoMensualKpi[];
}

export function emptyResumenDashboard(periodo: PeriodoDashboard = 'mes'): ResumenDashboard {
  return {
    periodo,
    periodoDesde: '',
    periodoHasta: '',
    ingresosPeriodo: 0,
    cantidadAbonosPeriodo: 0,
    contratosActivos: 0,
    contratosNuevos: 0,
    conductoresActivos: 0,
    motosTotal: 0,
    motosAlquiladas: 0,
    motosDisponibles: 0,
    motosEnMantenimiento: 0,
    motosFueraServicio: 0,
    cartera: 0,
    moraCantidad: 0,
    moraMonto: 0,
    ingresosMesActual: 0,
    ingresosMesAnterior: 0,
    crecimientoMensualPct: 0,
    planes: [],
    ingresosMensuales: [],
  };
}

export function toNonNegNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Misma regla que el dashboard: vacío → 0%; sin base y hay ingresos → 100%. */
export function variacionPorcentual(actual: number, anterior: number): number {
  const a = toNonNegNumber(actual);
  const b = toNonNegNumber(anterior);
  if (b <= 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}

export function etiquetaMes(key: string): string {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return key || '';
  return new Date(y, m - 1, 1)
    .toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })
    .replace('.', '');
}

export function etiquetaPeriodo(
  periodo: PeriodoDashboard,
  desde: string,
  hasta: string,
): string {
  if (!desde) {
    if (periodo === 'semana') return 'Esta semana';
    if (periodo === 'anio') return 'Este año';
    return 'Este mes';
  }
  const d = parseDateOnly(desde);
  if (Number.isNaN(d.getTime())) return desde;
  if (periodo === 'anio') return String(d.getFullYear());
  if (periodo === 'mes') {
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }
  const h = parseDateOnly(hasta || desde);
  const fmt = (x: Date) =>
    x.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  return `${fmt(d)} – ${fmt(h)}`;
}

export function normalizarPeriodo(raw: unknown): PeriodoDashboard {
  const v = String(raw || 'mes').toLowerCase().trim();
  if (v === 'semana' || v === 'week') return 'semana';
  if (v === 'anio' || v === 'año' || v === 'ano' || v === 'year') return 'anio';
  return 'mes';
}

export function nombrePlan(raw: unknown): string {
  const s = String(raw ?? '').trim();
  return s || 'Sin plan';
}

export function ingresosMensualesVisibles(
  series: IngresoMensualKpi[],
  meses: 6 | 12,
): IngresoMensualKpi[] {
  if (!series?.length) return [];
  if (meses >= series.length) return series;
  return series.slice(series.length - meses);
}

export function mapPlanKpi(row: any): PlanKpi {
  return {
    planNombre: nombrePlan(row?.plan_nombre ?? row?.planNombre),
    contratosActivos: toNonNegNumber(row?.contratos_activos ?? row?.contratosActivos),
    ingresos: toNonNegNumber(row?.ingresos),
  };
}

export function mapIngresoMensualKpi(row: any): IngresoMensualKpi {
  const key = String(row?.key || '');
  return {
    key,
    label: row?.label ? String(row.label) : etiquetaMes(key),
    monto: toNonNegNumber(row?.monto),
    cantidadAbonos: toNonNegNumber(row?.cantidad_abonos ?? row?.cantidadAbonos),
  };
}

/** Mapea el JSON del RPC. Ausencia / DB vacía → ceros, nunca cifras de ejemplo. */
export function mapResumenDashboardFromRow(row: any, periodoDefault: PeriodoDashboard = 'mes'): ResumenDashboard {
  const parsed = parseRpcJson(row);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyResumenDashboard(periodoDefault);
  }
  const ingresosMesActual = toNonNegNumber(
    parsed.ingresos_mes_actual ?? parsed.ingresosMesActual,
  );
  const ingresosMesAnterior = toNonNegNumber(
    parsed.ingresos_mes_anterior ?? parsed.ingresosMesAnterior,
  );
  const planesRaw = parsed.planes;
  const seriesRaw = parsed.ingresos_mensuales ?? parsed.ingresosMensuales;
  return {
    periodo: normalizarPeriodo(parsed.periodo ?? periodoDefault),
    periodoDesde: String(parsed.periodo_desde ?? parsed.periodoDesde ?? ''),
    periodoHasta: String(parsed.periodo_hasta ?? parsed.periodoHasta ?? ''),
    ingresosPeriodo: toNonNegNumber(parsed.ingresos_periodo ?? parsed.ingresosPeriodo),
    cantidadAbonosPeriodo: toNonNegNumber(
      parsed.cantidad_abonos_periodo ?? parsed.cantidadAbonosPeriodo,
    ),
    contratosActivos: toNonNegNumber(parsed.contratos_activos ?? parsed.contratosActivos),
    contratosNuevos: toNonNegNumber(parsed.contratos_nuevos ?? parsed.contratosNuevos),
    conductoresActivos: toNonNegNumber(parsed.conductores_activos ?? parsed.conductoresActivos),
    motosTotal: toNonNegNumber(parsed.motos_total ?? parsed.motosTotal),
    motosAlquiladas: toNonNegNumber(parsed.motos_alquiladas ?? parsed.motosAlquiladas),
    motosDisponibles: toNonNegNumber(parsed.motos_disponibles ?? parsed.motosDisponibles),
    motosEnMantenimiento: toNonNegNumber(
      parsed.motos_en_mantenimiento ?? parsed.motosEnMantenimiento,
    ),
    motosFueraServicio: toNonNegNumber(
      parsed.motos_fuera_servicio ?? parsed.motosFueraServicio,
    ),
    cartera: toNonNegNumber(parsed.cartera),
    moraCantidad: toNonNegNumber(parsed.mora_cantidad ?? parsed.moraCantidad),
    moraMonto: toNonNegNumber(parsed.mora_monto ?? parsed.moraMonto),
    ingresosMesActual,
    ingresosMesAnterior,
    crecimientoMensualPct: variacionPorcentual(ingresosMesActual, ingresosMesAnterior),
    planes: Array.isArray(planesRaw) ? planesRaw.map(mapPlanKpi) : [],
    ingresosMensuales: Array.isArray(seriesRaw) ? seriesRaw.map(mapIngresoMensualKpi) : [],
  };
}

export function porcentajeDisponibles(kpis: ResumenDashboard): number {
  if (kpis.motosTotal <= 0) return 0;
  return Math.round((kpis.motosDisponibles / kpis.motosTotal) * 100);
}

export function maxMontoSerie(series: IngresoMensualKpi[]): number {
  return Math.max(0, ...series.map((m) => m.monto));
}

export function alturaBarra(monto: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(4, Math.round((toNonNegNumber(monto) / max) * 100));
}
