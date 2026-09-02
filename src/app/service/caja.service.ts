import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import { aplicarFiltroEmpresa, stripClienteEmpresaId } from '../shared/empresa-scope';
import {
  BANCOS_CAJA,
  CAJA_LISTA_LIMIT,
  CAJA_LISTA_SELECT,
  CAJA_RESUMEN_SELECT,
  mapResumenCajaFromRpc,
  resumenDesdeFilas,
  type BancoCaja,
  type MovimientoCaja,
  type ResumenBanco,
} from '../shared/caja-resumen';

export type { BancoCaja, MovimientoCaja, ResumenBanco };

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

  /** Tabla del Flujo de caja: últimas N filas. No usar para saldo. */
  list(banco?: BancoCaja): Observable<MovimientoCaja[]> {
    let q = getSupabase()
      .from('movimientos_caja')
      .select(CAJA_LISTA_SELECT)
      .neq('estado', 'anulado')
      .order('fecha', { ascending: false })
      .limit(CAJA_LISTA_LIMIT);
    if (banco) q = q.eq('banco', banco);
    q = aplicarFiltroEmpresa(q, this.auth.getEmpresaId());
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  /**
   * Saldo real por banco: RPC que agrega TODAS las filas no anuladas.
   * Si el RPC aún no está aplicado, SELECT `banco, tipo, monto` sin LIMIT.
   * Nunca llama a list() (ese sí tiene tope de 200).
   */
  resumen(): Observable<ResumenBanco[]> {
    return from(getSupabase().rpc('resumen_caja')).pipe(
      switchMap(({ data, error }) => {
        const mapped = !error ? mapResumenCajaFromRpc(data) : null;
        if (mapped) return of(mapped);
        return this.resumenPorAgregado();
      }),
    );
  }

  private resumenPorAgregado(): Observable<ResumenBanco[]> {
    let q = getSupabase()
      .from('movimientos_caja')
      .select(CAJA_RESUMEN_SELECT)
      .neq('estado', 'anulado');
    q = aplicarFiltroEmpresa(q, this.auth.getEmpresaId());
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return resumenDesdeFilas(data || []);
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
        .insert(stripClienteEmpresaId({
          banco: payload.banco,
          tipo: payload.tipo,
          monto: payload.monto,
          fecha: payload.fecha,
          descripcion: payload.descripcion || null,
          moto_id: payload.motoId || null,
          registrado_por: this.auth.getUserId(),
        }))
        .select(CAJA_LISTA_SELECT)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo registrar movimiento');
        return this.map(data);
      }),
    );
  }
}

export { BANCOS_CAJA, CAJA_LISTA_LIMIT, CAJA_LISTA_SELECT, CAJA_RESUMEN_SELECT, resumenDesdeFilas };
