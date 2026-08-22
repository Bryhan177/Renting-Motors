import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap, throwError } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { CUOTA_SEMANAL_ESTANDAR, DEPOSITO_ESTANDAR } from '../shared/constants';
import { Usuario } from '../shared/interfaces/usuario';
import { Moto } from '../shared/interfaces/moto';
import { FrecuenciaPago } from '../shared/periodo.util';

export interface Contrato {
  _id?: string;
  conductorId: string | Usuario;
  motoId: string | Moto;
  fechaInicio: string;
  fechaFin?: string | null;
  cuotaSemanal: number;
  depositoPactado: number;
  frecuenciaPago: FrecuenciaPago;
  estado: 'borrador' | 'activo' | 'finalizado' | 'anulado';
  saldoAFavor?: number;
  activadoEn?: string | null;
  finalizadoEn?: string | null;
}

export interface CreateContratoPayload {
  conductorId: string;
  motoId: string;
  fechaInicio: string;
  cuotaSemanal?: number;
  depositoPactado?: number;
  frecuenciaPago?: FrecuenciaPago;
}

@Injectable({ providedIn: 'root' })
export class ContratosService {
  private map(row: any): Contrato {
    return {
      _id: row.id,
      conductorId: row.usuarios || row.conductor_id,
      motoId: row.motos || row.moto_id,
      fechaInicio: row.fecha_inicio,
      fechaFin: row.fecha_fin,
      cuotaSemanal: Number(row.cuota_semanal),
      depositoPactado: Number(row.deposito_pactado),
      frecuenciaPago: (row.frecuencia_pago || 'semanal') as FrecuenciaPago,
      estado: row.estado,
      saldoAFavor: Number(row.saldo_a_favor || 0),
      activadoEn: row.activado_en,
      finalizadoEn: row.finalizado_en,
    };
  }

  getContratos(params?: { estado?: string; motoId?: string; conductorId?: string }): Observable<Contrato[]> {
    let q = getSupabase()
      .from('contratos')
      .select('*, usuarios:conductor_id(*), motos:moto_id(*)')
      .order('created_at', { ascending: false });
    if (params?.estado) q = q.eq('estado', params.estado);
    if (params?.motoId) q = q.eq('moto_id', params.motoId);
    if (params?.conductorId) q = q.eq('conductor_id', params.conductorId);
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  getOne(id: string): Observable<Contrato> {
    return from(
      getSupabase()
        .from('contratos')
        .select('*, usuarios:conductor_id(*), motos:moto_id(*)')
        .eq('id', id)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('Contrato no encontrado');
        return this.map(data);
      }),
    );
  }

  create(payload: CreateContratoPayload): Observable<Contrato> {
    const sb = getSupabase();
    const cuota = payload.cuotaSemanal ?? CUOTA_SEMANAL_ESTANDAR;
    const deposito = payload.depositoPactado ?? DEPOSITO_ESTANDAR;
    const frecuencia = payload.frecuenciaPago || 'semanal';

    return from(
      sb
        .from('contratos')
        .insert({
          conductor_id: payload.conductorId,
          moto_id: payload.motoId,
          fecha_inicio: payload.fechaInicio,
          cuota_semanal: cuota,
          deposito_pactado: deposito,
          frecuencia_pago: frecuencia,
          estado: 'borrador',
        })
        .select('*')
        .single(),
    ).pipe(
      switchMap(({ data: contrato, error }) => {
        if (error || !contrato) {
          return throwError(() => ({ error: { message: error?.message || 'No se pudo crear contrato' } }));
        }
        return from(
          sb.from('depositos').insert({
            contrato_id: contrato.id,
            conductor_id: payload.conductorId,
            moto_id: payload.motoId,
            monto_esperado: deposito,
            saldo_pendiente: deposito,
            saldo_en_custodia: 0,
            estado: deposito > 0 ? 'pendiente' : 'recibido',
          }),
        ).pipe(
          map(({ error: depErr }) => {
            if (depErr) throw depErr;
            return this.map(contrato);
          }),
        );
      }),
    );
  }

  /** Activación real (solo desde confirmar entrega). */
  activarDesdeEntrega(contratoId: string, actorId: string): Observable<Contrato> {
    const sb = getSupabase();
    return from(sb.from('contratos').select('*').eq('id', contratoId).single()).pipe(
      switchMap(({ data: c, error }) => {
        if (error || !c) return throwError(() => ({ error: { message: 'Contrato no encontrado' } }));
        if (c.estado === 'activo') return throwError(() => ({ error: { message: 'El contrato ya está activo' } }));
        if (c.estado !== 'borrador') {
          return throwError(() => ({ error: { message: 'Solo se activa un contrato en borrador' } }));
        }
        return from(
          sb
            .from('contratos')
            .update({ estado: 'activo', activado_en: new Date().toISOString() })
            .eq('id', contratoId)
            .select('*')
            .single(),
        ).pipe(
          switchMap(({ data: act, error: e2 }) => {
            if (e2 || !act) return throwError(() => ({ error: { message: e2?.message || 'No se pudo activar' } }));
            return from(
              sb
                .from('motos')
                .update({ conductor_id: act.conductor_id, estado: 'en_uso' })
                .eq('id', act.moto_id),
            ).pipe(map(() => this.map(act)));
          }),
        );
      }),
    );
  }

  finalizarDesdeDevolucion(
    contratoId: string,
    condicionMoto: 'disponible' | 'en_mantenimiento' | 'fuera_servicio',
  ): Observable<Contrato> {
    const sb = getSupabase();
    return from(sb.from('contratos').select('*').eq('id', contratoId).single()).pipe(
      switchMap(({ data: c, error }) => {
        if (error || !c) return throwError(() => ({ error: { message: 'Contrato no encontrado' } }));
        if (c.estado !== 'activo') {
          return throwError(() => ({ error: { message: 'Solo se finaliza un contrato activo' } }));
        }
        return from(
          sb
            .from('contratos')
            .update({
              estado: 'finalizado',
              finalizado_en: new Date().toISOString(),
              fecha_fin: c.fecha_fin || new Date().toISOString().slice(0, 10),
            })
            .eq('id', contratoId)
            .select('*')
            .single(),
        ).pipe(
          switchMap(({ data: fin, error: e2 }) => {
            if (e2 || !fin) return throwError(() => ({ error: { message: e2?.message || 'No se pudo finalizar' } }));
            return from(
              sb
                .from('motos')
                .update({ conductor_id: null, estado: condicionMoto })
                .eq('id', fin.moto_id),
            ).pipe(map(() => this.map(fin)));
          }),
        );
      }),
    );
  }
}
