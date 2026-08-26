import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap, throwError, of, catchError } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import { ContratosService } from './contratos.service';
import { CobrosService } from './cobros.service';
import { ACCESORIOS_SUGERIDOS, DOCUMENTOS_SUGERIDOS } from '../shared/constants';
import { calcularTotalesDeposito } from '../shared/periodo.util';

export interface Deposito {
  _id?: string;
  contratoId: string;
  montoEsperado: number;
  montoRecibido: number;
  montoDevuelto: number;
  montoRetenido: number;
  saldoPendiente: number;
  saldoEnCustodia: number;
  estado: string;
}

export interface MovimientoDeposito {
  _id?: string;
  tipo: 'recepcion' | 'devolucion' | 'retencion';
  monto: number;
  fecha: string;
  metodoPago: string;
  estado: string;
  observaciones?: string | null;
}

export interface Entrega {
  _id?: string;
  contratoId: string;
  fechaHora?: string;
  kilometraje: number;
  nivelCombustible: string;
  estadoGeneral: string;
  observaciones?: string | null;
  accesorios: Array<{ nombre: string; cantidad: number; entregado: boolean }>;
  documentos: Array<{ tipo: string; entregado: boolean }>;
  danosPreexistentes: Array<{ descripcion: string; zona?: string | null }>;
  evidencias: string[];
  estado: 'borrador' | 'confirmada' | 'anulada';
}

export interface Devolucion {
  _id?: string;
  contratoId: string;
  entregaId: string;
  kilometraje: number;
  nivelCombustible: string;
  estadoGeneral: string;
  observaciones?: string | null;
  accesorios: Array<{ nombre: string; cantidad: number; entregado: boolean; devuelto: boolean }>;
  documentos: Array<{ tipo: string; entregado: boolean; devuelto: boolean }>;
  danosEncontrados: Array<{ descripcion: string; zona?: string | null; preexistente?: boolean }>;
  evidencias: string[];
  condicionMoto: 'disponible' | 'en_mantenimiento' | 'fuera_servicio';
  snapshotEntrega?: any;
  estado: 'borrador' | 'confirmada' | 'anulada';
}

@Injectable({ providedIn: 'root' })
export class OperacionService {
  constructor(
    private auth: AuthService,
    private contratos: ContratosService,
    private cobros: CobrosService,
  ) {}

  sugerencias(): Observable<{ accesorios: string[]; documentos: string[] }> {
    return of({ accesorios: ACCESORIOS_SUGERIDOS, documentos: DOCUMENTOS_SUGERIDOS });
  }

  private mapDeposito(row: any): Deposito {
    return {
      _id: row.id,
      contratoId: row.contrato_id,
      montoEsperado: Number(row.monto_esperado),
      montoRecibido: Number(row.monto_recibido),
      montoDevuelto: Number(row.monto_devuelto),
      montoRetenido: Number(row.monto_retenido),
      saldoPendiente: Number(row.saldo_pendiente),
      saldoEnCustodia: Number(row.saldo_en_custodia),
      estado: row.estado,
    };
  }

  private mapEntrega(row: any): Entrega {
    return {
      _id: row.id,
      contratoId: row.contrato_id,
      fechaHora: row.fecha_hora,
      kilometraje: Number(row.kilometraje),
      nivelCombustible: row.nivel_combustible,
      estadoGeneral: row.estado_general,
      observaciones: row.observaciones,
      accesorios: row.accesorios || [],
      documentos: row.documentos || [],
      danosPreexistentes: row.danos_preexistentes || [],
      evidencias: row.evidencias || [],
      estado: row.estado,
    };
  }

  private mapDevolucion(row: any): Devolucion {
    return {
      _id: row.id,
      contratoId: row.contrato_id,
      entregaId: row.entrega_id,
      kilometraje: Number(row.kilometraje),
      nivelCombustible: row.nivel_combustible,
      estadoGeneral: row.estado_general,
      observaciones: row.observaciones,
      accesorios: row.accesorios || [],
      documentos: row.documentos || [],
      danosEncontrados: row.danos_encontrados || [],
      evidencias: row.evidencias || [],
      condicionMoto: row.condicion_moto,
      snapshotEntrega: row.snapshot_entrega,
      estado: row.estado,
    };
  }

