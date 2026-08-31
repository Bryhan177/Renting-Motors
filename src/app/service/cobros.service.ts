import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap, throwError, of, forkJoin } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import {
  calcularPeriodo,
  numeroPeriodoVigente,
  parseDateOnly,
  toDateOnlyString,
} from '../shared/periodo.util';
import { Usuario } from '../shared/interfaces/usuario';
import { Moto } from '../shared/interfaces/moto';
import {
  estadoCuentaDesdeCobros,
  mapCobroFromRow,
  mapEstadoCuentaFromRow,
  mapResumenFromRow,
  parseRpcJson,
  resumenDesdeCobros,
} from '../shared/cobro-finanzas.mapper';
import { aplicarFiltroEmpresa, stripClienteEmpresaId } from '../shared/empresa-scope';

/** PostgREST: * no incluye la columna computada en_mora; hay que pedirla. */
const COBRO_SELECT = '*, en_mora, usuarios:conductor_id(id,nombre,apellido,email,cedula,telefono,rol,activo)';

/** Lista de abonos: sin `comprobante` (data: de hasta 4 MB). */
export const ABONOS_LISTA_SELECT =
  'id, cobro_id, contrato_id, conductor_id, monto, fecha_pago, metodo_pago, referencia, origen_abono, estado, observaciones, created_at, usuarios:conductor_id(id,nombre,apellido,email,cedula,telefono,rol,activo)';

export interface Cobro {
  _id?: string;
  contratoId: string;
  conductorId: string | Usuario;
  motoId: string | Moto;
  numeroPeriodo: number;
  periodoInicio: string;
  periodoFin: string;
  fechaVencimiento: string;
  montoEsperado: number;
  montoPagado: number;
  saldo: number;
  estado: 'pendiente' | 'parcial' | 'pagado' | 'anulado';
  enMora: boolean;
  conductor?: Usuario;
}

export interface Abono {
  _id?: string;
  cobroId: string;
  contratoId: string;
  conductorId: string;
  monto: number;
  fechaPago: string;
  metodoPago: string;
  referencia?: string | null;
  comprobante?: string | null;
  origenAbono: string;
  estado: 'pendiente_confirmacion' | 'registrado' | 'anulado';
  observaciones?: string | null;
  conductor?: Usuario;
}

export interface ResumenCobros {
  pagadoTotal: number;
  pendienteTotal: number;
  enMoraTotal: number;
}

export interface EstadoCuenta {
  deudaTotal: number;
  deudaEnMora: number;
  periodosVencidos: number;
  enMora: boolean;
  fechaMoraMasAntigua: Date | null;
}

export interface IngresoMensual {
  /** Clave YYYY-MM */
  key: string;
  /** Etiqueta corta ej. "ene 2026" */
  label: string;
  monto: number;
  cantidadAbonos: number;
}

@Injectable({ providedIn: 'root' })
export class CobrosService {
  constructor(private auth: AuthService) {}

  private mapCobro(row: any): Cobro {
    return mapCobroFromRow(row);
  }

  private mapAbono(row: any): Abono {
    const conductor = row.usuarios
      ? {
          _id: row.usuarios.id,
          nombre: row.usuarios.nombre,
          apellido: row.usuarios.apellido,
          email: row.usuarios.email || '',
          cedula: row.usuarios.cedula || 0,
          telefono: row.usuarios.telefono || '',
          rol: row.usuarios.rol || 'empleado',
          activo: row.usuarios.activo !== false,
        }
      : undefined;
    return {
      _id: row.id,
      cobroId: row.cobro_id,
      contratoId: row.contrato_id,
      conductorId: row.conductor_id,
      monto: Number(row.monto),
      fechaPago: row.fecha_pago,
      metodoPago: row.metodo_pago,
      referencia: row.referencia,
      comprobante: row.comprobante,
      origenAbono: row.origen_abono,
      estado: row.estado,
      observaciones: row.observaciones,
      conductor,
    };
  }

