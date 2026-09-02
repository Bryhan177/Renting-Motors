export type BancoCaja = 'mdd' | 'ahorro_mdd';

export interface MovimientoCaja {
  _id?: string;
  banco: BancoCaja;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  fecha: string;
  descripcion?: string | null;
  motoId?: string | null;
  motoPlaca?: string | null;
}

export interface ResumenBanco {
  banco: BancoCaja;
  ingresos: number;
  egresos: number;
  saldo: number;
}

/** Tope solo de la tabla de Flujo de caja. El saldo NUNCA usa este límite. */
export const CAJA_LISTA_LIMIT = 200;

/**
 * Lista paginada: columnas de movimiento + placa de la moto.
 * Nunca `motos:moto_id(*)` (evita arrastrar imagen / columnas gordas).
 */
export const CAJA_LISTA_SELECT =
  'id, banco, tipo, monto, fecha, descripcion, moto_id, estado, motos:moto_id(placa)';

/** Agregado de saldo: 3 columnas, sin join, sin tope. */
export const CAJA_RESUMEN_SELECT = 'banco, tipo, monto';

export const BANCOS_CAJA: BancoCaja[] = ['mdd', 'ahorro_mdd'];

export function montoCaja(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Suma ingresos/egresos de TODAS las filas dadas (sin recortar).
 * Quien llama debe haber excluido anulados en SQL.
 */
export function resumenDesdeFilas(
  movs: Array<Pick<MovimientoCaja, 'banco' | 'tipo' | 'monto'> | { banco?: string; tipo?: string; monto?: unknown }>,
): ResumenBanco[] {
  return BANCOS_CAJA.map((banco) => {
    const subset = (movs || []).filter((m) => m.banco === banco);
    const ingresos = subset
      .filter((m) => m.tipo === 'ingreso')
      .reduce((s, m) => s + montoCaja(m.monto), 0);
    const egresos = subset
      .filter((m) => m.tipo === 'egreso')
      .reduce((s, m) => s + montoCaja(m.monto), 0);
    return { banco, ingresos, egresos, saldo: ingresos - egresos };
  });
}

/** RPC `resumen_caja` → array de 2 bancos. null si el payload no sirve (fallback a SELECT). */
export function mapResumenCajaFromRpc(data: unknown): ResumenBanco[] | null {
  let rows: unknown = data;
  if (typeof data === 'string') {
    try {
      rows = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(rows) || !rows.length) return null;
  const byBanco = new Map<string, ResumenBanco>();
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const banco = row['banco'];
    if (banco !== 'mdd' && banco !== 'ahorro_mdd') continue;
    const ingresos = montoCaja(row['ingresos']);
    const egresos = montoCaja(row['egresos']);
    const saldoRaw = row['saldo'];
    byBanco.set(banco, {
      banco,
      ingresos,
      egresos,
      saldo: saldoRaw == null ? ingresos - egresos : montoCaja(saldoRaw),
    });
  }
  if (!byBanco.size) return null;
  return BANCOS_CAJA.map(
    (banco) => byBanco.get(banco) || { banco, ingresos: 0, egresos: 0, saldo: 0 },
  );
}
