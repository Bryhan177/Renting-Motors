/**
 * Helper de tests del split viejo (abonos + caja). El RPC en vivo es
 * supabase/migrations/20260909_dashboard_desde_pagos.sql:
 * ingresos = sum(pagos.valor_pagado), egresos = sum(pagos.gastos),
 * ingresos_otros = 0 (Excel ya incluye Franklin/otros en valor_pagado).
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