  getCobros(params?: { enMora?: string; conductorId?: string; soloConSaldo?: boolean }): Observable<Cobro[]> {
    let q = getSupabase()
      .from('cobros')
      .select(COBRO_SELECT)
      .neq('estado', 'anulado')
      .order('periodo_inicio', { ascending: false });
    q = aplicarFiltroEmpresa(q, this.auth.getEmpresaId());
    if (params?.conductorId) q = q.eq('conductor_id', params.conductorId);
    if (params?.enMora === 'true') q = q.eq('en_mora', true);
    if (params?.soloConSaldo) q = q.gt('saldo', 0);
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.mapCobro(r));
      }),
    );
  }

  getResumen(): Observable<ResumenCobros> {
    return from(getSupabase().rpc('resumen_cobros')).pipe(
      switchMap(({ data, error }) => {
        const parsed = parseRpcJson(data);
        if (!error && parsed) return of(mapResumenFromRow(parsed));
        return this.getCobros().pipe(map((cobros) => resumenDesdeCobros(cobros)));
      }),
    );
  }

  getEstadoCuenta(conductorId: string): Observable<EstadoCuenta> {
    return from(
      getSupabase().rpc('estado_cuenta_conductor', { p_conductor_id: conductorId }),
    ).pipe(
      switchMap(({ data, error }) => {
        const parsed = parseRpcJson(data);
        if (!error && parsed) return of(mapEstadoCuentaFromRow(parsed));
        return this.getCobros({ conductorId }).pipe(map((cobros) => estadoCuentaDesdeCobros(cobros)));
      }),
    );
  }

  getAbonos(estado?: string, conductorId?: string): Observable<Abono[]> {
    let q = getSupabase()
      .from('abonos')
      .select(ABONOS_LISTA_SELECT)
      .order('created_at', { ascending: false });
    q = aplicarFiltroEmpresa(q, this.auth.getEmpresaId());
    if (estado) q = q.eq('estado', estado);
    if (conductorId) q = q.eq('conductor_id', conductorId);
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.mapAbono(r));
      }),
    );
  }

  /** Un comprobante (data:/http) al hacer clic en Ver. No va en la lista. */
  getAbonoComprobante(id: string): Observable<string | null> {
    return from(getSupabase().from('abonos').select('id, comprobante').eq('id', id).single()).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data?.comprobante ? String(data.comprobante) : null;
      }),
    );
  }

  /**
   * Ingresos confirmados (abonos registrados) agrupados por mes.
   * Incluye todos los meses del rango aunque el monto sea 0.
   */
  getIngresosMensuales(meses = 12): Observable<IngresoMensual[]> {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1);
    const desdeStr = toDateOnlyString(desde);

    let q = getSupabase()
      .from('abonos')
      .select('monto, fecha_pago')
      .eq('estado', 'registrado')
      .gte('fecha_pago', desdeStr);
    q = aplicarFiltroEmpresa(q, this.auth.getEmpresaId());

    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;

        const buckets = new Map<string, { monto: number; cantidad: number }>();
        for (let i = 0; i < meses; i++) {
          const d = new Date(desde.getFullYear(), desde.getMonth() + i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          buckets.set(key, { monto: 0, cantidad: 0 });
        }

        for (const row of data || []) {
          const fecha = String(row.fecha_pago || '').slice(0, 10);
          if (!fecha || fecha.length < 7) continue;
          const key = fecha.slice(0, 7);
          const bucket = buckets.get(key);
          if (!bucket) continue;
          bucket.monto += Number(row.monto) || 0;
          bucket.cantidad += 1;
        }

        return Array.from(buckets.entries()).map(([key, v]) => {
          const [y, m] = key.split('-').map(Number);
          const label = new Date(y, m - 1, 1).toLocaleDateString('es-CO', {
            month: 'short',
            year: '2-digit',
          });
          return {
            key,
            label: label.replace('.', ''),
            monto: v.monto,
            cantidadAbonos: v.cantidad,
          };
        });
      }),
    );
  }

  /** Genera cobros faltantes de todos los contratos activos. */
  generarPendientes(): Observable<Cobro[]> {
    const sb = getSupabase();
    const actorId = this.auth.getUserId();
    return from(
      aplicarFiltroEmpresa(sb.from('contratos').select('*').eq('estado', 'activo'), this.auth.getEmpresaId()),
    ).pipe(
      switchMap(({ data: contratos, error }) => {
        if (error) return throwError(() => error);
        if (!contratos?.length) return of([]);
        const jobs = contratos.map((c) => this.generarFaltantesDeContrato(c, actorId));
        return forkJoin(jobs).pipe(map((lists) => lists.flat()));
      }),
    );
  }

  generarFaltantesDeContrato(contrato: any, actorId: string | null): Observable<Cobro[]> {
    const sb = getSupabase();
    const frecuencia = (contrato.frecuencia_pago || contrato.frecuenciaPago || 'semanal') as
      | 'semanal'
      | 'quincenal'
      | 'mensual';
    const vigente = numeroPeriodoVigente(parseDateOnly(contrato.fecha_inicio), new Date(), frecuencia);
    if (vigente < 1) return of([]);

    return from(
      sb.from('cobros').select('numero_periodo').eq('contrato_id', contrato.id),
    ).pipe(
      switchMap(({ data: existentes }) => {
        const tiene = new Set((existentes || []).map((e: any) => e.numero_periodo));
        // Solo genera el periodo vigente (cuota de esta semana / quincena / mes)
        if (tiene.has(vigente)) return of([]);
        const p = calcularPeriodo(parseDateOnly(contrato.fecha_inicio), vigente, frecuencia);
        const row = stripClienteEmpresaId({
          contrato_id: contrato.id,
          conductor_id: contrato.conductor_id,
          moto_id: contrato.moto_id,
          numero_periodo: vigente,
          periodo_inicio: toDateOnlyString(p.periodoInicio),
          periodo_fin: toDateOnlyString(p.periodoFin),
          fecha_vencimiento: toDateOnlyString(p.fechaVencimiento),
          monto_esperado: Number(contrato.cuota_semanal),
          generado_por: actorId,
        });
        return from(sb.from('cobros').insert(row).select(COBRO_SELECT)).pipe(
          map(({ data, error }) => {
            if (error) throw error;
            return (data || []).map((r) => this.mapCobro(r));
          }),
        );
      }),
    );
  }

  registrarAbono(payload: {
    cobroId: string;
    monto: number;
    metodoPago?: string;
    referencia?: string;
    observaciones?: string;
    comprobante?: string;
    origenAbono?: 'admin' | 'conductor' | 'sistema';
    pendienteConfirmacion?: boolean;
  }): Observable<Abono[]> {
    const sb = getSupabase();
    const actorId = this.auth.getUserId();
    if (!actorId) return throwError(() => ({ error: { message: 'Sin sesión' } }));

    return from(sb.from('cobros').select('*').eq('id', payload.cobroId).single()).pipe(
      switchMap(({ data: cobro, error }) => {
        if (error || !cobro) return throwError(() => ({ error: { message: 'Cobro no encontrado' } }));
        if (cobro.estado === 'anulado') {
          return throwError(() => ({ error: { message: 'Cobro anulado' } }));
        }
        const pendiente = !!payload.pendienteConfirmacion;
        return from(
          sb
            .from('abonos')
            .insert(stripClienteEmpresaId({
              cobro_id: cobro.id,
              contrato_id: cobro.contrato_id,
              conductor_id: cobro.conductor_id,
              monto: payload.monto,
              metodo_pago: payload.metodoPago || 'TRANSFERENCIA',
              referencia: payload.referencia || null,
              comprobante: payload.comprobante || null,
              responsable_id: actorId,
              origen_abono: payload.origenAbono || 'admin',
              estado: pendiente ? 'pendiente_confirmacion' : 'registrado',
              observaciones: payload.observaciones || null,
              confirmado_por: pendiente ? null : actorId,
              confirmado_en: pendiente ? null : new Date().toISOString(),
            }))
            .select(ABONOS_LISTA_SELECT)
            .single(),
        ).pipe(
          switchMap(({ data: abono, error: e2 }) => {
            if (e2 || !abono) return throwError(() => ({ error: { message: e2?.message || 'No se pudo abonar' } }));
            return of([this.mapAbono(abono)]);
          }),
        );
      }),
    );
  }

  reportarAbono(payload: {
    cobroId: string;
    monto: number;
    metodoPago?: string;
    comprobante?: string;
    observaciones?: string;
  }): Observable<Abono> {
    return this.registrarAbono({
      ...payload,
      origenAbono: 'conductor',
      pendienteConfirmacion: true,
    }).pipe(map((list) => list[0]));
  }

  confirmarAbono(id: string): Observable<Abono> {
    const sb = getSupabase();
    const actorId = this.auth.getUserId();
    return from(sb.from('abonos').select('id, estado').eq('id', id).single()).pipe(
      switchMap(({ data: abono, error }) => {
        if (error || !abono) return throwError(() => ({ error: { message: 'Abono no encontrado' } }));
        if (abono.estado !== 'pendiente_confirmacion') {
          return throwError(() => ({ error: { message: 'El abono no está pendiente' } }));
        }
        // estado=registrado dispara abonos_sync_pago_caja (pago + ingreso caja).
        // No se inserta pagos/caja aquí: Postgres es la fuente de verdad.
        return from(
          sb
            .from('abonos')
            .update({
              estado: 'registrado',
              confirmado_por: actorId,
              confirmado_en: new Date().toISOString(),
            })
            .eq('id', id)
            .select(ABONOS_LISTA_SELECT)
            .single(),
        ).pipe(
          switchMap(({ data: conf, error: e2 }) => {
            if (e2 || !conf) return throwError(() => ({ error: { message: e2?.message || 'No se pudo confirmar' } }));
            return of(this.mapAbono(conf));
          }),
        );
      }),
    );
  }

  rechazarAbono(id: string, motivo: string): Observable<Abono> {
    const sb = getSupabase();
    const actorId = this.auth.getUserId();
    if (!actorId) return throwError(() => ({ error: { message: 'Sin sesión' } }));
    const motivoTrim = (motivo || '').trim();
    if (!motivoTrim) return throwError(() => ({ error: { message: 'Indica el motivo del rechazo' } }));

    return from(sb.from('abonos').select('estado').eq('id', id).single()).pipe(
      switchMap(({ data: abono, error }) => {
        if (error || !abono) return throwError(() => ({ error: { message: 'Abono no encontrado' } }));
        if (abono.estado !== 'pendiente_confirmacion') {
          return throwError(() => ({ error: { message: 'El abono no está pendiente' } }));
        }
        return from(
          sb
            .from('abonos')
            .update({
              estado: 'anulado',
              anulado_por: actorId,
              anulado_en: new Date().toISOString(),
              motivo_anulacion: motivoTrim,
            })
            .eq('id', id)
            .select(ABONOS_LISTA_SELECT)
            .single(),
        ).pipe(
          map(({ data, error: e2 }) => {
            if (e2 || !data) throw e2 || new Error('No se pudo rechazar');
            return this.mapAbono(data);
          }),
        );
      }),
    );
  }

}
