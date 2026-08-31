import { Cobro } from '../service/cobros.service';
import { Contrato } from '../service/contratos.service';
import { Moto } from './interfaces/moto';
import { Usuario } from './interfaces/usuario';
import { diasHasta } from './date.util';
import { FrecuenciaPago, parseDateOnly } from './periodo.util';

export type FiltroCartera = 'todos' | 'mora' | 'pendientes' | 'al_dia';

export interface ItemCartera {
  cobro: Cobro;
  frecuencia: FrecuenciaPago;
  conductorId: string;
  conductorNombre: string;
  motoPlaca: string;
  diasMora: number;
}

export interface GrupoCartera {
  conductorId: string;
  conductorNombre: string;
  motoPlaca: string;
  items: ItemCartera[];
  saldoTotal: number;
  periodosMora: number;
}

const ESTADOS_CON_SALDO: Cobro['estado'][] = ['pendiente', 'parcial'];

export function idDeRelacion(value: string | { _id?: string } | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value._id || '';
}

export function idConductorDeCobro(c: Cobro): string {
  if (c.conductor?._id) return c.conductor._id;
  return idDeRelacion(c.conductorId as string | Usuario | null);
}

export function nombreConductorCobro(c: Cobro): string {
  const u = c.conductor || (typeof c.conductorId === 'object' ? (c.conductorId as Usuario) : null);
  if (u) {
    const nombre = `${u.nombre || ''} ${u.apellido || ''}`.trim();
    if (nombre) return nombre;
  }
  return 'Conductor';
}

export function cobroTieneSaldoPendiente(c: Cobro): boolean {
  if (!c || c.estado === 'anulado' || c.estado === 'pagado') return false;
  if (c.saldo <= 0) return false;
  return ESTADOS_CON_SALDO.includes(c.estado) || c.estado === undefined;
}

function placaDesdeContratoOMoto(
  cobro: Cobro,
  contrato: Contrato | undefined,
  motos: Moto[],
): string {
  if (contrato?.motoId && typeof contrato.motoId !== 'string') {
    const placa = (contrato.motoId as Moto).placa;
    if (placa) return placa;
  }
  const motoId = idDeRelacion(cobro.motoId as string | Moto | null);
  if (motoId) {
    const moto = motos.find((m) => m._id === motoId);
    if (moto?.placa) return moto.placa;
  }
  return '—';
}

/**
 * Cartera staff: todos los cobros con saldo (mora vieja + vigente + parcial),
 * no solo el periodo actual del contrato.
 */
export function construirCarteraCobros(
  cobros: Cobro[],
  contratos: Contrato[],
  motos: Moto[] = [],
): ItemCartera[] {
  const contratoPorId = new Map<string, Contrato>();
  for (const ct of contratos) {
    if (ct._id) contratoPorId.set(ct._id, ct);
  }

  const items: ItemCartera[] = [];
  for (const cobro of cobros) {
    if (!cobroTieneSaldoPendiente(cobro)) continue;

    const contrato = contratoPorId.get(cobro.contratoId);
    const dias = diasHasta(cobro.fechaVencimiento);
    const diasMora = cobro.enMora && dias !== null ? Math.max(0, -dias) : 0;

    items.push({
      cobro,
      frecuencia: contrato?.frecuenciaPago || 'semanal',
      conductorId: idConductorDeCobro(cobro),
      conductorNombre: nombreConductorCobro(cobro),
      motoPlaca: placaDesdeContratoOMoto(cobro, contrato, motos),
      diasMora,
    });
  }

  return items.sort((a, b) => {
    if (a.cobro.enMora !== b.cobro.enMora) return a.cobro.enMora ? -1 : 1;
    const byVence =
      parseDateOnly(a.cobro.fechaVencimiento).getTime() -
      parseDateOnly(b.cobro.fechaVencimiento).getTime();
    if (byVence !== 0) return byVence;
    return a.cobro.numeroPeriodo - b.cobro.numeroPeriodo;
  });
}

export function filtrarCartera(items: ItemCartera[], filtro: FiltroCartera): ItemCartera[] {
  switch (filtro) {
    case 'mora':
      return items.filter((i) => i.cobro.enMora);
    case 'pendientes':
      return items.filter((i) => !i.cobro.enMora && i.cobro.saldo > 0);
    case 'al_dia':
      return items.filter((i) => !i.cobro.enMora);
    default:
      return items;
  }
}

export function filtrarCarteraPorConductor(
  items: ItemCartera[],
  conductorId: string,
  busqueda: string,
): ItemCartera[] {
  const q = (busqueda || '').trim().toLowerCase();
  return items.filter((i) => {
    if (conductorId && i.conductorId !== conductorId) return false;
    if (!q) return true;
    return (
      i.conductorNombre.toLowerCase().includes(q) ||
      i.motoPlaca.toLowerCase().includes(q) ||
      String(i.cobro.numeroPeriodo).includes(q)
    );
  });
}

export function agruparCarteraPorConductor(items: ItemCartera[]): GrupoCartera[] {
  const map = new Map<string, GrupoCartera>();
  for (const item of items) {
    const key = item.conductorId || item.conductorNombre;
    let grupo = map.get(key);
    if (!grupo) {
      grupo = {
        conductorId: item.conductorId,
        conductorNombre: item.conductorNombre,
        motoPlaca: item.motoPlaca,
        items: [],
        saldoTotal: 0,
        periodosMora: 0,
      };
      map.set(key, grupo);
    }
    grupo.items.push(item);
    grupo.saldoTotal += item.cobro.saldo;
    if (item.cobro.enMora) grupo.periodosMora += 1;
    if (grupo.motoPlaca === '—' && item.motoPlaca !== '—') grupo.motoPlaca = item.motoPlaca;
  }

  return Array.from(map.values()).sort((a, b) => {
    if ((a.periodosMora > 0) !== (b.periodosMora > 0)) return a.periodosMora > 0 ? -1 : 1;
    return a.conductorNombre.localeCompare(b.conductorNombre, 'es');
  });
}

export function opcionesConductorCartera(
  items: ItemCartera[],
): { conductorId: string; conductorNombre: string; periodos: number }[] {
  const grupos = agruparCarteraPorConductor(items);
  return grupos.map((g) => ({
    conductorId: g.conductorId,
    conductorNombre: g.conductorNombre,
    periodos: g.items.length,
  }));
}
