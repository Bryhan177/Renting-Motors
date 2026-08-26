import {
  alturaBarra,
  emptyResumenDashboard,
  etiquetaMes,
  etiquetaPeriodo,
  ingresosMensualesVisibles,
  mapResumenDashboardFromRow,
  nombrePlan,
  normalizarPeriodo,
  porcentajeDisponibles,
  toNonNegNumber,
  variacionPorcentual,
} from './dashboard-kpis';

describe('mapResumenDashboardFromRow', () => {
  it('DB vacía / null / string inválida → ceros, nunca cifras de ejemplo', () => {
    for (const raw of [null, undefined, '', 'no-json', [], 0, { foo: 1 }]) {
      const k = mapResumenDashboardFromRow(raw);
      expect(k.ingresosPeriodo).toBe(0);
      expect(k.contratosActivos).toBe(0);
      expect(k.contratosNuevos).toBe(0);
      expect(k.conductoresActivos).toBe(0);
      expect(k.motosAlquiladas).toBe(0);
      expect(k.motosDisponibles).toBe(0);
      expect(k.cartera).toBe(0);
      expect(k.moraCantidad).toBe(0);
      expect(k.moraMonto).toBe(0);
      expect(k.crecimientoMensualPct).toBe(0);
      expect(k.planes).toEqual([]);
      expect(k.ingresosMensuales).toEqual([]);
      expect(k.ingresosPeriodo).not.toBe(180000);
      expect(k.ingresosPeriodo).not.toBe(160000);
    }
  });

  it('mapea el JSON snake_case del RPC resumen_dashboard', () => {
    const k = mapResumenDashboardFromRow({
      periodo: 'mes',
      periodo_desde: '2026-08-01',
      periodo_hasta: '2026-08-31',
      ingresos_periodo: 450000,
      cantidad_abonos_periodo: 3,
      contratos_activos: 2,
      contratos_nuevos: 1,
      conductores_activos: 2,
      motos_total: 5,
      motos_alquiladas: 2,
      motos_disponibles: 2,
      motos_en_mantenimiento: 1,
      motos_fuera_servicio: 0,
      cartera: 180000,
      mora_cantidad: 1,
      mora_monto: 180000,
      ingresos_mes_actual: 450000,
      ingresos_mes_anterior: 300000,
      planes: [
        { plan_nombre: 'Trabajo', contratos_activos: 1, ingresos: 300000 },
        { plan_nombre: null, contratos_activos: 1, ingresos: 150000 },
      ],
      ingresos_mensuales: [
        { key: '2026-07', monto: 300000, cantidad_abonos: 2 },
        { key: '2026-08', monto: 450000, cantidad_abonos: 3 },
      ],
    });
    expect(k.periodo).toBe('mes');
    expect(k.periodoDesde).toBe('2026-08-01');
    expect(k.ingresosPeriodo).toBe(450000);
    expect(k.cantidadAbonosPeriodo).toBe(3);
    expect(k.contratosActivos).toBe(2);
    expect(k.contratosNuevos).toBe(1);
    expect(k.conductoresActivos).toBe(2);
    expect(k.motosAlquiladas).toBe(2);
    expect(k.motosDisponibles).toBe(2);
    expect(k.cartera).toBe(180000);
    expect(k.moraCantidad).toBe(1);
    expect(k.moraMonto).toBe(180000);
    expect(k.crecimientoMensualPct).toBe(50);
    expect(k.planes.map((p) => p.planNombre)).toEqual(['Trabajo', 'Sin plan']);
    expect(k.planes[1].ingresos).toBe(150000);
    expect(k.ingresosMensuales).toHaveLength(2);
    expect(k.ingresosMensuales[1].monto).toBe(450000);
    expect(k.ingresosMensuales[1].cantidadAbonos).toBe(3);
  });

  it('parsea JSON string (PostgREST a veces entrega texto)', () => {
    const k = mapResumenDashboardFromRow(
      JSON.stringify({ ingresos_periodo: 25000, contratos_activos: 1 }),
    );
    expect(k.ingresosPeriodo).toBe(25000);
    expect(k.contratosActivos).toBe(1);
    expect(k.cartera).toBe(0);
  });

  it('números negativos o no numéricos se vuelven 0', () => {
    const k = mapResumenDashboardFromRow({
      ingresos_periodo: -10,
      cartera: 'abc',
      mora_cantidad: null,
    });
    expect(k.ingresosPeriodo).toBe(0);
    expect(k.cartera).toBe(0);
    expect(k.moraCantidad).toBe(0);
  });
});

