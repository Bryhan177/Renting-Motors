export type BancoCaja = string;

export interface BancoCatalogo {
  id: string;
  codigo: BancoCaja;
  nombre: string;
  createdAt?: string;
  updatedAt?: string;
}

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

export const BANCOS_CAJA_SELECT = 'id, codigo, nombre, created_at, updated_at';

export const BANCOS_CAJA: BancoCaja[] = ['mdd', 'ahorro_mdd'];

export const NOMBRES_BANCO_LEGADO: Record<string, string> = {
  mdd: 'Banco MDD',
  ahorro_mdd: 'Ahorro MDD',
};

/** Si el SQL 20260910 aún no está, la UI sigue mostrando los dos bancos históricos. */
export const BANCOS_CAJA_FALLBACK: BancoCatalogo[] = BANCOS_CAJA.map((codigo) => ({
  id: codigo,
  codigo,
  nombre: NOMBRES_BANCO_LEGADO[codigo] || codigo,
}));

export function montoCaja(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function nombreBanco(codigo: string, catalogo: BancoCatalogo[] = []): string {
  const found = catalogo.find((b) => b.codigo === codigo);
  if (found?.nombre?.trim()) return found.nombre.trim();
  return NOMBRES_BANCO_LEGADO[codigo] || codigo;
}

export function slugBanco(nombre: string): string {
  const s = String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return s || 'banco';
}

export function codigoBancoUnico(nombre: string, ocupados: string[] = []): string {
  const base = slugBanco(nombre);
  const used = new Set(ocupados);
  if (!used.has(base)) return base;
  let n = 2;
  let candidate = `${base.slice(0, 36)}_${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${base.slice(0, 36)}_${n}`;
  }
  return candidate;
}

export function ordenarBancos(bancos: BancoCatalogo[]): BancoCatalogo[] {
  const peso = (c: string) => (c === 'mdd' ? 0 : c === 'ahorro_mdd' ? 1 : 2);
  return [...bancos].sort((a, b) => {
    const d = peso(a.codigo) - peso(b.codigo);
    if (d !== 0) return d;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}

export function mapBancoFromRow(row: any): BancoCatalogo {
  const codigo = String(row?.codigo || '').trim();
  return {
    id: String(row?.id || codigo),
    codigo,
    nombre: String(row?.nombre || NOMBRES_BANCO_LEGADO[codigo] || codigo).trim(),
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
  };
}

export function esTablaBancosAusente(error: unknown): boolean {
  const err = (error || {}) as { code?: string; message?: string; details?: string };
  const code = String(err.code || '');
  const msg = `${err.message || ''} ${err.details || ''}`;
  if (code === '42P01' || code === 'PGRST205') return true;
  return /bancos_caja/i.test(msg) && /does not exist|schema cache|not find|no existe/i.test(msg);
}

function filasResumenRpc(data: unknown): Record<string, unknown>[] | null {
  let rows: unknown = data;
  if (typeof data === 'string') {
    try {
      rows = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.filter((raw) => raw && typeof raw === 'object') as Record<string, unknown>[];
}

export function rpcOmiteCatalogo(data: unknown, bancos: readonly string[]): boolean {
  const rows = filasResumenRpc(data);
  if (!rows) return true;
  const have = new Set(
    rows.map((row) => String(row['banco'] || '').trim()).filter(Boolean),
  );
  return bancos.some((codigo) => !have.has(codigo));
}

function codigosResumen(
  bancos: readonly string[],
  extras: Iterable<string>,
): BancoCaja[] {
  const seen = new Set<string>();
  const out: BancoCaja[] = [];
  for (const raw of [...bancos, ...extras]) {
    const codigo = String(raw || '').trim();
    if (!codigo || seen.has(codigo)) continue;
    seen.add(codigo);
    out.push(codigo);
  }
  return out;
}

/**
 * Suma ingresos/egresos de TODAS las filas dadas (sin recortar).
 * Quien llama debe haber excluido anulados en SQL.
 */
export function resumenDesdeFilas(
  movs: Array<Pick<MovimientoCaja, 'banco' | 'tipo' | 'monto'> | { banco?: string; tipo?: string; monto?: unknown }>,
  bancos: readonly string[] = BANCOS_CAJA,
): ResumenBanco[] {
  const extras = (movs || []).map((m) => String(m.banco || '').trim());
  return codigosResumen(bancos, extras).map((banco) => {
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

/** RPC `resumen_caja` → array por banco. null si el payload no sirve (fallback a SELECT). */
export function mapResumenCajaFromRpc(
  data: unknown,
  bancos: readonly string[] = BANCOS_CAJA,
): ResumenBanco[] | null {
  const rows = filasResumenRpc(data);
  if (!rows) return null;
  const byBanco = new Map<string, ResumenBanco>();
  for (const row of rows) {
    const banco = String(row['banco'] || '').trim();
    if (!banco) continue;
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
  return codigosResumen(bancos, byBanco.keys()).map(
    (banco) => byBanco.get(banco) || { banco, ingresos: 0, egresos: 0, saldo: 0 },
  );
}
