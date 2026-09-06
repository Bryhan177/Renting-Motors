import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import { aplicarFiltroEmpresa, stripClienteEmpresaId } from '../shared/empresa-scope';
import {
  BANCOS_CAJA,
  BANCOS_CAJA_FALLBACK,
  BANCOS_CAJA_SELECT,
  CAJA_LISTA_LIMIT,
  CAJA_LISTA_SELECT,
  CAJA_RESUMEN_SELECT,
  codigoBancoUnico,
  esTablaBancosAusente,
  mapBancoFromRow,
  mapResumenCajaFromRpc,
  ordenarBancos,
  resumenDesdeFilas,
  rpcOmiteCatalogo,
  type BancoCaja,
  type BancoCatalogo,
  type MovimientoCaja,
  type ResumenBanco,
} from '../shared/caja-resumen';

export type { BancoCaja, BancoCatalogo, MovimientoCaja, ResumenBanco };

const SQL_BANCOS = '¿Corriste el SQL 20260910_bancos_caja.sql en Supabase?';

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

  private errorBancos(error: unknown, fallback: string): Error {
    if (esTablaBancosAusente(error)) return new Error(SQL_BANCOS);
    const err = error as { code?: string; message?: string };
    if (err?.code === '23505') return new Error('Ya existe un banco con ese nombre');
    return new Error(err?.message || fallback);
  }

  listBancos(): Observable<BancoCatalogo[]> {
    let q = getSupabase()
      .from('bancos_caja')
      .select(BANCOS_CAJA_SELECT)
      .order('created_at', { ascending: true });
    q = aplicarFiltroEmpresa(q, this.auth.getEmpresaId());
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) {
          if (esTablaBancosAusente(error)) return BANCOS_CAJA_FALLBACK;
          throw error;
        }
        const rows = (data || [])
          .map((r) => mapBancoFromRow(r))
          .filter((b) => !!b.codigo);
        const byCodigo = new Map(BANCOS_CAJA_FALLBACK.map((b) => [b.codigo, b]));
        for (const row of rows) byCodigo.set(row.codigo, row);
        return ordenarBancos([...byCodigo.values()]);
      }),
    );
  }

  crearBanco(payload: { nombre: string }): Observable<BancoCatalogo> {
    const nombre = String(payload.nombre || '').trim();
    return this.listBancos().pipe(
      switchMap((bancos) =>
        from(
          getSupabase()
            .from('bancos_caja')
            .insert(
              stripClienteEmpresaId({
                codigo: codigoBancoUnico(
                  nombre,
                  bancos.map((b) => b.codigo),
                ),
                nombre,
              }),
            )
            .select(BANCOS_CAJA_SELECT)
            .single(),
        ),
      ),
      map(({ data, error }) => {
        if (error || !data) throw this.errorBancos(error, 'No se pudo crear el banco');
        return mapBancoFromRow(data);
      }),
    );
  }

  actualizarBanco(id: string, payload: { nombre: string }): Observable<BancoCatalogo> {
    const nombre = String(payload.nombre || '').trim();
    return from(
      getSupabase()
        .from('bancos_caja')
        .update(stripClienteEmpresaId({ nombre }))
        .eq('id', id)
        .select(BANCOS_CAJA_SELECT)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw this.errorBancos(error, 'No se pudo actualizar el banco');
        return mapBancoFromRow(data);
      }),
    );
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
  resumen(bancos?: readonly string[]): Observable<ResumenBanco[]> {
    const codes$ = bancos
      ? of([...bancos])
      : this.listBancos().pipe(map((rows) => rows.map((b) => b.codigo)));
    return codes$.pipe(
      switchMap((codes) =>
        from(getSupabase().rpc('resumen_caja')).pipe(
          switchMap(({ data, error }) => {
            const mapped = !error ? mapResumenCajaFromRpc(data, codes) : null;
            if (mapped && !rpcOmiteCatalogo(data, codes)) return of(mapped);
            return this.resumenPorAgregado(codes);
          }),
        ),
      ),
    );
  }

  private resumenPorAgregado(bancos: readonly string[] = BANCOS_CAJA): Observable<ResumenBanco[]> {
    let q = getSupabase()
      .from('movimientos_caja')
      .select(CAJA_RESUMEN_SELECT)
      .neq('estado', 'anulado');
    q = aplicarFiltroEmpresa(q, this.auth.getEmpresaId());
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return resumenDesdeFilas(data || [], bancos);
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

export {
  BANCOS_CAJA,
  BANCOS_CAJA_FALLBACK,
  BANCOS_CAJA_SELECT,
  CAJA_LISTA_LIMIT,
  CAJA_LISTA_SELECT,
  CAJA_RESUMEN_SELECT,
  resumenDesdeFilas,
};
