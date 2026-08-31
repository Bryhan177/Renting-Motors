import { splitIngresosDashboard } from './dashboard-ingresos-fuente';

describe('splitIngresosDashboard', () => {
  const rango = { desde: '2026-08-01', hasta: '2026-08-31' };

  it('cuota registrada cuenta; pendiente_confirmacion no', () => {
    const r = splitIngresosDashboard({
      ...rango,
      abonos: [
        { monto: 180000, fecha: '2026-08-10', estado: 'registrado' },
        { monto: 180000, fecha: '2026-08-11', estado: 'pendiente_confirmacion' },
      ],
      caja: [],
    });
    expect(r.ingresosCuotas).toBe(180000);
    expect(r.ingresosPeriodo).toBe(180000);
    expect(r.cantidadAbonos).toBe(1);
  });

  it('caja con abono_id no se suma otra vez (trigger 20260831)', () => {
    const r = splitIngresosDashboard({
      ...rango,
      abonos: [{ monto: 180000, fecha: '2026-08-10', estado: 'registrado' }],
      caja: [
        {
          monto: 180000,
          fecha: '2026-08-10',
          tipo: 'ingreso',
          estado: 'registrado',
          abonoId: 'ab1',
        },
      ],
    });
    expect(r.ingresosPeriodo).toBe(180000);
    expect(r.ingresosOtros).toBe(0);
  });

  it('alquiler puntual / registrarManual (caja sin abono) entra en ingresos', () => {
    const r = splitIngresosDashboard({
      ...rango,
      abonos: [],
      caja: [
        { monto: 30000, fecha: '2026-08-05', tipo: 'ingreso', abonoId: null },
        { monto: 30000, fecha: '2026-08-12', tipo: 'ingreso', abonoId: null },
      ],
    });
    expect(r.ingresosOtros).toBe(60000);
    expect(r.ingresosPeriodo).toBe(60000);
    expect(r.cantidadOtros).toBe(2);
    expect(r.egresosPeriodo).toBe(0);
  });

  it('egreso de caja cuenta solo en egresos, no en ingresos', () => {
    const r = splitIngresosDashboard({
      ...rango,
      abonos: [{ monto: 180000, fecha: '2026-08-10', estado: 'registrado' }],
      caja: [
        { monto: 50000, fecha: '2026-08-15', tipo: 'egreso', estado: 'registrado' },
        { monto: 30000, fecha: '2026-08-16', tipo: 'ingreso', abonoId: null },
      ],
    });
    expect(r.ingresosPeriodo).toBe(210000);
    expect(r.egresosPeriodo).toBe(50000);
    expect(r.cantidadEgresos).toBe(1);
  });

  it('caja anulada y fechas fuera de rango no cuentan', () => {
    const r = splitIngresosDashboard({
      ...rango,
      abonos: [{ monto: 1, fecha: '2026-07-31', estado: 'registrado' }],
      caja: [
        { monto: 30000, fecha: '2026-08-05', tipo: 'ingreso', estado: 'anulado', abonoId: null },
        { monto: 9000, fecha: '2026-09-01', tipo: 'egreso' },
      ],
    });
    expect(r.ingresosPeriodo).toBe(0);
    expect(r.egresosPeriodo).toBe(0);
  });
});