  getDeposito(contratoId: string) {
    const sb = getSupabase();
    return from(sb.from('depositos').select('*').eq('contrato_id', contratoId).single()).pipe(
      switchMap(({ data: dep, error }) => {
        if (error || !dep) return throwError(() => ({ error: { message: 'No hay depósito' } }));
        return from(
          sb
            .from('movimientos_deposito')
            .select('*')
            .eq('deposito_id', dep.id)
            .order('created_at', { ascending: false }),
        ).pipe(
          map(({ data: movs }) => ({
            deposito: this.mapDeposito(dep),
            movimientos: (movs || []).map((m: any) => ({
              _id: m.id,
              tipo: m.tipo,
              monto: Number(m.monto),
              fecha: m.fecha,
              metodoPago: m.metodo_pago,
              estado: m.estado,
              observaciones: m.observaciones,
            })) as MovimientoDeposito[],
          })),
        );
      }),
    );
  }

  private recalcularDeposito(depositoId: string, forceLiquidacion = false): Observable<Deposito> {
    const sb = getSupabase();
    return from(sb.from('depositos').select('*').eq('id', depositoId).single()).pipe(
      switchMap(({ data: dep, error }) => {
        if (error || !dep) return throwError(() => error || new Error('Depósito no encontrado'));
        return from(
          sb
            .from('movimientos_deposito')
            .select('*')
            .eq('deposito_id', depositoId)
            .eq('estado', 'registrado'),
        ).pipe(
          switchMap(({ data: movs }) => {
            const recibido = (movs || [])
              .filter((m: any) => m.tipo === 'recepcion')
              .reduce((s: number, m: any) => s + Number(m.monto), 0);
            const devuelto = (movs || [])
              .filter((m: any) => m.tipo === 'devolucion')
              .reduce((s: number, m: any) => s + Number(m.monto), 0);
            const retenido = (movs || [])
              .filter((m: any) => m.tipo === 'retencion')
              .reduce((s: number, m: any) => s + Number(m.monto), 0);
            const enLiq =
              forceLiquidacion ||
              dep.estado === 'en_liquidacion' ||
              ['devuelto', 'parcialmente_devuelto', 'retenido'].includes(dep.estado);
            const calc = calcularTotalesDeposito({
              montoEsperado: Number(dep.monto_esperado),
              montoRecibido: recibido,
              montoDevuelto: devuelto,
              montoRetenido: retenido,
              enLiquidacion: enLiq,
            });
            const patch: any = {
              monto_recibido: recibido,
              monto_devuelto: devuelto,
              monto_retenido: retenido,
              saldo_pendiente: calc.saldoPendiente,
              saldo_en_custodia: calc.saldoEnCustodia,
              estado: calc.estado,
            };
            if (calc.estado === 'recibido' && !dep.fecha_recepcion_completa) {
              patch.fecha_recepcion_completa = new Date().toISOString();
            }
            return from(sb.from('depositos').update(patch).eq('id', depositoId).select('*').single()).pipe(
              map(({ data, error: e2 }) => {
                if (e2 || !data) throw e2 || new Error('No se pudo recalcular');
                return this.mapDeposito(data);
              }),
            );
          }),
        );
      }),
    );
  }

  registrarRecepcion(
    depositoId: string,
    payload: { monto: number; metodoPago?: string; referencia?: string; observaciones?: string },
  ) {
    const sb = getSupabase();
    const actorId = this.auth.getUserId();
    if (!actorId) return throwError(() => ({ error: { message: 'Sin sesión' } }));
    return from(sb.from('depositos').select('*').eq('id', depositoId).single()).pipe(
      switchMap(({ data: dep, error }) => {
        if (error || !dep) return throwError(() => ({ error: { message: 'Depósito no encontrado' } }));
        if (['devuelto', 'parcialmente_devuelto', 'retenido', 'anulado'].includes(dep.estado)) {
          return throwError(() => ({ error: { message: 'Depósito ya liquidado' } }));
        }
        return from(
          sb.from('movimientos_deposito').insert({
            deposito_id: dep.id,
            contrato_id: dep.contrato_id,
            tipo: 'recepcion',
            monto: payload.monto,
            metodo_pago: payload.metodoPago || 'TRANSFERENCIA',
            referencia: payload.referencia || null,
            responsable_id: actorId,
            observaciones: payload.observaciones || null,
          }),
        ).pipe(
          switchMap(({ error: e2 }) => {
            if (e2) return throwError(() => ({ error: { message: e2.message } }));
            return this.recalcularDeposito(depositoId).pipe(map((deposito) => ({ deposito })));
          }),
        );
      }),
    );
  }

