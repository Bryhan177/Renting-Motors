import { Moto } from './interfaces/moto';
import { Plan } from './interfaces/plan';
import { Usuario } from './interfaces/usuario';
import { DEPOSITO_ESTANDAR } from './constants';
import { FrecuenciaPago, toDateOnlyString } from './periodo.util';
import {
  DURACION_MINIMA_MESES,
  duracionMinimaValida,
  etiquetaMoto,
  fechaFinMinima,
  labelFrecuencia,
  nombreConductor,
} from './contrato.rules';
import {
  cuotaSugeridaDelPlan,
  etiquetaPlan,
  frecuenciaInicialDelPlan,
  periodicidadesDe,
  planPermiteFrecuencia,
} from './plan-economia';

/**
 * Pasos del flujo de alta (owner). `cuotaInicial` solo aparece si el plan lo pide.
 * `moto` se omite cuando Motos ya eligió la MDD.
 */
export type ContratoWizardPasoId =
  | 'conductor'
  | 'moto'
  | 'plan'
  | 'frecuencia'
  | 'valor'
  | 'fechaInicio'
  | 'duracion'
  | 'cuotaInicial'
  | 'resumen';

export interface ContratoWizardForm {
  conductorId: string;
  motoId: string;
  fechaInicio: string;
  fechaFin: string;
  cuotaSemanal: number;
  depositoPactado: number;
  frecuenciaPago: FrecuenciaPago;
  planId: string;
  planNombre: string;
  cuotaInicial: number;
  duracionMeses: number;
}

export interface ContratoWizardOpts {
  omitirMoto?: boolean;
}

export interface ContratoWizardResumenLinea {
  label: string;
  value: string;
}

export const ETIQUETAS_PASO: Record<ContratoWizardPasoId, string> = {
  conductor: 'Conductor',
  moto: 'Moto',
  plan: 'Plan',
  frecuencia: 'Frecuencia',
  valor: 'Valor pactado',
  fechaInicio: 'Fecha de inicio',
  duracion: 'Duración',
  cuotaInicial: 'Cuota inicial',
  resumen: 'Resumen',
};

export function formWizardVacio(motoId = ''): ContratoWizardForm {
  const inicio = toDateOnlyString(new Date());
  return {
    conductorId: '',
    motoId,
    fechaInicio: inicio,
    fechaFin: fechaFinMinima(inicio),
    cuotaSemanal: 0,
    depositoPactado: DEPOSITO_ESTANDAR,
    frecuenciaPago: 'semanal',
    planId: '',
    planNombre: '',
    cuotaInicial: 0,
    duracionMeses: DURACION_MINIMA_MESES,
  };
}

export function duracionMinimaDelPlan(plan: Plan | null | undefined): number {
  return Math.max(Number(plan?.duracionMinimaMeses) || DURACION_MINIMA_MESES, DURACION_MINIMA_MESES);
}

export function pasosDelWizard(
  plan: Plan | null | undefined,
  opts: ContratoWizardOpts = {},
): ContratoWizardPasoId[] {
  const pasos: ContratoWizardPasoId[] = ['conductor'];
  if (!opts.omitirMoto) pasos.push('moto');
  pasos.push('plan', 'frecuencia', 'valor', 'fechaInicio', 'duracion');
  if (plan?.requiereCuotaInicial) pasos.push('cuotaInicial');
  pasos.push('resumen');
  return pasos;
}

export function etiquetaPaso(paso: ContratoWizardPasoId): string {
  return ETIQUETAS_PASO[paso];
}

export function planDeFormulario(planes: Plan[], form: Pick<ContratoWizardForm, 'planId'>): Plan | null {
  return planes.find((p) => p._id === form.planId) || null;
}

export function pasoCompleto(
  paso: ContratoWizardPasoId,
  form: ContratoWizardForm,
  plan: Plan | null | undefined,
): boolean {
  return !mensajePasoIncompleto(paso, form, plan);
}

export function mensajePasoIncompleto(
  paso: ContratoWizardPasoId,
  form: ContratoWizardForm,
  plan: Plan | null | undefined,
): string | null {
  switch (paso) {
    case 'conductor':
      return form.conductorId ? null : 'Elige un conductor.';
    case 'moto':
      return form.motoId ? null : 'Elige una moto.';
    case 'plan':
      if (!form.planId || !plan) return 'Elige un plan activo.';
      if (plan.activo === false) return 'Ese plan está inactivo. Elige otro.';
      return null;
    case 'frecuencia':
      if (!plan) return 'Elige un plan antes de la frecuencia.';
      if (!form.frecuenciaPago || !planPermiteFrecuencia(plan, form.frecuenciaPago)) {
        return 'Elige una frecuencia permitida por el plan.';
      }
      return null;
    case 'valor':
      return mensajeValorPactado(form, plan);
    case 'fechaInicio':
      return form.fechaInicio ? null : 'Indica la fecha de inicio.';
    case 'duracion':
      return mensajeDuracion(form, plan);
    case 'cuotaInicial':
      if (!plan?.requiereCuotaInicial) return null;
      if (form.cuotaInicial == null || Number(form.cuotaInicial) < 0) {
        return 'La cuota inicial no puede ser negativa.';
      }
      return null;
    case 'resumen':
      return null;
    default:
      return 'Paso desconocido.';
  }
}

