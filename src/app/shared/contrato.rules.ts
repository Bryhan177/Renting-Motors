import { CUOTA_SEMANAL_ESTANDAR } from './constants';
import { Moto } from './interfaces/moto';
import { Usuario } from './interfaces/usuario';
import { FrecuenciaPago, parseDateOnly, toDateOnlyString } from './periodo.util';

export const DURACION_MINIMA_MESES = 3;

export type ContratoEstado = 'borrador' | 'activo' | 'finalizado' | 'anulado';

/** Suma meses de calendario (31 ene + 3 meses = 30 abr), alineado a `interval '3 months'` de Postgres. */
export function addCalendarMonths(date: Date, months: number): Date {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const day = date.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

export function fechaFinMinima(fechaInicio: string | Date): string {
  return toDateOnlyString(addCalendarMonths(parseDateOnly(fechaInicio), DURACION_MINIMA_MESES));
}

export function duracionMinimaValida(fechaInicio: string | Date, fechaFin: string | Date): boolean {
  const fin = parseDateOnly(fechaFin);
  const minimo = parseDateOnly(fechaFinMinima(fechaInicio));
  return fin.getTime() >= minimo.getTime();
}

export function idDeRelacion(ref: string | { _id?: string; id?: string } | null | undefined): string {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return ref._id || ref.id || '';
}

export function nombreConductor(ref: string | Usuario | null | undefined): string {
  if (!ref || typeof ref === 'string') return '—';
  return `${ref.nombre || ''} ${ref.apellido || ''}`.trim() || '—';
}

export function etiquetaMoto(ref: string | Moto | null | undefined): string {
  if (!ref || typeof ref === 'string') return '—';
  const placa = ref.placa || '';
  const modelo = `${ref.marca || ''} ${ref.modelo || ''}`.trim();
  if (placa && modelo) return `${placa} · ${modelo}`;
  return placa || modelo || '—';
}

export function labelFrecuencia(frecuencia: FrecuenciaPago | string | null | undefined): string {
  switch (frecuencia) {
    case 'quincenal':
      return 'Quincenal';
    case 'mensual':
      return 'Mensual';
    default:
      return 'Semanal';
  }
}

export function cuotaSugeridaPorFrecuencia(
  frecuencia: FrecuenciaPago,
  cuotaSemanal = CUOTA_SEMANAL_ESTANDAR,
): number {
  if (frecuencia === 'quincenal') return cuotaSemanal * 2;
  if (frecuencia === 'mensual') return cuotaSemanal * 4;
  return cuotaSemanal;
}

export function mensajeErrorContrato(error: unknown): string {
  const e = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
    error?: { code?: string; message?: string; details?: string };
  };
  const code = e?.code || e?.error?.code || '';
  const blob = [code, e?.message, e?.details, e?.hint, e?.error?.message, e?.error?.details]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    code === '23505' ||
    blob.includes('contratos_un_activo') ||
    blob.includes('duplicate key')
  ) {
    if (blob.includes('contratos_un_activo_conductor') || blob.includes('(conductor_id)')) {
      return 'Ese conductor ya tiene un contrato activo.';
    }
    if (blob.includes('contratos_un_activo_moto') || blob.includes('(moto_id)')) {
      return 'Esa moto ya tiene un contrato activo.';
    }
    return 'Ya existe un contrato activo para ese conductor o esa moto.';
  }

  if (code === '23514' || blob.includes('duración mínima') || blob.includes('duracion minima')) {
    return 'La duración mínima del contrato es 3 meses.';
  }

  return e?.error?.message || e?.message || 'No se pudo completar la operación';
}
