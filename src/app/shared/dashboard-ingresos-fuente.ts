/**
 * Fuente de verdad de métricas del dashboard (también en
 * supabase/migrations/20260903_dashboard_ingresos_egresos.sql).
 *
 * Ingresos del periodo = cuotas (abonos.estado = registrado) + otros
 * (movimientos_caja.tipo = ingreso, sin abono_id, no anulado).
 *
 * No se suman los ingresos de caja que ya tienen abono_id: esos los creó
 * el trigger 20260831 al confirmar/registrar el abono. Sumarlos otra vez
 * duplicaría la cuota.
 *
 * Egresos = movimientos_caja.tipo = egreso (mantenimientos, caja manual).
 * pagos.gastos NO es el stream de egresos: el pago manual legacy descuenta
 * gastos del neto del ingreso, no inserta un egreso.
 *
 * abonos.cobro_id es NOT NULL: un alquiler puntual no puede ser abono de
 * cuota. Por eso otros ingresos viven en caja, no en abonos.
 */

export interface AbonoIngresoFuente {
  monto: number;
  fecha: string;
  estado: string;
}

export interface CajaMovimientoFuente {
  monto: number;
  fecha: string;
  tipo: 'ingreso' | 'egreso';
  estado?: string | null;
  abonoId?: string | null;
}

export interface IngresosDashboardSplit {
  ingresosCuotas: number;
  ingresosOtros: number;
  ingresosPeriodo: number;
  cantidadAbonos: number;
  cantidadOtros: number;
  egresosPeriodo: number;
  cantidadEgresos: number;
}

function fechaEnRango(fecha: string, desde: string, hasta: string): boolean {
  const d = String(fecha || '').slice(0, 10);
  return d >= desde && d <= hasta;
}

function cajaVisible(m: CajaMovimientoFuente): boolean {
  return (m.estado || 'registrado') !== 'anulado';
}

export function splitIngresosDashboard(opts: {
  abonos: AbonoIngresoFuente[];
  caja: CajaMovimientoFuente[];
  desde: string;
  hasta: string;
}): IngresosDashboardSplit {
  const abonos = opts.abonos.filter(
    (a) => a.estado === 'registrado' && fechaEnRango(a.fecha, opts.desde, opts.hasta),
  );
  const otros = opts.caja.filter(
    (m) =>
      m.tipo === 'ingreso' &&
      cajaVisible(m) &&
      !m.abonoId &&
      fechaEnRango(m.fecha, opts.desde, opts.hasta),
  );
  const egresos = opts.caja.filter(
    (m) => m.tipo === 'egreso' && cajaVisible(m) && fechaEnRango(m.fecha, opts.desde, opts.hasta),
  );
  const ingresosCuotas = abonos.reduce((s, a) => s + (Number(a.monto) || 0), 0);
  const ingresosOtros = otros.reduce((s, m) => s + (Number(m.monto) || 0), 0);
  return {
    ingresosCuotas,
    ingresosOtros,
    ingresosPeriodo: ingresosCuotas + ingresosOtros,
    cantidadAbonos: abonos.length,
    cantidadOtros: otros.length,
    egresosPeriodo: egresos.reduce((s, m) => s + (Number(m.monto) || 0), 0),
    cantidadEgresos: egresos.length,
  };
}
