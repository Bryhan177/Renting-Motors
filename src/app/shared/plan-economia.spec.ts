import {
  cuotaSugeridaDelPlan,
  etiquetaPlan,
  frecuenciaInicialDelPlan,
  periodicidadesDe,
  planPermiteFrecuencia,
} from './plan-economia';
import { Plan } from './interfaces/plan';

const personal: Plan = {
  _id: 'p1',
  nombre: 'Personal',
  descripcion: 'Uso personal',
  condicionesUso: 'No delivery',
  periodicidadesPermitidas: ['semanal', 'quincenal'],
  valorSugerido: 115000,
  permiteNegociacion: true,
  duracionMinimaMeses: 3,
  requiereCuotaInicial: false,
  activo: true,
};

const propietario: Plan = {
  _id: 'p3',
  nombre: 'Propietario',
  descripcion: 'Ex Liquidación',
  condicionesUso: 'Cuota a convenir',
  periodicidadesPermitidas: ['semanal', 'quincenal', 'mensual'],
  valorSugerido: 0,
  permiteNegociacion: true,
  duracionMinimaMeses: 3,
  requiereCuotaInicial: true,
  activo: true,
};

describe('plan-economia', () => {
  it('etiqueta Sin plan si el snapshot está vacío', () => {
    expect(etiquetaPlan(null)).toBe('Sin plan');
    expect(etiquetaPlan('')).toBe('Sin plan');
    expect(etiquetaPlan('Trabajo')).toBe('Trabajo');
  });

  it('prefiera semanal si el plan la permite; si no, la primera permitida', () => {
    expect(frecuenciaInicialDelPlan(personal)).toBe('semanal');
    expect(
      frecuenciaInicialDelPlan({
        ...personal,
        periodicidadesPermitidas: ['mensual'],
      }),
    ).toBe('mensual');
  });

  it('bloquea frecuencias fuera de la lista del plan', () => {
    expect(planPermiteFrecuencia(personal, 'semanal')).toBe(true);
    expect(planPermiteFrecuencia(personal, 'mensual')).toBe(false);
    expect(periodicidadesDe(personal)).toEqual(['semanal', 'quincenal']);
  });

  it('sugiere 115000 semanal / 230000 quincenal y NO usa 160000 ni 180000 globales', () => {
    expect(cuotaSugeridaDelPlan(personal, 'semanal')).toBe(115000);
    expect(cuotaSugeridaDelPlan(personal, 'quincenal')).toBe(230000);
    expect(cuotaSugeridaDelPlan(propietario, 'semanal')).toBe(0);
  });
});
