import {
  addCalendarMonths,
  cuotaSugeridaPorFrecuencia,
  duracionMinimaValida,
  etiquetaMoto,
  fechaFinMinima,
  idDeRelacion,
  labelFrecuencia,
  mensajeErrorContrato,
  nombreConductor,
} from './contrato.rules';
import { parseDateOnly } from './periodo.util';

describe('contrato.rules', () => {
  describe('addCalendarMonths / fechaFinMinima', () => {
    it('respeta duración del plan si es mayor a 3 meses (15 ene + 6 = 15 jul)', () => {
      expect(fechaFinMinima('2026-01-15', 6)).toBe('2026-07-15');
    });

    it('ajusta fin de mes como Postgres interval 3 months (31 ene → 30 abr)', () => {
      const d = addCalendarMonths(parseDateOnly('2026-01-31'), 3);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(3);
      expect(d.getDate()).toBe(30);
      expect(fechaFinMinima('2026-01-31')).toBe('2026-04-30');
    });
  });

  describe('duracionMinimaValida', () => {
    it('acepta exactamente 3 meses', () => {
      expect(duracionMinimaValida('2026-05-01', '2026-08-01')).toBe(true);
    });

    it('rechaza menos de 3 meses', () => {
      expect(duracionMinimaValida('2026-05-01', '2026-07-15')).toBe(false);
      expect(duracionMinimaValida('2026-05-01', '2026-05-01')).toBe(false);
    });

    it('acepta más de 3 meses', () => {
      expect(duracionMinimaValida('2026-05-01', '2027-05-01')).toBe(true);
    });
  });

  describe('mensajeErrorContrato', () => {
    it('traduce unique conductor', () => {
      expect(
        mensajeErrorContrato({
          code: '23505',
          message: 'duplicate key value violates unique constraint "contratos_un_activo_conductor"',
          details: 'Key (conductor_id)=(abc) already exists.',
        }),
      ).toBe('Ese conductor ya tiene un contrato activo.');
    });

    it('traduce unique moto', () => {
      expect(
        mensajeErrorContrato({
          code: '23505',
          message: 'duplicate key value violates unique constraint "contratos_un_activo_moto"',
          details: 'Key (moto_id)=(xyz) already exists.',
        }),
      ).toBe('Esa moto ya tiene un contrato activo.');
    });

    it('traduce check de duración', () => {
      expect(
        mensajeErrorContrato({
          code: '23514',
          message: 'La duración mínima del contrato es 3 meses (fecha_fin >= fecha_inicio + 3 months)',
        }),
      ).toBe('La duración mínima del contrato es 3 meses.');
    });
  });

  it('nombres y etiquetas leen objetos anidados', () => {
    expect(nombreConductor({ nombre: 'Ana', apellido: 'López' } as any)).toBe('Ana López');
    expect(etiquetaMoto({ placa: 'ABC12', marca: 'AKT', modelo: 'NKD 125' } as any)).toBe(
      'ABC12 · AKT NKD 125',
    );
    expect(idDeRelacion({ _id: 'u1' })).toBe('u1');
    expect(labelFrecuencia('quincenal')).toBe('Quincenal');
  });

  it('cuota sugerida escala el valor del plan; no hay tarifa global 160/180', () => {
    expect(cuotaSugeridaPorFrecuencia('semanal', 115000)).toBe(115000);
    expect(cuotaSugeridaPorFrecuencia('quincenal', 115000)).toBe(230000);
    expect(cuotaSugeridaPorFrecuencia('mensual', 180000)).toBe(720000);
    expect(cuotaSugeridaPorFrecuencia('semanal', 0)).toBe(0);
  });
});