  liquidar(
    depositoId: string,
    payload: {
      decision: 'devolver_completo' | 'devolver_parcial' | 'retener';
      montoADevolver?: number;
      montoARetener?: number;
      motivo: string;
    },
  ): Observable<Deposito> {
    const sb = getSupabase();
    const actorId = this.auth.getUserId();
    if (!actorId) return throwError(() => ({ error: { message: 'Sin sesión' } }));
    if (!payload.motivo?.trim()) {
      return throwError(() => ({ error: { message: 'Motivo obligatorio' } }));
    }

    return this.recalcularDeposito(depositoId, true).pipe(
      switchMap((dep) => {
        if (dep.estado !== 'en_liquidacion') {
          return throwError(() => ({
            error: { message: 'Solo se liquida después de confirmar la devolución' },
          }));
        }
        const custodia = dep.saldoEnCustodia;
        let devolver = 0;
        let retener = 0;
        if (payload.decision === 'devolver_completo') devolver = custodia;
        else if (payload.decision === 'retener') retener = custodia;
        else {
          devolver = payload.montoADevolver ?? 0;
          retener = payload.montoARetener ?? 0;
          if (devolver + retener !== custodia) {
            return throwError(() => ({
              error: { message: `Devolver + retener debe igualar $${custodia}` },
            }));
          }
        }

        const inserts: any[] = [];
        if (devolver > 0) {
          inserts.push({
            deposito_id: depositoId,
            contrato_id: dep.contratoId,
            tipo: 'devolucion',
            monto: devolver,
            responsable_id: actorId,
            observaciones: payload.motivo,
          });
        }
        if (retener > 0) {
          inserts.push({
            deposito_id: depositoId,
            contrato_id: dep.contratoId,
            tipo: 'retencion',
            monto: retener,
            responsable_id: actorId,
            observaciones: payload.motivo,
          });
        }

        const doLiquidar = () =>
          from(
            sb
              .from('depositos')
              .update({
                liquidado_en: new Date().toISOString(),
                liquidado_por: actorId,
                motivo_liquidacion: payload.motivo,
                observaciones: payload.motivo,
              })
              .eq('id', depositoId),
          ).pipe(switchMap(() => this.recalcularDeposito(depositoId, true)));

        if (!inserts.length) return doLiquidar();

        return from(sb.from('movimientos_deposito').insert(inserts)).pipe(
          switchMap((res) => {
            if (res.error) {
              return throwError(() => ({ error: { message: res.error.message } }));
            }
            return doLiquidar();
          }),
        );
      }),
    );
  }

