export type FrecuenciaPago = 'semanal' | 'quincenal' | 'mensual';

export interface PeriodoCobro {
  numeroPeriodo: number;
  periodoInicio: Date;
  periodoFin: Date;
  fechaVencimiento: Date;
}

/** Días por frecuencia (calendario simple, sin prorrateo). */
export function diasPorFrecuencia(frecuencia: FrecuenciaPago = 'semanal'): number {
  switch (frecuencia) {
    case 'quincenal':
      return 15;
    case 'mensual':
      return 30;
    case 'semanal':
    default:
      return 7;
  }
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) return startOfDay(value);
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toDateOnlyString(date: Date): string {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function diffDays(from: Date, to: Date): number {
  const start = startOfDay(from).getTime();
  const end = startOfDay(to).getTime();
  return Math.floor((end - start) / 86_400_000);
}

export function calcularPeriodo(
  fechaInicio: Date,
  numeroPeriodo: number,
  frecuencia: FrecuenciaPago = 'semanal',
): PeriodoCobro {
  if (numeroPeriodo < 1) throw new Error('numeroPeriodo debe ser >= 1');
  const dias = diasPorFrecuencia(frecuencia);
  const inicioContrato = startOfDay(fechaInicio);
  const periodoInicio = addDays(inicioContrato, (numeroPeriodo - 1) * dias);
  const periodoFin = addDays(periodoInicio, dias - 1);
  return {
    numeroPeriodo,
    periodoInicio,
    periodoFin,
    fechaVencimiento: new Date(periodoInicio),
  };
}

export function numeroPeriodoVigente(
  fechaInicio: Date,
  hoy: Date = new Date(),
  frecuencia: FrecuenciaPago = 'semanal',
): number {
  const dias = diffDays(fechaInicio, hoy);
  if (dias < 0) return 0;
  const largo = diasPorFrecuencia(frecuencia);
  return Math.floor(dias / largo) + 1;
}

export function calcularEstadoCobro(
  montoEsperado: number,
  montoPagado: number,
): 'pendiente' | 'parcial' | 'pagado' {
  if (montoPagado <= 0) return 'pendiente';
  if (montoPagado >= montoEsperado) return 'pagado';
  return 'parcial';
}

export function calcularTotalesDeposito(params: {
  montoEsperado: number;
  montoRecibido: number;
  montoDevuelto: number;
  montoRetenido: number;
  enLiquidacion?: boolean;
}): {
  saldoPendiente: number;
  saldoEnCustodia: number;
  estado: string;
} {
  const montoEsperado = Math.max(0, params.montoEsperado);
  const montoRecibido = Math.max(0, params.montoRecibido);
  const montoDevuelto = Math.max(0, params.montoDevuelto);
  const montoRetenido = Math.max(0, params.montoRetenido);
  const saldoPendiente = Math.max(0, montoEsperado - montoRecibido);
  const saldoEnCustodia = Math.max(0, montoRecibido - montoDevuelto - montoRetenido);

  let estado = 'pendiente';
  if (params.enLiquidacion || montoDevuelto > 0 || montoRetenido > 0) {
    if (saldoEnCustodia === 0 && montoDevuelto > 0 && montoRetenido > 0) estado = 'parcialmente_devuelto';
    else if (saldoEnCustodia === 0 && montoDevuelto > 0) estado = 'devuelto';
    else if (saldoEnCustodia === 0 && montoRetenido > 0) estado = 'retenido';
    else estado = 'en_liquidacion';
  } else if (montoRecibido >= montoEsperado && montoEsperado > 0) {
    estado = 'recibido';
  } else if (montoRecibido > 0) {
    estado = 'parcial';
  }

  return { saldoPendiente, saldoEnCustodia, estado };
}

/** Alias por compatibilidad */
export type PeriodoSemanal = PeriodoCobro;
