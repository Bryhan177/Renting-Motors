import { CajaService } from '../service/caja.service';
import {
  BANCOS_CAJA,
  BANCOS_CAJA_SELECT,
  CAJA_LISTA_LIMIT,
  CAJA_LISTA_SELECT,
  CAJA_RESUMEN_SELECT,
  codigoBancoUnico,
  esTablaBancosAusente,
  mapResumenCajaFromRpc,
  nombreBanco,
  resumenDesdeFilas,
  rpcOmiteCatalogo,
  slugBanco,
} from './caja-resumen';

describe('resumen de caja (todas las filas, no las últimas 200)', () => {
  it('el tope 200 es solo de la tabla; el select de saldo no lo usa', () => {
    expect(CAJA_LISTA_LIMIT).toBe(200);
    expect(CAJA_RESUMEN_SELECT).toBe('banco, tipo, monto');
    expect(CAJA_RESUMEN_SELECT).not.toMatch(/limit/i);
    expect(CAJA_LISTA_SELECT).toMatch(/motos:moto_id\(placa\)/);
    expect(CAJA_LISTA_SELECT).not.toMatch(/\*/);
    expect(CAJA_LISTA_SELECT).not.toMatch(/motos:moto_id\(\*\)/);
    expect(CAJA_LISTA_SELECT).not.toMatch(/imagen/);
    expect(BANCOS_CAJA_SELECT).toMatch(/codigo/);
    expect(BANCOS_CAJA_SELECT).toMatch(/nombre/);
    expect(BANCOS_CAJA_SELECT).not.toMatch(/\*/);
  });

  it('resumenDesdeFilas suma más de 200 filas (el bug de list().limit(200))', () => {
    const filas = Array.from({ length: 250 }, () => ({
      banco: 'mdd' as const,
      tipo: 'ingreso' as const,
      monto: 1000,
    }));
    filas.push({ banco: 'mdd', tipo: 'egreso', monto: 500 });
    const r = resumenDesdeFilas(filas);
    const mdd = r.find((x) => x.banco === 'mdd')!;
    expect(mdd.ingresos).toBe(250_000);
    expect(mdd.egresos).toBe(500);
    expect(mdd.saldo).toBe(249_500);
    expect(mdd.ingresos).not.toBe(200_000);
  });

  it('separa MDD y Ahorro MDD y deja en 0 el banco vacío', () => {
    const r = resumenDesdeFilas([
      { banco: 'ahorro_mdd', tipo: 'ingreso', monto: 1_116_324 },
      { banco: 'mdd', tipo: 'ingreso', monto: 700_000 },
      { banco: 'mdd', tipo: 'egreso', monto: 47_811 },
    ]);
    expect(BANCOS_CAJA).toEqual(['mdd', 'ahorro_mdd']);
    expect(r.find((x) => x.banco === 'mdd')).toEqual({
      banco: 'mdd',
      ingresos: 700_000,
      egresos: 47_811,
      saldo: 652_189,
    });
    expect(r.find((x) => x.banco === 'ahorro_mdd')?.saldo).toBe(1_116_324);
  });

  it('incluye un banco nuevo del catálogo o de las filas', () => {
    const r = resumenDesdeFilas(
      [{ banco: 'deposito_dan78d', tipo: 'ingreso', monto: 80_000 }],
      ['mdd', 'ahorro_mdd', 'deposito_dan78d'],
    );
    expect(r.find((x) => x.banco === 'deposito_dan78d')).toEqual({
      banco: 'deposito_dan78d',
      ingresos: 80_000,
      egresos: 0,
      saldo: 80_000,
    });
    expect(r.find((x) => x.banco === 'mdd')?.saldo).toBe(0);
  });

  it('CajaService.resumen no delega en list() (evita el tope)', () => {
    const resumenSrc = CajaService.prototype.resumen.toString();
    const listSrc = CajaService.prototype.list.toString();
    expect(resumenSrc).not.toMatch(/this\.list\s*\(/);
    expect(resumenSrc).toMatch(/resumen_caja|resumenPorAgregado|CAJA_RESUMEN_SELECT/);
    expect(listSrc).toMatch(/CAJA_LISTA_LIMIT/);
  });

  it('mapea el JSON del RPC resumen_caja', () => {
    const r = mapResumenCajaFromRpc([
      { banco: 'mdd', ingresos: 652189, egresos: 0, saldo: 652189 },
      { banco: 'ahorro_mdd', ingresos: 1116324, egresos: 0, saldo: 1116324 },
    ]);
    expect(r?.find((x) => x.banco === 'mdd')?.saldo).toBe(652189);
    expect(r?.find((x) => x.banco === 'ahorro_mdd')?.saldo).toBe(1116324);
    expect(mapResumenCajaFromRpc(null)).toBeNull();
    expect(mapResumenCajaFromRpc([])).toBeNull();
  });

  it('mapea un banco extra del RPC y detecta catálogo omitido', () => {
    const r = mapResumenCajaFromRpc(
      [
        { banco: 'mdd', ingresos: 1, egresos: 0, saldo: 1 },
        { banco: 'deposito_dan78d', ingresos: 50, egresos: 10, saldo: 40 },
      ],
      ['mdd', 'ahorro_mdd', 'deposito_dan78d'],
    );
    expect(r?.find((x) => x.banco === 'deposito_dan78d')?.saldo).toBe(40);
    expect(r?.find((x) => x.banco === 'ahorro_mdd')?.saldo).toBe(0);
    expect(
      rpcOmiteCatalogo(
        [{ banco: 'mdd', ingresos: 1, egresos: 0, saldo: 1 }],
        ['mdd', 'ahorro_mdd', 'deposito_dan78d'],
      ),
    ).toBe(true);
    expect(
      rpcOmiteCatalogo(
        [
          { banco: 'mdd', ingresos: 1, egresos: 0, saldo: 1 },
          { banco: 'ahorro_mdd', ingresos: 0, egresos: 0, saldo: 0 },
        ],
        ['mdd', 'ahorro_mdd'],
      ),
    ).toBe(false);
  });
});

describe('catálogo de bancos', () => {
  it('slug de Deposito DAN78D y colisión de codigo', () => {
    expect(slugBanco('Deposito DAN78D')).toBe('deposito_dan78d');
    expect(codigoBancoUnico('Deposito DAN78D', ['deposito_dan78d'])).toBe('deposito_dan78d_2');
    expect(nombreBanco('mdd')).toBe('Banco MDD');
    expect(
      nombreBanco('mdd', [{ id: '1', codigo: 'mdd', nombre: 'Banco Principal' }]),
    ).toBe('Banco Principal');
  });

  it('detecta tabla bancos_caja ausente', () => {
    expect(esTablaBancosAusente({ code: 'PGRST205', message: "Could not find the table 'public.bancos_caja' in the schema cache" })).toBe(true);
    expect(esTablaBancosAusente({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});
