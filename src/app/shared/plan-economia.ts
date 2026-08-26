import { FrecuenciaPago } from './periodo.util';
import { Plan } from './interfaces/plan';
import { cuotaSugeridaPorFrecuencia } from './contrato.rules';

export const PERIODICIDADES: FrecuenciaPago[] = ['semanal', 'quincenal', 'mensual'];

export function etiquetaPlan(planNombre?: string | null): string {
  const n = (planNombre || '').trim();
  return n || 'Sin plan';
}

export function periodicidadesDe(plan: Plan | null | undefined): FrecuenciaPago[] {
  const raw = plan?.periodicidadesPermitidas || [];
  const allowed = PERIODICIDADES.filter((p) => raw.includes(p));
  return allowed.length ? allowed : ['semanal'];
}

export function planPermiteFrecuencia(
  plan: Plan | null | undefined,
  frecuencia: FrecuenciaPago | string | null | undefined,
): boolean {
  if (!plan || !frecuencia) return false;
  return periodicidadesDe(plan).includes(frecuencia as FrecuenciaPago);
}

export function frecuenciaInicialDelPlan(plan: Plan): FrecuenciaPago {
  const allowed = periodicidadesDe(plan);
  return allowed.includes('semanal') ? 'semanal' : allowed[0];
}

/** Cuota sugerida para la frecuencia, a partir del valor semanal del plan (0 = hay que pactar a mano). */
export function cuotaSugeridaDelPlan(plan: Plan, frecuencia: FrecuenciaPago): number {
  return cuotaSugeridaPorFrecuencia(frecuencia, Number(plan.valorSugerido) || 0);
}
