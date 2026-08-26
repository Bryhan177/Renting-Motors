import { Injectable } from '@angular/core';
import { Observable, from, map, forkJoin, of, switchMap } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import { Moto } from '../shared/interfaces/moto';

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
            imagen: motoRow.imagen,
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
    return from(
      getSupabase()
        .from('pagos')
        .select('*, motos:moto_id(*)')
        .neq('estado', 'anulado')
        .order('fecha_pago', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  getPagosBySemana(semana: string): Observable<PagoManual[]> {
    return from(
      getSupabase().from('pagos').select('*, motos:moto_id(*)').eq('semana', semana).neq('estado', 'anulado'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  getPagosByConductor(conductorId: string): Observable<PagoManual[]> {
    return from(
      getSupabase()
        .from('pagos')
        .select('*, motos:moto_id(*)')
        .eq('conductor_id', conductorId)
        .neq('estado', 'anulado')
        .order('fecha_pago', { ascending: false }),
    ).pipe(
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
        .insert({
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
        })
        .select('*, motos:moto_id(*)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo crear pago');
        return this.map(data);
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
        .insert({
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
        })
        .select('*, motos:moto_id(*)')
        .single(),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo registrar el pago');
        const pago = this.map(data);
        // Registrar ingreso neto en caja MDD
        const neto = Math.max(0, payload.valorPagado - (payload.gastos || 0));
        if (neto <= 0) return of(pago);
        return from(
          getSupabase().from('movimientos_caja').insert({
            banco: 'mdd',
            tipo: 'ingreso',
            monto: neto,
            fecha: payload.fechaPago.slice(0, 10),
            descripcion: `Pago MDD ${pago.moto?.placa || ''} · ${payload.metodoPago}`,
            moto_id: payload.motoId,
            pago_id: data.id,
            registrado_por: actorId,
          }),
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
