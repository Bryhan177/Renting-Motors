import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap, throwError } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import { Moto } from '../shared/interfaces/moto';
import { aplicarFiltroEmpresa, stripClienteEmpresaId } from '../shared/empresa-scope';
import { MOTOS_EMBED_SELECT, fotoDesdeImagenUrl } from './motos.service';

export interface PagoManual {
  _id?: string;
  conductorId?: string | null;
  motoId?: string | null;
  moto?: Moto | null;
  fechaPago: string;
  valorPagado: number;
  gastos: number;
  descripcionGasto?: string | null;
  metodoPago: string;
  observaciones?: string | null;
  semana?: string | null;
  pagado?: boolean;
}

/** Lista de pagos: sin `comprobante_imagen` y sin `motos(*)` (blob imagen). */
export const PAGOS_LISTA_SELECT = `id, conductor_id, moto_id, fecha_pago, created_at, valor_pagado, monto, gastos, descripcion_gasto, metodo_pago, observaciones, semana, pagado, estado, motos:moto_id(${MOTOS_EMBED_SELECT})`;

@Injectable({ providedIn: 'root' })
export class PagosService {
  constructor(private auth: AuthService) {}

  private map(row: any): PagoManual {
    const motoRow = row.motos;
    return {
      _id: row.id,
      conductorId: row.conductor_id,
      motoId: row.moto_id,
      moto: motoRow
        ? {
            _id: motoRow.id,
            marca: motoRow.marca,
            modelo: motoRow.modelo,
            placa: motoRow.placa,
            precio: Number(motoRow.precio) || 0,
            estado: motoRow.estado,
            imagen: fotoDesdeImagenUrl(motoRow),
            modalidad: motoRow.modalidad,
          }
        : null,
      fechaPago: row.fecha_pago || row.created_at,
      valorPagado: Number(row.valor_pagado ?? row.monto) || 0,
      gastos: Number(row.gastos) || 0,
      descripcionGasto: row.descripcion_gasto,
      metodoPago: row.metodo_pago || 'TRANSFERENCIA',
      observaciones: row.observaciones,
      semana: row.semana,
      pagado: row.pagado !== false,
    };
  }