describe('variacionPorcentual', () => {
  it('0 vs 0 → 0 (estado vacío, no null ni cifra inventada)', () => {
    expect(variacionPorcentual(0, 0)).toBe(0);
  });

  it('sin base el mes anterior y hay ingresos → 100', () => {
    expect(variacionPorcentual(200000, 0)).toBe(100);
  });

  it('redondea el % mes vs mes anterior', () => {
    expect(variacionPorcentual(450000, 300000)).toBe(50);
    expect(variacionPorcentual(200000, 400000)).toBe(-50);
  });
});

describe('nombrePlan / periodo', () => {
  it('plan_nombre null o vacío es Sin plan (snapshot histórico)', () => {
    expect(nombrePlan(null)).toBe('Sin plan');
    expect(nombrePlan('')).toBe('Sin plan');
    expect(nombrePlan('  ')).toBe('Sin plan');
    expect(nombrePlan('Personal')).toBe('Personal');
  });

  it('normaliza semana/mes/anio y aliases', () => {
    expect(normalizarPeriodo('semana')).toBe('semana');
    expect(normalizarPeriodo('year')).toBe('anio');
    expect(normalizarPeriodo('año')).toBe('anio');
    expect(normalizarPeriodo(undefined)).toBe('mes');
    expect(normalizarPeriodo('otro')).toBe('mes');
  });
});

describe('series y barras', () => {
  const series = [
    { key: '2026-01', label: 'ene 26', monto: 0, cantidadAbonos: 0 },
    { key: '2026-02', label: 'feb 26', monto: 100, cantidadAbonos: 1 },
    { key: '2026-03', label: 'mar 26', monto: 200, cantidadAbonos: 1 },
  ];

  it('recorta los últimos N meses sin re-agregar', () => {
    expect(ingresosMensualesVisibles(series, 12)).toHaveLength(3);
    expect(ingresosMensualesVisibles(series, 6).map((m) => m.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    const many = Array.from({ length: 12 }, (_, i) => ({
      key: `2026-${String(i + 1).padStart(2, '0')}`,
      label: '',
      monto: i,
      cantidadAbonos: 0,
    }));
    expect(ingresosMensualesVisibles(many, 6).map((m) => m.key)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });

  it('altura de barra es 0 si el máximo es 0 (DB vacía)', () => {
    expect(alturaBarra(0, 0)).toBe(0);
    expect(alturaBarra(50, 100)).toBe(50);
  });

  it('etiqueta mes en es-CO a partir de YYYY-MM', () => {
    expect(etiquetaMes('2026-08')).toMatch(/ago/i);
    expect(etiquetaMes('')).toBe('');
  });
});

describe('porcentajeDisponibles', () => {
  it('0 si no hay motos', () => {
    expect(porcentajeDisponibles(emptyResumenDashboard())).toBe(0);
  });

  it('usa estado disponible vs total (no inventa estados)', () => {
    const k = emptyResumenDashboard();
    k.motosTotal = 4;
    k.motosDisponibles = 1;
    k.motosAlquiladas = 2;
    expect(porcentajeDisponibles(k)).toBe(25);
  });
});

describe('etiquetaPeriodo', () => {
  it('mes usa fecha_inicio del rango (Bogota viene del RPC)', () => {
    expect(etiquetaPeriodo('mes', '2026-08-01', '2026-08-31')).toMatch(/agosto/i);
  });

  it('año usa el calendar year', () => {
    expect(etiquetaPeriodo('anio', '2026-01-01', '2026-12-31')).toBe('2026');
  });
});

describe('toNonNegNumber', () => {
  it('acepta numeric string de Postgres', () => {
    expect(toNonNegNumber('180000.00')).toBe(180000);
    expect(toNonNegNumber(undefined)).toBe(0);
  });
});
