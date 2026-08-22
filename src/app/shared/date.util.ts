/** Días hasta una fecha (solo día). Negativo = ya venció. */
export function diasHasta(fecha?: string | Date | null): number | null {
  if (!fecha) return null;
  const target = typeof fecha === 'string' ? new Date(fecha) : new Date(fecha.getTime());
  if (Number.isNaN(target.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - hoy.getTime()) / 86400000);
}

export function etiquetaVencimiento(fecha?: string | Date | null): string {
  const dias = diasHasta(fecha);
  if (dias === null) return 'Sin registrar';
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} días`;
  if (dias === 0) return 'Vence hoy';
  if (dias <= 15) return `Vence en ${dias} días`;
  return new Date(fecha!).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
