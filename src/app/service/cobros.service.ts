import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap, throwError, of, forkJoin } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import {
  calcularEstadoCobro,
  calcularPeriodo,
  numeroPeriodoVigente,
  parseDateOnly,
  toDateOnlyString,
} from '../shared/periodo.util';
import { Usuario } from '../shared/interfaces/usuario';
import { Moto } from '../shared/interfaces/moto';

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
    const conductor = row.usuarios
      ? {
          _id: row.usuarios.id,
          nombre: row.usuarios.nombre,
          apellido: row.usuarios.apellido,
          email: row.usuarios.email,
          cedula: row.usuarios.cedula,
          telefono: row.usuarios.telefono,
          rol: row.usuarios.rol,
          activo: row.usuarios.activo,
        }
      : undefined;
    const hoy = startOfToday();
    const venc = parseDateOnly(row.fecha_vencimiento);
    const saldo = Number(row.saldo);
    const enMora =
      row.estado !== 'anulado' &&
      row.estado !== 'pagado' &&
      saldo > 0 &&
      venc.getTime() < hoy.getTime();
    return {
      _id: row.id,
      contratoId: row.contrato_id,
      conductorId: conductor || row.conductor_id,
      motoId: row.moto_id,
      numeroPeriodo: row.numero_periodo,
      periodoInicio: row.periodo_inicio,
      periodoFin: row.periodo_fin,
      fechaVencimiento: row.fecha_vencimiento,
      montoEsperado: Number(row.monto_esperado),
      montoPagado: Number(row.monto_pagado),
      saldo,
      estado: row.estado,
      // Siempre recalcular: el flag en DB puede estar desactualizado
      enMora,
      conductor,
    };
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

  getCobros(params?: { enMora?: string; conductorId?: string }): Observable<Cobro[]> {
    let q = getSupabase()
      .from('cobros')
      .select('*, usuarios:conductor_id(*)')
      .neq('estado', 'anulado')
      .order('periodo_inicio', { ascending: false });
    if (params?.conductorId) q = q.eq('conductor_id', params.conductorId);
    if (params?.enMora === 'true') q = q.eq('en_mora', true);
    return from(q).pipe(
      switchMap(({ data, error }) => {
        if (error) return throwError(() => error);
        const rows = data || [];
        const cobros = rows.map((r) => this.mapCobro(r));
        // sincronizar mora en cliente y persistir flag
        return this.syncMoraFlags(cobros, rows);
      }),
    );
  }

  private syncMoraFlags(cobros: Cobro[], rows: any[]): Observable<Cobro[]> {
    const hoy = startOfToday();
    const updates = cobros
      .map((c, i) => ({ c, row: rows[i] }))
      .filter(({ c }) => c._id && c.estado !== 'pagado' && c.estado !== 'anulado')
      .map(({ c, row }) => {
        const venc = parseDateOnly(c.fechaVencimiento);
        const enMora = c.saldo > 0 && venc.getTime() < hoy.getTime();
        c.enMora = enMora;
        const flagDb = !!row?.en_mora;
        if (enMora === flagDb) return of(c);
        return from(
          getSupabase().from('cobros').update({ en_mora: enMora }).eq('id', c._id!),
        ).pipe(map(() => c));
      });
    if (!updates.length) return of(cobros);
    return forkJoin(updates).pipe(map(() => cobros));
  }

  getResumen(): Observable<ResumenCobros> {
    return this.getCobros().pipe(
      map((cobros) => ({
        pagadoTotal: cobros.reduce((s, c) => s + c.montoPagado, 0),
        pendienteTotal: cobros.reduce((s, c) => s + c.saldo, 0),
        enMoraTotal: cobros.filter((c) => c.enMora).reduce((s, c) => s + c.saldo, 0),
      })),
    );
  }

  getEstadoCuenta(conductorId: string): Observable<EstadoCuenta> {
    return this.getCobros({ conductorId }).pipe(
      map((cobros) => {
        const enMora = cobros.filter((c) => c.enMora);
        const fechas = enMora.map((c) => parseDateOnly(c.fechaVencimiento).getTime());
        return {
          deudaTotal: cobros.reduce((s, c) => s + c.saldo, 0),
          deudaEnMora: enMora.reduce((s, c) => s + c.saldo, 0),
          periodosVencidos: enMora.length,
          enMora: enMora.length > 0,
          fechaMoraMasAntigua: fechas.length ? new Date(Math.min(...fechas)) : null,
        };
      }),
    );
  }

  getAbonos(estado?: string, conductorId?: string): Observable<Abono[]> {
    let q = getSupabase()
      .from('abonos')
      .select('*, usuarios:conductor_id(id,nombre,apellido,email,cedula,telefono,rol,activo)')
      .order('created_at', { ascending: false });
    if (estado) q = q.eq('estado', estado);
    if (conductorId) q = q.eq('conductor_id', conductorId);
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.mapAbono(r));
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

    return from(
      getSupabase()
        .from('abonos')
        .select('monto, fecha_pago')
        .eq('estado', 'registrado')
        .gte('fecha_pago', desdeStr),
    ).pipe(
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
    return from(sb.from('contratos').select('*').eq('estado', 'activo')).pipe(
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
        const row = {
          contrato_id: contrato.id,
          conductor_id: contrato.conductor_id,
          moto_id: contrato.moto_id,
          numero_periodo: vigente,
          periodo_inicio: toDateOnlyString(p.periodoInicio),
          periodo_fin: toDateOnlyString(p.periodoFin),
          fecha_vencimiento: toDateOnlyString(p.fechaVencimiento),
          monto_esperado: Number(contrato.cuota_semanal),
          monto_pagado: 0,
          saldo: Number(contrato.cuota_semanal),
          estado: 'pendiente',
          en_mora: false,
          generado_por: actorId,
        };
        return from(sb.from('cobros').insert(row).select('*, usuarios:conductor_id(*)')).pipe(
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
            .insert({
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
            })
            .select('*')
            .single(),
        ).pipe(
          switchMap(({ data: abono, error: e2 }) => {
            if (e2 || !abono) return throwError(() => ({ error: { message: e2?.message || 'No se pudo abonar' } }));
            if (pendiente) return of([this.mapAbono(abono)]);
            return this.aplicarAbonoAlCobro(cobro.id).pipe(map(() => [this.mapAbono(abono)]));
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
    return from(sb.from('abonos').select('*').eq('id', id).single()).pipe(
      switchMap(({ data: abono, error }) => {
        if (error || !abono) return throwError(() => ({ error: { message: 'Abono no encontrado' } }));
        if (abono.estado !== 'pendiente_confirmacion') {
          return throwError(() => ({ error: { message: 'El abono no está pendiente' } }));
        }
        return from(
          sb
            .from('abonos')
            .update({
              estado: 'registrado',
              confirmado_por: actorId,
              confirmado_en: new Date().toISOString(),
            })
            .eq('id', id)
            .select('*, usuarios:conductor_id(id,nombre,apellido,email,cedula,telefono,rol,activo)')
            .single(),
        ).pipe(
          switchMap(({ data: conf, error: e2 }) => {
            if (e2 || !conf) return throwError(() => ({ error: { message: e2?.message || 'No se pudo confirmar' } }));
            return this.aplicarAbonoAlCobro(conf.cobro_id).pipe(map(() => this.mapAbono(conf)));
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
            .select('*, usuarios:conductor_id(id,nombre,apellido,email,cedula,telefono,rol,activo)')
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

  private aplicarAbonoAlCobro(cobroId: string): Observable<void> {
    const sb = getSupabase();
    return from(
      sb.from('abonos').select('monto').eq('cobro_id', cobroId).eq('estado', 'registrado'),
    ).pipe(
      switchMap(({ data: abonos, error }) => {
        if (error) return throwError(() => error);
        const pagado = (abonos || []).reduce((s: number, a: any) => s + Number(a.monto), 0);
        return from(sb.from('cobros').select('*').eq('id', cobroId).single()).pipe(
          switchMap(({ data: cobro, error: e2 }) => {
            if (e2 || !cobro) return throwError(() => e2 || new Error('Cobro no encontrado'));
            const esperado = Number(cobro.monto_esperado);
            const saldo = Math.max(0, esperado - pagado);
            const estado = calcularEstadoCobro(esperado, pagado);
            const venc = parseDateOnly(cobro.fecha_vencimiento);
            const enMora = estado !== 'pagado' && saldo > 0 && venc.getTime() < startOfToday().getTime();
            return from(
              sb
                .from('cobros')
                .update({
                  monto_pagado: pagado,
                  saldo,
                  estado,
                  en_mora: enMora,
                })
                .eq('id', cobroId),
            ).pipe(map(() => void 0));
          }),
        );
      }),
    );
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
