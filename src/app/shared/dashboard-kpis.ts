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

/** Un mes con las dos salidas etiquetadas (pagos.gastos vs caja egreso). */
export interface EgresoMensualSplit {
  key: string;
  label: string;
  montoPagos: number;
  montoCaja: number;
  /** pagos + caja (solo para totales; la UI no lo muestra sin etiqueta). */
  monto: number;
  cantidadPagos: number;
  cantidadCaja: number;
}

export type SerieEgresosChart = 'gastos_pagos' | 'egresos_caja';

export interface ResumenDashboard {
  periodo: PeriodoDashboard;
  periodoDesde: string;
  periodoHasta: string;
  ingresosPeriodo: number;
  /** Cobrado (pagos.valor_pagado, no anulado). Parte de ingresosPeriodo. */
  ingresosCuotas: number;
  /** Reservado: Excel ya incluye Franklin/otros en valor_pagado. RPC 20260909 = 0. */
  ingresosOtros: number;
  cantidadAbonosPeriodo: number;
  cantidadOtrosPeriodo: number;
  /** Gastos operativos Excel: sum(pagos.gastos). No incluye caja. */
  egresosPeriodo: number;
  cantidadEgresosPeriodo: number;
  /** Todos los egresos de Flujo de caja (mdd + ahorro_mdd, no anulado). */
  egresosCajaPeriodo: number;
  cantidadEgresosCajaPeriodo: number;
  /** Parte de egresosCajaPeriodo con banco = mdd. */
  egresosCajaMddPeriodo: number;
  /** Parte de egresosCajaPeriodo con banco = ahorro_mdd. */
  egresosCajaAhorroPeriodo: number;
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
  egresosMesActual: number;
  egresosMesAnterior: number;
  egresosCajaMesActual: number;
  egresosCajaMesAnterior: number;
  /** % mes actual vs anterior. 0 si ambos son 0; 100 si anterior es 0 y hay ingresos. */
  crecimientoMensualPct: number;
  planes: PlanKpi[];
  ingresosMensuales: IngresoMensualKpi[];
  egresosMensuales: IngresoMensualKpi[];
  egresosCajaMensuales: IngresoMensualKpi[];
}