  getPagos(): Observable<PagoManual[]> {
    let q = getSupabase()
      .from('pagos')
      .select(PAGOS_LISTA_SELECT)
      .neq('estado', 'anulado')
      .order('fecha_pago', { ascending: false });
    q = aplicarFiltroEmpresa(q, this.auth.getEmpresaId());
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  getPagosBySemana(semana: string): Observable<PagoManual[]> {
    let q = getSupabase()
      .from('pagos')
      .select(PAGOS_LISTA_SELECT)
      .eq('semana', semana)
      .neq('estado', 'anulado');
    q = aplicarFiltroEmpresa(q, this.auth.getEmpresaId());
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  getPagosByConductor(conductorId: string): Observable<PagoManual[]> {
    let q = getSupabase()
      .from('pagos')
      .select(PAGOS_LISTA_SELECT)
      .eq('conductor_id', conductorId)
      .neq('estado', 'anulado')
      .order('fecha_pago', { ascending: false });
    q = aplicarFiltroEmpresa(q, this.auth.getEmpresaId());
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  /** Compat: reportes de conductor (queda pendiente de confirmación staff). */
  createPago(payload: {
    conductorId: string;
    semana: string;
    monto: number;
    pagado?: boolean;
    metodoPago?: string;
    comprobanteImagen?: string;
    observaciones?: string;
    motoId?: string;
  }): Observable<PagoManual> {
    return from(
      getSupabase()
        .from('pagos')
        .insert(stripClienteEmpresaId({
          conductor_id: payload.conductorId,
          moto_id: payload.motoId || null,
          semana: payload.semana,
          monto: payload.monto,
          valor_pagado: payload.monto,
          pagado: payload.pagado !== false,
          metodo_pago: payload.metodoPago || 'TRANSFERENCIA',
          comprobante_imagen: payload.comprobanteImagen || null,
          observaciones: payload.observaciones || null,
          fecha_pago: new Date().toISOString(),
          gastos: 0,
        }))
        .select(PAGOS_LISTA_SELECT)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo crear pago');
        return this.map(data);
      }),
    );
  }

  registrarOtroIngreso(payload: {
    motoId?: string | null;
    conductorId?: string | null;
    fechaPago: string;
    valorPagado: number;
    metodoPago: string;
    observaciones: string;
  }): Observable<PagoManual> {
    const actorId = this.auth.getUserId();
    const fecha = (payload.fechaPago || '').slice(0, 10);
    const monto = Number(payload.valorPagado) || 0;
    if (monto <= 0) {
      return throwError(() => ({ error: { message: 'Indica un monto válido' } }));
    }
    const nota = (payload.observaciones || '').trim() || 'Otros ingresos';
    const semana = this.isoWeek(new Date(fecha || Date.now()));
    return from(
      getSupabase()
        .from('pagos')
        .insert(
          stripClienteEmpresaId({
            moto_id: payload.motoId || null,
            conductor_id: payload.conductorId || null,
            fecha_pago: fecha,
            monto,
            valor_pagado: monto,
            gastos: 0,
            metodo_pago: payload.metodoPago,
            observaciones: nota,
            semana,
            pagado: true,
            registrado_por: actorId,
          }),
        )
        .select(PAGOS_LISTA_SELECT)
        .single(),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo registrar el ingreso');
        const pago = this.map(data);
        const placa = pago.moto?.placa || '';
        return from(
          getSupabase()
            .from('movimientos_caja')
            .insert(
              stripClienteEmpresaId({
                banco: 'mdd',
                tipo: 'ingreso',
                monto,
                fecha,
                descripcion: placa ? `${nota} · ${placa}` : nota,
                moto_id: payload.motoId || null,
                pago_id: data.id,
                registrado_por: actorId,
              }),
            ),
        ).pipe(map(() => pago));
      }),
    );
  }

  registrarManual(payload: {
    motoId: string;
    conductorId?: string | null;
    fechaPago: string;
    valorPagado: number;
    gastos?: number;
    descripcionGasto?: string;
    metodoPago: string;
    observaciones?: string;
  }): Observable<PagoManual> {
    const actorId = this.auth.getUserId();
    const semana = this.isoWeek(new Date(payload.fechaPago));
    return from(
      getSupabase()
        .from('pagos')
        .insert(stripClienteEmpresaId({
          moto_id: payload.motoId,
          conductor_id: payload.conductorId || null,
          fecha_pago: payload.fechaPago,
          monto: payload.valorPagado,
          valor_pagado: payload.valorPagado,
          gastos: payload.gastos || 0,
          descripcion_gasto: payload.descripcionGasto || null,
          metodo_pago: payload.metodoPago,
          observaciones: payload.observaciones || null,
          semana,
          pagado: true,
          registrado_por: actorId,
        }))
        .select(PAGOS_LISTA_SELECT)
        .single(),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo registrar el pago');
        const pago = this.map(data);
        // Registrar ingreso neto en caja MDD
        const neto = Math.max(0, payload.valorPagado - (payload.gastos || 0));
        if (neto <= 0) return of(pago);
        return from(
          getSupabase().from('movimientos_caja').insert(stripClienteEmpresaId({
            banco: 'mdd',
            tipo: 'ingreso',
            monto: neto,
            fecha: payload.fechaPago.slice(0, 10),
            descripcion: `Pago MDD ${pago.moto?.placa || ''} · ${payload.metodoPago}`,
            moto_id: payload.motoId,
            pago_id: data.id,
            registrado_por: actorId,
          })),
        ).pipe(map(() => pago));
      }),
    );
  }

  private isoWeek(d: Date): string {
    const oneJan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }
}
