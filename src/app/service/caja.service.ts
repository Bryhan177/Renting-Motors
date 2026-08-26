import { Injectable } from '@angular/core';
import { Observable, from, map, forkJoin } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';

export type BancoCaja = 'mdd' | 'ahorro_mdd';

export interface MovimientoCaja {
  _id?: string;
  banco: BancoCaja;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  fecha: string;
  descripcion?: string | null;
  motoId?: string | null;
  motoPlaca?: string | null;
}

export interface ResumenBanco {
  banco: BancoCaja;
  ingresos: number;
  egresos: number;
  saldo: number;
}

@Injectable({ providedIn: 'root' })
export class CajaService {
  constructor(private auth: AuthService) {}

  private map(row: any): MovimientoCaja {
    return {
      _id: row.id,
      banco: row.banco,
      tipo: row.tipo,
      monto: Number(row.monto) || 0,
      fecha: row.fecha,
      descripcion: row.descripcion,
      motoId: row.moto_id,
      motoPlaca: row.motos?.placa || null,
    };
  }

  list(banco?: BancoCaja): Observable<MovimientoCaja[]> {
    let q = getSupabase()
      .from('movimientos_caja')
      .select('*, motos:moto_id(placa)')
      .neq('estado', 'anulado')
      .order('fecha', { ascending: false })
      .limit(200);
    if (banco) q = q.eq('banco', banco);
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  resumen(): Observable<ResumenBanco[]> {
    return this.list().pipe(
      map((movs) => {
        const banks: BancoCaja[] = ['mdd', 'ahorro_mdd'];
        return banks.map((banco) => {
          const subset = movs.filter((m) => m.banco === banco);
          const ingresos = subset.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
          const egresos = subset.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
          return { banco, ingresos, egresos, saldo: ingresos - egresos };
        });
      }),
    );
  }

  registrar(payload: {
    banco: BancoCaja;
    tipo: 'ingreso' | 'egreso';
    monto: number;
    fecha: string;
    descripcion?: string;
    motoId?: string | null;
  }): Observable<MovimientoCaja> {
    return from(
      getSupabase()
        .from('movimientos_caja')
        .insert({
          banco: payload.banco,
          tipo: payload.tipo,
          monto: payload.monto,
          fecha: payload.fecha,
          descripcion: payload.descripcion || null,
          moto_id: payload.motoId || null,
          registrado_por: this.auth.getUserId(),
        })
        .select('*, motos:moto_id(placa)')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo registrar movimiento');
        return this.map(data);
      }),
    );
  }
}
