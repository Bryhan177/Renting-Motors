/**
 * Multi-tenant helpers for GoRenting.
 *
 * Isolation is enforced in Postgres (RLS + stamp trigger). The client must
 * never send a chosen `empresa_id` (that would be impersonation). Extra-safe
 * list filters may use the authenticated profile's membership only.
 */

export const NOMBRE_EMPRESA_PRODUCCION = 'GoRenting';
export const NOMBRE_EMPRESA_PRUEBAS = 'GoRenting Pruebas';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizarEmpresaId(
  value: string | null | undefined,
): string | null {
  const id = String(value || '').trim();
  if (!id || !UUID_RE.test(id)) return null;
  return id.toLowerCase();
}

export function mapEmpresaIdFromRow(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null;
  const raw = (row as { empresa_id?: unknown; empresaId?: unknown }).empresa_id
    ?? (row as { empresaId?: unknown }).empresaId;
  return typeof raw === 'string' ? normalizarEmpresaId(raw) : null;
}

/**
 * Extra-safe PostgREST filter. No-op when the profile has no membership yet
 * (RLS still applies). Never pass an id the user typed or picked in the UI.
 */
export function aplicarFiltroEmpresa<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  empresaId: string | null | undefined,
): T {
  const id = normalizarEmpresaId(empresaId);
  if (!id) return query;
  return query.eq('empresa_id', id);
}

/** Drop client-supplied tenant keys so Postgres stamps membership instead. */
export function stripClienteEmpresaId<T extends Record<string, unknown>>(payload: T): T {
  const next: Record<string, unknown> = { ...payload };
  delete next['empresa_id'];
  delete next['empresaId'];
  return next as T;
}

export function mismaEmpresa(
  rowEmpresaId: string | null | undefined,
  perfilEmpresaId: string | null | undefined,
): boolean {
  const a = normalizarEmpresaId(rowEmpresaId);
  const b = normalizarEmpresaId(perfilEmpresaId);
  return !!a && !!b && a === b;
}
