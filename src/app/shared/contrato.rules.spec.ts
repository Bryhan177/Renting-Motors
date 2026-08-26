import {
  addCalendarMonths,
  cuotaSugeridaPorFrecuencia,
  cuotaTrasCambioFrecuencia,
  duracionMinimaValida,
  etiquetaMoto,
  fechaFinMinima,
  idDeRelacion,
  labelFrecuencia,
  mensajeErrorContrato,
  nombreConductor,
} from './contrato.rules';
import { CUOTAS_ESTANDAR, CUOTA_SEMANAL_ESTANDAR } from './constants';
import { parseDateOnly } from './periodo.util';

describe('contrato.rules', () => {
  describe('addCalendarMonths / fechaFinMinima', () => {
    it('suma 3 meses de calendario (15 ene → 15 abr)', () => {
      expect(fechaFinMinima('2026-01-15')).toBe('2026-04-15');
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

  it('cuota sugerida usa CUOTAS_ESTANDAR (160000 / 320000 / 640000)', () => {
    expect(CUOTA_SEMANAL_ESTANDAR).toBe(160000);
    expect(CUOTAS_ESTANDAR).toEqual({ semanal: 160000, quincenal: 320000, mensual: 640000 });
    expect(cuotaSugeridaPorFrecuencia('semanal')).toBe(CUOTAS_ESTANDAR.semanal);
    expect(cuotaSugeridaPorFrecuencia('quincenal')).toBe(CUOTAS_ESTANDAR.quincenal);
    expect(cuotaSugeridaPorFrecuencia('mensual')).toBe(CUOTAS_ESTANDAR.mensual);
  });

  it('al cambiar frecuencia sigue 160/320/640 salvo cuota personalizada', () => {
    expect(cuotaTrasCambioFrecuencia(160000, 'quincenal')).toBe(320000);
    expect(cuotaTrasCambioFrecuencia(320000, 'mensual')).toBe(640000);
    expect(cuotaTrasCambioFrecuencia(640000, 'semanal')).toBe(160000);
    expect(cuotaTrasCambioFrecuencia(200000, 'quincenal')).toBe(200000);
    expect(cuotaTrasCambioFrecuencia(180000, 'mensual')).toBe(180000);
  });
});