function mensajeValorPactado(form: ContratoWizardForm, plan: Plan | null | undefined): string | null {
  if (!plan) return 'Elige un plan antes del valor pactado.';
  const cuota = Number(form.cuotaSemanal);
  if (!Number.isFinite(cuota) || cuota <= 0) {
    return 'Indica el valor pactado. El plan solo sugiere.';
  }
  if (!plan.permiteNegociacion) {
    const sugerida = cuotaSugeridaDelPlan(plan, form.frecuenciaPago);
    if (sugerida <= 0) {
      return 'Este plan no tiene valor sugerido y no permite negociar.';
    }
    if (cuota !== sugerida) {
      return 'Este plan no permite negociar: se usa el valor sugerido.';
    }
  }
  return null;
}

function mensajeDuracion(form: ContratoWizardForm, plan: Plan | null | undefined): string | null {
  const min = duracionMinimaDelPlan(plan);
  const meses = Number(form.duracionMeses) || 0;
  if (meses < min) {
    return `La duración mínima de este plan es ${min} meses.`;
  }
  const fin = form.fechaFin || fechaFinMinima(form.fechaInicio, meses);
  if (!duracionMinimaValida(form.fechaInicio, fin, meses)) {
    return `La duración mínima de este plan es ${min} meses.`;
  }
  return null;
}

export function visitar(visitados: ContratoWizardPasoId[], paso: ContratoWizardPasoId): ContratoWizardPasoId[] {
  return visitados.includes(paso) ? visitados : [...visitados, paso];
}

/** Al cambiar plan/frecuencia, los pasos siguientes hay que volver a recorrerlos. */
export function invalidarPosteriores(
  visitados: ContratoWizardPasoId[],
  pasos: ContratoWizardPasoId[],
  desde: ContratoWizardPasoId,
): ContratoWizardPasoId[] {
  const idx = pasos.indexOf(desde);
  if (idx < 0) return [];
  const keep = new Set(pasos.slice(0, idx + 1));
  return visitados.filter((p) => keep.has(p));
}

export function puedeIrAPaso(
  pasos: ContratoWizardPasoId[],
  visitados: ContratoWizardPasoId[],
  form: ContratoWizardForm,
  plan: Plan | null | undefined,
  fromIndex: number,
  toIndex: number,
): { ok: boolean; mensaje?: string } {
  if (toIndex === fromIndex) return { ok: true };
  if (toIndex < 0 || toIndex >= pasos.length) return { ok: false, mensaje: 'Paso inválido.' };
  if (toIndex < fromIndex) return { ok: true };
  for (let i = 0; i < toIndex; i++) {
    const paso = pasos[i];
    if (!visitados.includes(paso)) {
      return { ok: false, mensaje: `Recorre el paso ${i + 1}: ${etiquetaPaso(paso)}.` };
    }
    const mensaje = mensajePasoIncompleto(paso, form, plan);
    if (mensaje) return { ok: false, mensaje };
  }
  return { ok: true };
}

export function puedeAvanzar(
  paso: ContratoWizardPasoId,
  form: ContratoWizardForm,
  plan: Plan | null | undefined,
): { ok: boolean; mensaje?: string } {
  const mensaje = mensajePasoIncompleto(paso, form, plan);
  if (mensaje) return { ok: false, mensaje };
  return { ok: true };
}

/**
 * Create solo si todos los pasos de datos se recorrieron y están completos.
 * El resumen no cuenta como “saltado”: hay que estar en él.
 */
export function puedeCrearBorrador(
  form: ContratoWizardForm,
  plan: Plan | null | undefined,
  visitados: ContratoWizardPasoId[],
  pasoActual: ContratoWizardPasoId,
  opts: ContratoWizardOpts = {},
): { ok: boolean; mensaje?: string } {
  if (pasoActual !== 'resumen') {
    return { ok: false, mensaje: 'Revisa el resumen antes de crear el borrador.' };
  }
  const pasos = pasosDelWizard(plan, opts);
  for (const paso of pasos) {
    if (paso === 'resumen') continue;
    if (!visitados.includes(paso)) {
      return { ok: false, mensaje: `Falta recorrer el paso: ${etiquetaPaso(paso)}.` };
    }
    const mensaje = mensajePasoIncompleto(paso, form, plan);
    if (mensaje) return { ok: false, mensaje };
  }
  return { ok: true };
}

/** Validación de datos (plan + valor) sin exigir el orden UI. Usada como red de seguridad en Motos/Contratos. */
export function formularioListoParaCrear(
  form: ContratoWizardForm,
  plan: Plan | null | undefined,
  opts: ContratoWizardOpts = {},
): { ok: boolean; mensaje?: string } {
  const pasos = pasosDelWizard(plan, opts);
  for (const paso of pasos) {
    if (paso === 'resumen') continue;
    const mensaje = mensajePasoIncompleto(paso, form, plan);
    if (mensaje) return { ok: false, mensaje };
  }
  return { ok: true };
}

