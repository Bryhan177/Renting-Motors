import {
  NOMBRE_EMPRESA_PRODUCCION,
  NOMBRE_EMPRESA_PRUEBAS,
  aplicarFiltroEmpresa,
  mapEmpresaIdFromRow,
  mismaEmpresa,
  normalizarEmpresaId,
  stripClienteEmpresaId,
} from './empresa-scope';

const PROD = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PRUEBAS = 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb';

describe('empresa-scope (membership / RLS helpers)', () => {
  it('nombres de las dos empresas sembradas (sin selector en UI)', () => {
    expect(NOMBRE_EMPRESA_PRODUCCION).toBe('GoRenting');
    expect(NOMBRE_EMPRESA_PRUEBAS).toBe('GoRenting Pruebas');
    expect(NOMBRE_EMPRESA_PRODUCCION).not.toBe(NOMBRE_EMPRESA_PRUEBAS);
  });

  it('normalizarEmpresaId acepta UUID v4 y rechaza basura', () => {
    expect(normalizarEmpresaId(PROD)).toBe(PROD);
    expect(normalizarEmpresaId(` ${PROD.toUpperCase()} `)).toBe(PROD);
    expect(normalizarEmpresaId('')).toBeNull();
    expect(normalizarEmpresaId('no-uuid')).toBeNull();
    expect(normalizarEmpresaId('123')).toBeNull();
  });

  it('mapEmpresaIdFromRow lee snake_case de Postgres y camelCase', () => {
    expect(mapEmpresaIdFromRow({ empresa_id: PROD })).toBe(PROD);
    expect(mapEmpresaIdFromRow({ empresaId: PRUEBAS })).toBe(PRUEBAS);
    expect(mapEmpresaIdFromRow({ empresa_id: 'otro-tenant' })).toBeNull();
    expect(mapEmpresaIdFromRow(null)).toBeNull();
    expect(mapEmpresaIdFromRow({})).toBeNull();
  });

  it('aplicarFiltroEmpresa usa solo la membresía del perfil, nunca un id inventado', () => {
    const calls: Array<[string, string]> = [];
    const query = {
      eq(column: string, value: string) {
        calls.push([column, value]);
        return query;
      },
    };

    expect(aplicarFiltroEmpresa(query, null)).toBe(query);
    expect(calls).toEqual([]);

    aplicarFiltroEmpresa(query, 'not-a-uuid');
    expect(calls).toEqual([]);

    aplicarFiltroEmpresa(query, PROD);
    expect(calls).toEqual([['empresa_id', PROD]]);
  });

  it('stripClienteEmpresaId ignora un empresa_id que el cliente intente mandar', () => {
    const payload = stripClienteEmpresaId({
      nombre: 'Personal',
      empresa_id: PROD,
      empresaId: PRUEBAS,
      valor_sugerido: 1,
    });
    expect(payload.nombre).toBe('Personal');
    expect(payload['valor_sugerido']).toBe(1);
    expect(payload).not.toHaveProperty('empresa_id');
    expect(payload).not.toHaveProperty('empresaId');
  });

  it('mismaEmpresa: staff de pruebas no coincide con filas de producción', () => {
    expect(mismaEmpresa(PROD, PROD)).toBe(true);
    expect(mismaEmpresa(PRUEBAS, PRUEBAS)).toBe(true);
    expect(mismaEmpresa(PROD, PRUEBAS)).toBe(false);
    expect(mismaEmpresa(PRUEBAS, PROD)).toBe(false);
    expect(mismaEmpresa(null, PROD)).toBe(false);
    expect(mismaEmpresa(PROD, undefined)).toBe(false);
  });
});
