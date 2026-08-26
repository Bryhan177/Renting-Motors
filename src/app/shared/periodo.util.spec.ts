import { calcularEstadoCobro } from './periodo.util';

describe('calcularEstadoCobro', () => {
  it('pendiente si no hay pagos', () => {
    expect(calcularEstadoCobro(180000, 0)).toBe('pendiente');
  });

  it('parcial si abonó menos que lo esperado', () => {
    expect(calcularEstadoCobro(180000, 50000)).toBe('parcial');
  });

  it('pagado si cubrió el monto esperado', () => {
    expect(calcularEstadoCobro(180000, 180000)).toBe('pagado');
    expect(calcularEstadoCobro(180000, 200000)).toBe('pagado');
  });
});
