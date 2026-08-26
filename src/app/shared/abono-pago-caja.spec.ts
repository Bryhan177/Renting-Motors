import {
  accionAbonoPagoCaja,
  filaFinancieraVisible,
  payloadCajaDesdeAbono,
  payloadPagoDesdeAbono,
  type AbonoPagoCajaInput,
} from './abono-pago-caja';

const abono: AbonoPagoCajaInput = {
  id: 'ab1',
  estado: 'registrado',
  monto: 180000,
  fechaPago: '2026-08-26T15:00:00.000Z',
  metodoPago: 'Transferencia',
  observaciones: 'Comprobante Nequi',
  conductorId: 'u1',
  cobroId: 'c1',
  motoId: 'm1',
  motoPlaca: 'ABC123',
  confirmadoPor: 'admin1',
  responsableId: 'u1',
  comprobante: 'https://img/comp.jpg',
};

describe('accionAbonoPagoCaja', () => {
  it('conductor reporta pendiente_confirmacion → no crea pago ni caja', () => {
    expect(
      accionAbonoPagoCaja({
        estadoNuevo: 'pendiente_confirmacion',
        esInsert: true,
      }),
    ).toBe('noop');
  });

  it('staff aprueba (pendiente → registrado) → crear pago + ingreso caja', () => {
    expect(
      accionAbonoPagoCaja({
        estadoNuevo: 'registrado',
        estadoAnterior: 'pendiente_confirmacion',
        esInsert: false,
      }),
    ).toBe('crear');
  });

  it('staff registra abono directo (insert registrado) → crear', () => {
    expect(
      accionAbonoPagoCaja({
        estadoNuevo: 'registrado',
        esInsert: true,
      }),
    ).toBe('crear');
  });

  it('ya registrado y se toca de nuevo → no duplica', () => {
    expect(
      accionAbonoPagoCaja({
        estadoNuevo: 'registrado',
        estadoAnterior: 'registrado',
        esInsert: false,
      }),
    ).toBe('noop');
  });

  it('rechazo de pendiente (anulado sin haber sido registrado) → no toca pagos/caja', () => {
    expect(
      accionAbonoPagoCaja({
        estadoNuevo: 'anulado',
        estadoAnterior: 'pendiente_confirmacion',
        esInsert: false,
      }),
    ).toBe('noop');
  });

  it('anular un abono ya registrado → marca anulado, no borra', () => {
    expect(
      accionAbonoPagoCaja({
        estadoNuevo: 'anulado',
        estadoAnterior: 'registrado',
        esInsert: false,
      }),
    ).toBe('anular');
  });
});

describe('payloadPagoDesdeAbono / payloadCajaDesdeAbono', () => {
  it('el pago usa el monto del abono (no reescribe cuota_semanal ni cobro.monto_esperado)', () => {
    const pago = payloadPagoDesdeAbono(abono);
    expect(pago.abono_id).toBe('ab1');
    expect(pago.monto).toBe(180000);
    expect(pago.valor_pagado).toBe(180000);
    expect(pago.gastos).toBe(0);
    expect(pago.estado).toBe('registrado');
    expect(pago.pagado).toBe(true);
    expect(pago.moto_id).toBe('m1');
    expect(pago.conductor_id).toBe('u1');
    expect(pago.registrado_por).toBe('admin1');
    expect(pago.comprobante_imagen).toBe('https://img/comp.jpg');
  });

  it('caja es ingreso MDD ligado al abono, visible en Flujo de caja', () => {
    const caja = payloadCajaDesdeAbono(abono);
    expect(caja.banco).toBe('mdd');
    expect(caja.tipo).toBe('ingreso');
    expect(caja.monto).toBe(180000);
    expect(caja.abono_id).toBe('ab1');
    expect(caja.estado).toBe('registrado');
    expect(caja.fecha).toBe('2026-08-26');
    expect(caja.descripcion).toContain('ABC123');
    expect(caja.descripcion).toContain('Abono cuota');
  });
});

describe('filaFinancieraVisible', () => {
  it('filas anuladas no se listan; null (legacy) sí', () => {
    expect(filaFinancieraVisible('anulado')).toBe(false);
    expect(filaFinancieraVisible('registrado')).toBe(true);
    expect(filaFinancieraVisible(null)).toBe(true);
  });
});
