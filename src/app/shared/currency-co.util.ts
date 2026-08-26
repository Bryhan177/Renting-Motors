/** Formato pesos colombianos: miles con punto (25.000). Sin decimales. */

export function formatCop(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseCop(String(value));
  if (!Number.isFinite(n)) return '';
  return Math.trunc(n).toLocaleString('es-CO');
}

/** Extrae solo dígitos y devuelve entero (0 si vacío). */
export function parseCop(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.trunc(raw) : 0;
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}
