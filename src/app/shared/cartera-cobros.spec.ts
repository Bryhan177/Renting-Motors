import { Cobro } from '../service/cobros.service';
import { Contrato } from '../service/contratos.service';
import { cobroPeriodoVigente } from './periodo.util';
import {
  agruparCarteraPorConductor,
  construirCarteraCobros,
  filtrarCarteraPorConductor,
  opcionesConductorCartera,
} from './cartera-cobros';

function cobro(partial: Partial<Cobro> & Pick<Cobro, 'numeroPeriodo' | 'saldo'>): Cobro {
  return {
    _id: partial._id || `c${partial.numeroPeriodo}`,
    contratoId: partial.contratoId || 'ct1',
    conductorId: partial.conductorId || 'u1',
    motoId: partial.motoId || 'm1',
    numeroPeriodo: partial.numeroPeriodo,
    periodoInicio: partial.periodoInicio || '2026-08-01',
    periodoFin: partial.periodoFin || '2026-08-07',
    fechaVencimiento: partial.fechaVencimiento || '2026-08-01',
    montoEsperado: partial.montoEsperado ?? 180000,
    montoPagado: partial.montoPagado ?? 0,
    saldo: partial.saldo,
    estado: partial.estado || 'pendiente',
    enMora: partial.enMora ?? false,
    conductor: partial.conductor,
  };
}

const contratoJuan: Contrato = {
  _id: 'ct1',
  conductorId: 'u1',
  motoId: { _id: 'm1', marca: 'Bajaj', modelo: 'Pulsar', placa: 'ABC123', precio: 0, estado: 'en_uso' },
  fechaInicio: '2026-08-03',
  cuotaSemanal: 180000,
  depositoPactado: 0,
  frecuenciaPago: 'semanal',
  estado: 'activo',
};

const juan = {
  _id: 'u1',
  nombre: 'Juan',
  apellido: 'Pérez',
  email: 'j@x.com',
  cedula: 1,
  telefono: '1',
  rol: 'empleado' as const,
  activo: true,
};

const maria = {
  _id: 'u2',
  nombre: 'María',
  apellido: 'López',
  email: 'm@x.com',
  cedula: 2,
  telefono: '2',
  rol: 'empleado' as const,
  activo: true,
};

describe('construirCarteraCobros', () => {
  it('staff ve todos los periodos con saldo del conductor, no solo el vigente', () => {
    const cobros: Cobro[] = [
      cobro({
        _id: 'mora-vieja',
        numeroPeriodo: 1,
        saldo: 180000,
        estado: 'pendiente',
        enMora: true,
        fechaVencimiento: '2026-08-03',
        conductor: juan,
      }),
      cobro({
        _id: 'parcial',
        numeroPeriodo: 2,
        saldo: 90000,
        estado: 'parcial',
        enMora: true,
        fechaVencimiento: '2026-08-10',
        montoPagado: 90000,
        conductor: juan,
      }),
      cobro({
        _id: 'pagado',
        numeroPeriodo: 3,
        saldo: 0,
        estado: 'pagado',
        conductor: juan,
      }),
      cobro({
        _id: 'anulado',
        numeroPeriodo: 4,
        saldo: 180000,
        estado: 'anulado',
        conductor: juan,
      }),
      cobro({
        _id: 'vigente',
        numeroPeriodo: 5,
        saldo: 180000,
        estado: 'pendiente',
        enMora: false,
        fechaVencimiento: '2026-08-31',
        conductor: juan,
      }),
    ];

    const vigente = cobroPeriodoVigente(
      cobros,
      'ct1',
      contratoJuan.fechaInicio,
      'semanal',
      new Date(2026, 7, 31),
    );
    expect(vigente?._id).toBe('vigente');

    const cartera = construirCarteraCobros(cobros, [contratoJuan]);
    expect(cartera.map((i) => i.cobro._id).sort()).toEqual(['mora-vieja', 'parcial', 'vigente']);
    expect(cartera).toHaveLength(3);
    expect(cartera.every((i) => i.conductorNombre === 'Juan Pérez')).toBe(true);
  });

  it('agrupa varios periodos pendientes por conductor', () => {
    const cobros: Cobro[] = [
      cobro({
        numeroPeriodo: 1,
        saldo: 180000,
        enMora: true,
        conductor: juan,
        fechaVencimiento: '2026-08-03',
      }),
      cobro({
        numeroPeriodo: 2,
        saldo: 180000,
        conductor: juan,
        fechaVencimiento: '2026-08-10',
      }),
      cobro({
        _id: 'c-m',
        contratoId: 'ct2',
        conductorId: 'u2',
        numeroPeriodo: 1,
        saldo: 100000,
        conductor: maria,
        fechaVencimiento: '2026-08-20',
      }),
    ];
    const grupos = agruparCarteraPorConductor(construirCarteraCobros(cobros, [contratoJuan]));
    expect(grupos).toHaveLength(2);
    const grupoJuan = grupos.find((g) => g.conductorId === 'u1');
    expect(grupoJuan?.items).toHaveLength(2);
    expect(grupoJuan?.saldoTotal).toBe(360000);
    expect(grupoJuan?.periodosMora).toBe(1);
  });

  it('filtrar por conductor deja solo sus periodos con saldo', () => {
    const cobros: Cobro[] = [
      cobro({ numeroPeriodo: 1, saldo: 1, conductor: juan }),
      cobro({
        _id: 'c-m',
        contratoId: 'ct2',
        conductorId: 'u2',
        numeroPeriodo: 1,
        saldo: 2,
        conductor: maria,
      }),
    ];
    const items = construirCarteraCobros(cobros, [contratoJuan]);
    const soloJuan = filtrarCarteraPorConductor(items, 'u1', '');
    expect(soloJuan).toHaveLength(1);
    expect(soloJuan[0].conductorNombre).toBe('Juan Pérez');
    const porNombre = filtrarCarteraPorConductor(items, '', 'maría');
    expect(porNombre).toHaveLength(1);
    expect(opcionesConductorCartera(items).map((o) => o.conductorId).sort()).toEqual(['u1', 'u2']);
  });
});