export function aplicarCambioPlan(form: ContratoWizardForm, plan: Plan | null): ContratoWizardForm {
  if (!plan) {
    return {
      ...form,
      planId: '',
      planNombre: '',
      cuotaSemanal: 0,
      cuotaInicial: 0,
      duracionMeses: DURACION_MINIMA_MESES,
      frecuenciaPago: 'semanal',
      fechaFin: fechaFinMinima(form.fechaInicio, DURACION_MINIMA_MESES),
    };
  }
  const duracionMeses = duracionMinimaDelPlan(plan);
  const frecuenciaPago = frecuenciaInicialDelPlan(plan);
  return {
    ...form,
    planId: plan._id || form.planId,
    planNombre: plan.nombre,
    duracionMeses,
    frecuenciaPago,
    cuotaSemanal: cuotaSugeridaDelPlan(plan, frecuenciaPago),
    cuotaInicial: plan.requiereCuotaInicial ? form.cuotaInicial : 0,
    fechaFin: fechaFinMinima(form.fechaInicio, duracionMeses),
  };
}

export function aplicarCambioFrecuencia(
  form: ContratoWizardForm,
  plan: Plan | null,
  frecuencia: FrecuenciaPago,
): ContratoWizardForm {
  if (!plan) return form;
  const frecuenciaPago = planPermiteFrecuencia(plan, frecuencia)
    ? frecuencia
    : frecuenciaInicialDelPlan(plan);
  return {
    ...form,
    frecuenciaPago,
    cuotaSemanal: cuotaSugeridaDelPlan(plan, frecuenciaPago),
  };
}

export function aplicarCambioInicio(form: ContratoWizardForm): ContratoWizardForm {
  const meses = Number(form.duracionMeses) || DURACION_MINIMA_MESES;
  return {
    ...form,
    fechaFin: fechaFinMinima(form.fechaInicio, meses),
  };
}

export function aplicarCambioDuracion(form: ContratoWizardForm, plan: Plan | null): ContratoWizardForm {
  const min = duracionMinimaDelPlan(plan);
  const meses = Math.max(Number(form.duracionMeses) || min, min);
  return {
    ...form,
    duracionMeses: meses,
    fechaFin: fechaFinMinima(form.fechaInicio, meses),
  };
}

export function payloadDesdeForm(form: ContratoWizardForm): ContratoWizardForm {
  return { ...form };
}

export function fechaCortaWizard(value?: string | null): string {
  if (!value) return '—';
  const d = String(value).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

export function resumenContrato(
  form: ContratoWizardForm,
  plan: Plan | null | undefined,
  conductor?: Usuario | string | null,
  moto?: Moto | string | null,
): ContratoWizardResumenLinea[] {
  const nombre =
    conductor && typeof conductor !== 'string'
      ? nombreConductor(conductor)
      : form.conductorId || '—';
  const motoLabel =
    moto && typeof moto !== 'string' ? etiquetaMoto(moto) : form.motoId || '—';
  const lineas: ContratoWizardResumenLinea[] = [
    { label: 'Conductor', value: nombre },
    { label: 'Moto', value: motoLabel },
    { label: 'Plan', value: etiquetaPlan(form.planNombre || plan?.nombre) },
    { label: 'Frecuencia', value: labelFrecuencia(form.frecuenciaPago) },
    {
      label: 'Valor pactado',
      value: `$ ${Number(form.cuotaSemanal || 0).toLocaleString('es-CO')}`,
    },
    { label: 'Fecha de inicio', value: fechaCortaWizard(form.fechaInicio) },
    {
      label: 'Duración',
      value: `${form.duracionMeses || 0} meses · fin ${fechaCortaWizard(form.fechaFin)}`,
    },
  ];
  if (plan?.requiereCuotaInicial) {
    lineas.push({
      label: 'Cuota inicial',
      value: `$ ${Number(form.cuotaInicial || 0).toLocaleString('es-CO')}`,
    });
  }
  lineas.push({
    label: 'Depósito',
    value: `$ ${Number(form.depositoPactado || 0).toLocaleString('es-CO')}`,
  });
  return lineas;
}

export function etiquetaOpcionPlan(p: Plan): string {
  if (p.valorSugerido > 0) {
    return `${p.nombre} · sugerido $ ${p.valorSugerido.toLocaleString('es-CO')}/sem`;
  }
  return `${p.nombre} · valor a convenir`;
}

export function frecuenciasDelPlan(plan: Plan | null | undefined): FrecuenciaPago[] {
  return plan ? periodicidadesDe(plan) : [];
}

export function permiteNegociarValor(plan: Plan | null | undefined): boolean {
  return plan?.permiteNegociacion !== false;
}

export function labelCuotaPactada(frecuencia: FrecuenciaPago | string | null | undefined): string {
  switch (frecuencia) {
    case 'quincenal':
      return 'Valor pactado (quincenal)';
    case 'mensual':
      return 'Valor pactado (mensual)';
    default:
      return 'Valor pactado (semanal)';
  }
}