  getEntrega(contratoId: string): Observable<Entrega | null> {
    return from(
      getSupabase()
        .from('entregas')
        .select('*')
        .eq('contrato_id', contratoId)
        .neq('estado', 'anulada')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.mapEntrega(data) : null;
      }),
    );
  }

  guardarEntrega(contratoId: string, payload: Partial<Entrega>): Observable<Entrega> {
    const sb = getSupabase();
    const actorId = this.auth.getUserId();
    if (!actorId) return throwError(() => ({ error: { message: 'Sin sesión' } }));

    return from(sb.from('contratos').select('*').eq('id', contratoId).single()).pipe(
      switchMap(({ data: contrato, error }) => {
        if (error || !contrato) return throwError(() => ({ error: { message: 'Contrato no encontrado' } }));
        if (contrato.estado === 'finalizado' || contrato.estado === 'anulado') {
          return throwError(() => ({ error: { message: 'Contrato cerrado' } }));
        }
        return from(
          sb.from('entregas').select('id').eq('contrato_id', contratoId).eq('estado', 'confirmada').maybeSingle(),
        ).pipe(
          switchMap(({ data: conf }) => {
            if (conf) return throwError(() => ({ error: { message: 'Ya hay entrega confirmada' } }));
            const body = {
              contrato_id: contratoId,
              moto_id: contrato.moto_id,
              conductor_id: contrato.conductor_id,
              kilometraje: payload.kilometraje ?? 0,
              nivel_combustible: payload.nivelCombustible || '1/2',
              estado_general: payload.estadoGeneral || 'bueno',
              observaciones: payload.observaciones || null,
              accesorios: payload.accesorios || [],
              documentos: payload.documentos || [],
              danos_preexistentes: payload.danosPreexistentes || [],
              evidencias: payload.evidencias || [],
              registrado_por: actorId,
              estado: 'borrador',
            };
            return from(
              sb.from('entregas').select('*').eq('contrato_id', contratoId).eq('estado', 'borrador').maybeSingle(),
            ).pipe(
              switchMap(({ data: borrador }) => {
                if (borrador) {
                  return from(
                    sb.from('entregas').update(body).eq('id', borrador.id).select('*').single(),
                  );
                }
                return from(sb.from('entregas').insert(body).select('*').single());
              }),
              map(({ data, error: e2 }) => {
                if (e2 || !data) throw e2 || new Error('No se pudo guardar entrega');
                return this.mapEntrega(data);
              }),
            );
          }),
        );
      }),
    );
  }

  confirmarEntrega(id: string): Observable<{
    entrega: Entrega;
    contrato: any;
    deposito: Deposito | null;
  }> {
    const sb = getSupabase();
    const actorId = this.auth.getUserId();
    return from(sb.from('entregas').select('*').eq('id', id).single()).pipe(
      switchMap(({ data: entrega, error }) => {
        if (error || !entrega) return throwError(() => ({ error: { message: 'Entrega no encontrada' } }));
        if (entrega.estado === 'confirmada') {
          return throwError(() => ({ error: { message: 'Ya confirmada' } }));
        }
        return from(
          sb
            .from('entregas')
            .update({ estado: 'confirmada', confirmada_en: new Date().toISOString() })
            .eq('id', id)
            .select('*')
            .single(),
        ).pipe(
          switchMap(({ data: conf, error: e2 }) => {
            if (e2 || !conf) return throwError(() => ({ error: { message: e2?.message || 'Error' } }));
            return from(sb.from('contratos').select('*').eq('id', conf.contrato_id).single()).pipe(
              switchMap(({ data: contrato }) => {
                const eraBorrador = contrato?.estado === 'borrador';
                const afterActivate$ = eraBorrador
                  ? this.contratos.activarDesdeEntrega(conf.contrato_id, actorId || '')
                  : of(null as any);

                return afterActivate$.pipe(
                  switchMap((contratoActualizado) => {
                    const afterCobros$ = eraBorrador
                      ? from(sb.from('contratos').select('*').eq('id', conf.contrato_id).single()).pipe(
                          switchMap(({ data: c }) =>
                            c ? this.cobros.generarFaltantesDeContrato(c, actorId) : of([]),
                          ),
                        )
                      : of([]);

                    return afterCobros$.pipe(
                      switchMap(() =>
                        this.getDeposito(conf.contrato_id).pipe(
                          map((d) => ({
                            entrega: this.mapEntrega(conf),
                            contrato: contratoActualizado,
                            deposito: d.deposito as Deposito,
                          })),
                          catchError(() =>
                            of({
                              entrega: this.mapEntrega(conf),
                              contrato: contratoActualizado,
                              deposito: null as Deposito | null,
                            }),
                          ),
                        ),
                      ),
                    );
                  }),
                );
              }),
            );
          }),
        );
      }),
    );
  }

  guardarDevolucion(contratoId: string, payload: Partial<Devolucion>): Observable<Devolucion> {
    const sb = getSupabase();
    const actorId = this.auth.getUserId();
    if (!actorId) return throwError(() => ({ error: { message: 'Sin sesión' } }));

    return from(sb.from('contratos').select('*').eq('id', contratoId).single()).pipe(
      switchMap(({ data: contrato, error }) => {
        if (error || !contrato) return throwError(() => ({ error: { message: 'Contrato no encontrado' } }));
        if (contrato.estado !== 'activo') {
          return throwError(() => ({ error: { message: 'Solo contrato activo' } }));
        }
        return from(
          sb.from('entregas').select('*').eq('contrato_id', contratoId).eq('estado', 'confirmada').single(),
        ).pipe(
          switchMap(({ data: entrega, error: e2 }) => {
            if (e2 || !entrega) {
              return throwError(() => ({ error: { message: 'Se requiere entrega confirmada' } }));
            }
            const snapshot = {
              kilometraje: entrega.kilometraje,
              nivelCombustible: entrega.nivel_combustible,
              estadoGeneral: entrega.estado_general,
              accesorios: entrega.accesorios,
              documentos: entrega.documentos,
              danosPreexistentes: entrega.danos_preexistentes,
              fechaHora: entrega.fecha_hora,
            };
            const body = {
              contrato_id: contratoId,
              entrega_id: entrega.id,
              moto_id: entrega.moto_id,
              conductor_id: entrega.conductor_id,
              kilometraje: payload.kilometraje ?? entrega.kilometraje,
              nivel_combustible: payload.nivelCombustible || entrega.nivel_combustible,
              estado_general: payload.estadoGeneral || entrega.estado_general,
              observaciones: payload.observaciones || null,
              accesorios: payload.accesorios || [],
              documentos: payload.documentos || [],
              danos_encontrados: payload.danosEncontrados || [],
              evidencias: payload.evidencias || [],
              recibido_por: actorId,
              condicion_moto: payload.condicionMoto || 'disponible',
              snapshot_entrega: snapshot,
              estado: 'borrador',
            };
            return from(
              sb.from('devoluciones').select('*').eq('contrato_id', contratoId).eq('estado', 'borrador').maybeSingle(),
            ).pipe(
              switchMap(({ data: borrador }) => {
                if (borrador) {
                  return from(
                    sb.from('devoluciones').update(body).eq('id', borrador.id).select('*').single(),
                  );
                }
                return from(sb.from('devoluciones').insert(body).select('*').single());
              }),
              map(({ data, error: e3 }) => {
                if (e3 || !data) throw e3 || new Error('No se pudo guardar devolución');
                return this.mapDevolucion(data);
              }),
            );
          }),
        );
      }),
    );
  }

  confirmarDevolucion(id: string) {
    const sb = getSupabase();
    return from(sb.from('devoluciones').select('*').eq('id', id).single()).pipe(
      switchMap(({ data: dev, error }) => {
        if (error || !dev) return throwError(() => ({ error: { message: 'Devolución no encontrada' } }));
        if (dev.estado !== 'borrador') {
          return throwError(() => ({ error: { message: 'Solo borrador se confirma' } }));
        }
        return from(
          sb
            .from('devoluciones')
            .update({ estado: 'confirmada', confirmada_en: new Date().toISOString() })
            .eq('id', id)
            .select('*')
            .single(),
        ).pipe(
          switchMap(({ data: conf, error: e2 }) => {
            if (e2 || !conf) return throwError(() => ({ error: { message: e2?.message || 'Error' } }));
            return this.contratos
              .finalizarDesdeDevolucion(conf.contrato_id, conf.condicion_moto)
              .pipe(
                switchMap((contrato) =>
                  from(
                    sb
                      .from('depositos')
                      .update({ estado: 'en_liquidacion' })
                      .eq('contrato_id', conf.contrato_id)
                      .select('*')
                      .maybeSingle(),
                  ).pipe(
                    switchMap(({ data: dep }) => {
                      if (!dep) {
                        return of({
                          devolucion: this.mapDevolucion(conf),
                          contrato,
                          deposito: null,
                        });
                      }
                      return this.recalcularDeposito(dep.id, true).pipe(
                        map((deposito) => ({
                          devolucion: this.mapDevolucion(conf),
                          contrato,
                          deposito,
                        })),
                      );
                    }),
                  ),
                ),
              );
          }),
        );
      }),
    );
  }
}