export function emptyResumenDashboard(periodo: PeriodoDashboard = 'mes'): ResumenDashboard {
  return {
    periodo,
    periodoDesde: '',
    periodoHasta: '',
    ingresosPeriodo: 0,
    ingresosCuotas: 0,
    ingresosOtros: 0,
    cantidadAbonosPeriodo: 0,
    cantidadOtrosPeriodo: 0,
    egresosPeriodo: 0,
    cantidadEgresosPeriodo: 0,
    egresosCajaPeriodo: 0,
    cantidadEgresosCajaPeriodo: 0,
    egresosCajaMddPeriodo: 0,
    egresosCajaAhorroPeriodo: 0,
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
    egresosMesActual: 0,
    egresosMesAnterior: 0,
    egresosCajaMesActual: 0,
    egresosCajaMesAnterior: 0,
    crecimientoMensualPct: 0,
    planes: [],
    ingresosMensuales: [],
    egresosMensuales: [],
    egresosCajaMensuales: [],
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
    cantidadAbonos: toNonNegNumber(
      row?.cantidad_abonos ?? row?.cantidadAbonos ?? row?.cantidad,
    ),
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
  const egresosRaw = parsed.egresos_mensuales ?? parsed.egresosMensuales;
  const egresosCajaRaw = parsed.egresos_caja_mensuales ?? parsed.egresosCajaMensuales;
  return {
    periodo: normalizarPeriodo(parsed.periodo ?? periodoDefault),
    periodoDesde: String(parsed.periodo_desde ?? parsed.periodoDesde ?? ''),
    periodoHasta: String(parsed.periodo_hasta ?? parsed.periodoHasta ?? ''),
    ingresosPeriodo: toNonNegNumber(parsed.ingresos_periodo ?? parsed.ingresosPeriodo),
    ingresosCuotas: toNonNegNumber(
      parsed.ingresos_cuotas ??
        parsed.ingresosCuotas ??
        Math.max(
          0,
          toNonNegNumber(parsed.ingresos_periodo ?? parsed.ingresosPeriodo) -
            toNonNegNumber(parsed.ingresos_otros ?? parsed.ingresosOtros),
        ),
    ),
    ingresosOtros: toNonNegNumber(parsed.ingresos_otros ?? parsed.ingresosOtros),
    cantidadAbonosPeriodo: toNonNegNumber(
      parsed.cantidad_abonos_periodo ?? parsed.cantidadAbonosPeriodo,
    ),
    cantidadOtrosPeriodo: toNonNegNumber(
      parsed.cantidad_otros_periodo ?? parsed.cantidadOtrosPeriodo,
    ),
    egresosPeriodo: toNonNegNumber(parsed.egresos_periodo ?? parsed.egresosPeriodo),
    cantidadEgresosPeriodo: toNonNegNumber(
      parsed.cantidad_egresos_periodo ?? parsed.cantidadEgresosPeriodo,
    ),
    egresosCajaPeriodo: toNonNegNumber(
      parsed.egresos_caja_periodo ?? parsed.egresosCajaPeriodo,
    ),
    cantidadEgresosCajaPeriodo: toNonNegNumber(
      parsed.cantidad_egresos_caja_periodo ?? parsed.cantidadEgresosCajaPeriodo,
    ),
    egresosCajaMddPeriodo: toNonNegNumber(
      parsed.egresos_caja_mdd_periodo ?? parsed.egresosCajaMddPeriodo,
    ),
    egresosCajaAhorroPeriodo: toNonNegNumber(
      parsed.egresos_caja_ahorro_periodo ?? parsed.egresosCajaAhorroPeriodo,
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
    egresosMesActual: toNonNegNumber(parsed.egresos_mes_actual ?? parsed.egresosMesActual),
    egresosMesAnterior: toNonNegNumber(
      parsed.egresos_mes_anterior ?? parsed.egresosMesAnterior,
    ),
    egresosCajaMesActual: toNonNegNumber(
      parsed.egresos_caja_mes_actual ?? parsed.egresosCajaMesActual,
    ),
    egresosCajaMesAnterior: toNonNegNumber(
      parsed.egresos_caja_mes_anterior ?? parsed.egresosCajaMesAnterior,
    ),
    crecimientoMensualPct: variacionPorcentual(ingresosMesActual, ingresosMesAnterior),
    planes: Array.isArray(planesRaw) ? planesRaw.map(mapPlanKpi) : [],
    ingresosMensuales: Array.isArray(seriesRaw) ? seriesRaw.map(mapIngresoMensualKpi) : [],
    egresosMensuales: Array.isArray(egresosRaw) ? egresosRaw.map(mapIngresoMensualKpi) : [],
    egresosCajaMensuales: Array.isArray(egresosCajaRaw)
      ? egresosCajaRaw.map(mapIngresoMensualKpi)
      : [],
  };
}

/** Alinea gastos pagos y egresos caja por YYYY-MM. */
export function combinarEgresosMensuales(
  pagos: IngresoMensualKpi[],
  caja: IngresoMensualKpi[],
): EgresoMensualSplit[] {
  const byKey = new Map<string, EgresoMensualSplit>();
  const touch = (row: IngresoMensualKpi, side: 'pagos' | 'caja') => {
    const cur = byKey.get(row.key) || {
      key: row.key,
      label: row.label || etiquetaMes(row.key),
      montoPagos: 0,
      montoCaja: 0,
      monto: 0,
      cantidadPagos: 0,
      cantidadCaja: 0,
    };
    if (side === 'pagos') {
      cur.montoPagos = row.monto;
      cur.cantidadPagos = row.cantidadAbonos;
    } else {
      cur.montoCaja = row.monto;
      cur.cantidadCaja = row.cantidadAbonos;
    }
    if (row.label) cur.label = row.label;
    /* monto no se usa como "salida única": overlap pagos↔caja. */
    cur.monto = 0;
    byKey.set(row.key, cur);
  };
  (pagos || []).forEach((r) => touch(r, 'pagos'));
  (caja || []).forEach((r) => touch(r, 'caja'));
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function montoSerieEgresos(
  row: EgresoMensualSplit,
  serie: SerieEgresosChart,
): number {
  return serie === 'egresos_caja' ? row.montoCaja : row.montoPagos;
}

export function maxMontoEgresosSplit(
  series: EgresoMensualSplit[],
  modo: SerieEgresosChart,
): number {
  if (!series?.length) return 0;
  if (modo === 'egresos_caja') return Math.max(0, ...series.map((m) => m.montoCaja));
  return Math.max(0, ...series.map((m) => m.montoPagos));
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
