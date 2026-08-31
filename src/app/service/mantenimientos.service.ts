import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import { MotosService, MOTOS_EMBED_SELECT, fotoDesdeImagenUrl } from './motos.service';

export const MANTENIMIENTOS_LISTA_SELECT = `*, motos:moto_id(${MOTOS_EMBED_SELECT})`;

export interface Mantenimiento {
  _id?: string;
  motoId: string;
  moto?: { placa?: string; marca?: string; modelo?: string; imagen?: string };
  valor: number;
  fechaIngreso: string;
  fechaSalida?: string | null;
  observacion?: string | null;
  tipo?: string;
  estado: 'en_taller' | 'finalizado' | 'anulado';
}

@Injectable({ providedIn: 'root' })
export class MantenimientosService {
  constructor(
    private auth: AuthService,
    private motos: MotosService,
  ) {}

  private map(row: any): Mantenimiento {
    return {
      _id: row.id,
      motoId: row.moto_id,
      moto: row.motos
        ? {
            placa: row.motos.placa,
            marca: row.motos.marca,
            modelo: row.motos.modelo,
            imagen: fotoDesdeImagenUrl(row.motos),
          }
        : undefined,
      valor: Number(row.valor) || 0,
      fechaIngreso: row.fecha_ingreso,
      fechaSalida: row.fecha_salida,
      observacion: row.observacion,
      tipo: row.tipo,
      estado: row.estado,
    };
  }

  list(): Observable<Mantenimiento[]> {
    return from(
      getSupabase()
        .from('mantenimientos')
        .select(MANTENIMIENTOS_LISTA_SELECT)
        .order('fecha_ingreso', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  registrar(payload: {
    motoId: string;
    valor: number;
    fechaIngreso: string;
    observacion: string;
    tipo?: string;
  }): Observable<Mantenimiento> {
    const actorId = this.auth.getUserId();
    const sb = getSupabase();
    return from(
      sb
        .from('mantenimientos')
        .insert({
          moto_id: payload.motoId,
          valor: payload.valor,
          fecha_ingreso: payload.fechaIngreso,
          observacion: payload.observacion,
          tipo: payload.tipo || 'general',
          estado: 'en_taller',
          registrado_por: actorId,
        })
        .select(MANTENIMIENTOS_LISTA_SELECT)
        .single(),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo registrar mantenimiento');
        return this.motos.updateMoto(payload.motoId, { estado: 'en_mantenimiento' }).pipe(
          switchMap(() =>
            from(
              sb.from('movimientos_caja').insert({
                banco: 'mdd',
                tipo: 'egreso',
                monto: Math.max(1, payload.valor),
                fecha: payload.fechaIngreso,
                descripcion: `Mantenimiento MDD · ${payload.observacion}`,
                moto_id: payload.motoId,
                mantenimiento_id: data.id,
                registrado_por: actorId,
              }),
            ).pipe(map(() => this.map(data))),
          ),
        );
      }),
    );
  }

  finalizar(id: string, motoId: string): Observable<Mantenimiento> {
    return from(
      getSupabase()
        .from('mantenimientos')
        .update({ estado: 'finalizado', fecha_salida: new Date().toISOString().slice(0, 10) })
        .eq('id', id)
        .select(MANTENIMIENTOS_LISTA_SELECT)
        .single(),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo finalizar');
        return this.motos.updateMoto(motoId, { estado: 'disponible', conductorId: null }).pipe(
          map(() => this.map(data)),
        );
      }),
    );
  }
}
