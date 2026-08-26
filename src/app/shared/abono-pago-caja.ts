/**
 * Contrato: qué debe pasar en pagos/caja cuando cambia el estado de un abono.
 * El trigger Postgres (abonos_sync_pago_caja) es la fuente de verdad;
 * estas funciones documentan y testean el mapeo sin tocar montos de cobros.
 */

export type EstadoAbono = 'pendiente_confirmacion' | 'registrado' | 'anulado';
export type AccionPagoCaja = 'crear' | 'anular' | 'noop';

export interface AbonoPagoCajaInput {
  id: string;
  estado: EstadoAbono;
  monto: number;
  fechaPago: string;
  metodoPago?: string | null;
  observaciones?: string | null;
  conductorId: string;
  cobroId: string;
  motoId?: string | null;
  motoPlaca?: string | null;
  confirmadoPor?: string | null;
  responsableId?: string | null;
  comprobante?: string | null;
}

export interface PayloadPagoDesdeAbono {
  conductor_id: string;
  moto_id: string | null;
  fecha_pago: string;
  monto: number;
  valor_pagado: number;
  gastos: number;
  metodo_pago: string;
  observaciones: string;
  pagado: boolean;
  registrado_por: string | null;
  comprobante_imagen: string | null;
  abono_id: string;
  estado: 'registrado';
}

export interface PayloadCajaDesdeAbono {
  banco: 'mdd';
  tipo: 'ingreso';
  monto: number;
  fecha: string;
  descripcion: string;
  moto_id: string | null;
  abono_id: string;
  estado: 'registrado';
}

/** pendiente no crea pago. registrado sí. anular un registrado marca anulado, no borra. */
export function accionAbonoPagoCaja(opts: {
  estadoNuevo: string;
  estadoAnterior?: string | null;
  esInsert: boolean;
}): AccionPagoCaja {
  const nuevo = opts.estadoNuevo;
  const anterior = opts.estadoAnterior ?? null;
  if (nuevo === 'registrado') {
    if (opts.esInsert || anterior !== 'registrado') return 'crear';
    return 'noop';
  }
  if (nuevo === 'anulado' && !opts.esInsert && anterior === 'registrado') {
    return 'anular';
  }
  return 'noop';
}

export function fechaCajaBogota(fechaPago: string): string {
  const raw = String(fechaPago || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : raw;
}

export function payloadPagoDesdeAbono(a: AbonoPagoCajaInput): PayloadPagoDesdeAbono {
  return {
    conductor_id: a.conductorId,
    moto_id: a.motoId ?? null,
    fecha_pago: a.fechaPago,
    monto: a.monto,
    valor_pagado: a.monto,
    gastos: 0,
    metodo_pago: a.metodoPago || 'TRANSFERENCIA',
    observaciones: a.observaciones || 'Abono de cuota',
    pagado: true,
    registrado_por: a.confirmadoPor || a.responsableId || null,
    comprobante_imagen: a.comprobante || null,
    abono_id: a.id,
    estado: 'registrado',
  };
}

export function payloadCajaDesdeAbono(a: AbonoPagoCajaInput): PayloadCajaDesdeAbono {
  const placa = a.motoPlaca ? ` · ${a.motoPlaca}` : '';
  const metodo = a.metodoPago ? ` · ${a.metodoPago}` : '';
  return {
    banco: 'mdd',
    tipo: 'ingreso',
    monto: a.monto,
    fecha: fechaCajaBogota(a.fechaPago),
    descripcion: `Abono cuota${placa}${metodo}`,
    moto_id: a.motoId ?? null,
    abono_id: a.id,
    estado: 'registrado',
  };
}

export function filaFinancieraVisible(estado?: string | null): boolean {
  return (estado || 'registrado') !== 'anulado';
}
