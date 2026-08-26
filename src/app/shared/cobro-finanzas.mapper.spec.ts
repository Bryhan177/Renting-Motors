import {
  estadoCuentaDesdeCobros,
  mapCobroFromRow,
  mapEstadoCuentaFromRow,
  mapResumenFromRow,
  resumenDesdeCobros,
} from '../shared/cobro-finanzas.mapper';

describe('mapCobroFromRow', () => {
  const base = {
    id: 'c1',
    contrato_id: 'ct1',
    conductor_id: 'u1',
    moto_id: 'm1',
    numero_periodo: 3,
    periodo_inicio: '2026-08-10',
    periodo_fin: '2026-08-16',
    fecha_vencimiento: '2026-08-10',
    monto_esperado: 180000,
    monto_pagado: 50000,
    saldo: 130000,
    estado: 'parcial',
  };

  it('lee en_mora, saldo y pagado del backend y no los recalcula', () => {
    const cobro = mapCobroFromRow({
      ...base,
      fecha_vencimiento: '2000-01-01',
      saldo: 180000,
      estado: 'pendiente',
      en_mora: false,
    });
    expect(cobro.enMora).toBe(false);
    expect(cobro.saldo).toBe(180000);
    expect(cobro.montoPagado).toBe(50000);
  });

  it('respeta en_mora true aunque el vencimiento sea futuro en el payload', () => {
    const cobro = mapCobroFromRow({
      ...base,
      fecha_vencimiento: '2099-01-01',
      en_mora: true,
    });
    expect(cobro.enMora).toBe(true);
  });
});

describe('mapEstadoCuentaFromRow', () => {
  it('mapea el JSON del RPC de Postgres', () => {
    const estado = mapEstadoCuentaFromRow({
      deuda_total: 360000,
      deuda_en_mora: 180000,
      periodos_vencidos: 1,
      en_mora: true,
      fecha_mora_mas_antigua: '2026-08-01',
    });
    expect(estado.deudaTotal).toBe(360000);
    expect(estado.deudaEnMora).toBe(180000);
    expect(estado.periodosVencidos).toBe(1);
    expect(estado.enMora).toBe(true);
    expect(estado.fechaMoraMasAntigua?.getFullYear()).toBe(2026);
    expect(estado.fechaMoraMasAntigua?.getMonth()).toBe(7);
    expect(estado.fechaMoraMasAntigua?.getDate()).toBe(1);
  });
});

describe('mapResumenFromRow', () => {
  it('mapea pagado, pendiente y mora del RPC', () => {
    expect(
      mapResumenFromRow({
        pagado_total: 100,
        pendiente_total: 200,
        en_mora_total: 50,
      }),
    ).toEqual({ pagadoTotal: 100, pendienteTotal: 200, enMoraTotal: 50 });
  });
});

describe('agregados desde cobros ya leídos', () => {
  const cobros = [
    {
      contratoId: 'a',
      conductorId: 'u',
      motoId: 'm',
      numeroPeriodo: 1,
      periodoInicio: '2026-08-01',
      periodoFin: '2026-08-07',
      fechaVencimiento: '2026-08-01',
      montoEsperado: 180000,
      montoPagado: 0,
      saldo: 180000,
      estado: 'pendiente' as const,
      enMora: true,
    },
    {
      contratoId: 'a',
      conductorId: 'u',
      motoId: 'm',
      numeroPeriodo: 2,
      periodoInicio: '2026-08-08',
      periodoFin: '2026-08-14',
      fechaVencimiento: '2026-08-08',
      montoEsperado: 180000,
      montoPagado: 180000,
      saldo: 0,
      estado: 'pagado' as const,
      enMora: false,
    },
  ];

  it('suma deuda y mora usando el flag que vino de la DB', () => {
    const estado = estadoCuentaDesdeCobros(cobros);
    expect(estado.deudaTotal).toBe(180000);
    expect(estado.deudaEnMora).toBe(180000);
    expect(estado.periodosVencidos).toBe(1);
    expect(estado.enMora).toBe(true);
  });

  it('arma el resumen sin recalcular mora', () => {
    expect(resumenDesdeCobros(cobros)).toEqual({
      pagadoTotal: 180000,
      pendienteTotal: 180000,
      enMoraTotal: 180000,
    });
  });
});
