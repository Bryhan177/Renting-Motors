import { Injectable } from '@angular/core';
import { Observable, from, map, of, switchMap, throwError } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { DEPOSITO_ESTANDAR } from '../shared/constants';
import { Usuario } from '../shared/interfaces/usuario';
import { Moto } from '../shared/interfaces/moto';
import { FrecuenciaPago } from '../shared/periodo.util';
import {
  ContratoEstado,
  DURACION_MINIMA_MESES,
  duracionMinimaValida,
  fechaFinMinima,
  mensajeErrorContrato,
} from '../shared/contrato.rules';
import { planPermiteFrecuencia, cuotaSugeridaDelPlan } from '../shared/plan-economia';
import { Plan } from '../shared/interfaces/plan';
import { stripClienteEmpresaId } from '../shared/empresa-scope';

export interface Contrato {
  _id?: string;
  conductorId: string | Usuario;
  motoId: string | Moto;
  fechaInicio: string;
  fechaFin?: string | null;
  cuotaSemanal: number;
  depositoPactado: number;
  frecuenciaPago: FrecuenciaPago;
  estado: ContratoEstado;
  saldoAFavor?: number;
  activadoEn?: string | null;
  finalizadoEn?: string | null;
  planId?: string | null;
  planNombre?: string | null;
  cuotaInicial?: number;
  duracionMeses?: number | null;
}

export interface CreateContratoPayload {
  conductorId: string;
  motoId: string;
  fechaInicio: string;
  fechaFin?: string;
  cuotaSemanal: number;
  depositoPactado?: number;
  frecuenciaPago: FrecuenciaPago;
  planId: string;
  planNombre?: string;
  cuotaInicial?: number;
  duracionMeses?: number;
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
      planId: row.plan_id || null,
      planNombre: row.plan_nombre || null,
      cuotaInicial: Number(row.cuota_inicial || 0),
      duracionMeses: row.duracion_meses == null ? null : Number(row.duracion_meses),
    };
  }

  private fail(message: string) {
    return throwError(() => ({ error: { message } }));
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
    const cuota = Number(payload.cuotaSemanal);
    const deposito = payload.depositoPactado ?? DEPOSITO_ESTANDAR;
    const frecuencia = payload.frecuenciaPago;
    const cuotaInicial = Number(payload.cuotaInicial) || 0;
    const duracionMeses = Number(payload.duracionMeses) || DURACION_MINIMA_MESES;
    const fechaFin = payload.fechaFin || fechaFinMinima(payload.fechaInicio, duracionMeses);

    if (!payload.planId) {
      return this.fail('Debes elegir un plan.');
    }
    if (!frecuencia) {
      return this.fail('Debes elegir la frecuencia de pago del plan.');
    }
    if (!Number.isFinite(cuota) || cuota <= 0) {
      return this.fail('Debes indicar el valor pactado del contrato. El plan solo sugiere.');
    }
    if (cuotaInicial < 0) {
      return this.fail('La cuota inicial no puede ser negativa.');
    }
    if (!duracionMinimaValida(payload.fechaInicio, fechaFin, duracionMeses)) {
      return this.fail(`La duración mínima del contrato es ${duracionMeses} meses.`);
    }

    return from(sb.from('planes').select('*').eq('id', payload.planId).single()).pipe(
      switchMap(({ data: planRow, error: planErr }) => {
        if (planErr || !planRow) return this.fail('El plan seleccionado no existe.');
        if (planRow.activo === false) return this.fail('Ese plan está inactivo. Elige otro.');
        const plan: Plan = {
          _id: planRow.id,
          nombre: planRow.nombre,
          descripcion: planRow.descripcion || '',
          condicionesUso: planRow.condiciones_uso || '',
          periodicidadesPermitidas: planRow.periodicidades_permitidas || [],
          valorSugerido: Number(planRow.valor_sugerido) || 0,
          permiteNegociacion: planRow.permite_negociacion !== false,
          duracionMinimaMeses: Number(planRow.duracion_minima_meses) || DURACION_MINIMA_MESES,
          requiereCuotaInicial: !!planRow.requiere_cuota_inicial,
          activo: planRow.activo !== false,
        };
        if (!planPermiteFrecuencia(plan, frecuencia)) {
          return this.fail('Esa frecuencia no está permitida en el plan elegido.');
        }
        if (!plan.permiteNegociacion) {
          const sugerida = cuotaSugeridaDelPlan(plan, frecuencia);
          if (cuota !== sugerida) {
            return this.fail('Este plan no permite negociar el valor. Usa el sugerido o elige otro plan.');
          }
        }
        const minMeses = Math.max(plan.duracionMinimaMeses || DURACION_MINIMA_MESES, DURACION_MINIMA_MESES);
        if (!duracionMinimaValida(payload.fechaInicio, fechaFin, minMeses)) {
          return this.fail(`La duración mínima de este plan es ${minMeses} meses.`);
        }
        return from(
          sb
            .from('contratos')
            .insert(stripClienteEmpresaId({
              conductor_id: payload.conductorId,
              moto_id: payload.motoId,
              fecha_inicio: payload.fechaInicio,
              fecha_fin: fechaFin,
              cuota_semanal: cuota,
              deposito_pactado: deposito,
              frecuencia_pago: frecuencia,
              estado: 'borrador',
              plan_id: plan._id,
              plan_nombre: plan.nombre,
              cuota_inicial: cuotaInicial,
              duracion_meses: duracionMeses,
            }))
            .select('*')
            .single(),
        );
      }),
    ).pipe(
      switchMap(({ data: contrato, error }) => {
        if (error || !contrato) {
          return this.fail(mensajeErrorContrato(error || { message: 'No se pudo crear contrato' }));
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

  /**
   * Activa un contrato en borrador: unicidad la rechaza Postgres (índice parcial)
   * y la moto queda asignada al conductor.
   */
  activar(contratoId: string, _actorId?: string): Observable<Contrato> {
    const sb = getSupabase();
    return from(sb.from('contratos').select('*').eq('id', contratoId).single()).pipe(
      switchMap(({ data: c, error }) => {
        if (error || !c) return this.fail('Contrato no encontrado');
        if (c.estado === 'activo') return this.fail('El contrato ya está activo');
        if (c.estado !== 'borrador') return this.fail('Solo se activa un contrato en borrador');
        return this.assertSinActivoDuplicado(c.conductor_id, c.moto_id, contratoId).pipe(
          switchMap(() =>
            from(
              sb
                .from('contratos')
                .update({ estado: 'activo', activado_en: new Date().toISOString() })
                .eq('id', contratoId)
                .select('*')
                .single(),
            ),
          ),
          switchMap(({ data: act, error: e2 }) => {
            if (e2 || !act) return this.fail(mensajeErrorContrato(e2 || { message: 'No se pudo activar' }));
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

  /** Alias usado por el flujo de entrega (Motos). */
  activarDesdeEntrega(contratoId: string, actorId: string): Observable<Contrato> {
    return this.activar(contratoId, actorId);
  }

  finalizarDesdeDevolucion(
    contratoId: string,
    condicionMoto: 'disponible' | 'en_mantenimiento' | 'fuera_servicio',
  ): Observable<Contrato> {
    const sb = getSupabase();
    return from(sb.from('contratos').select('*').eq('id', contratoId).single()).pipe(
      switchMap(({ data: c, error }) => {
        if (error || !c) return this.fail('Contrato no encontrado');
        if (c.estado !== 'activo') return this.fail('Solo se finaliza un contrato activo');
        return from(
          sb
            .from('contratos')
            .update({
              estado: 'finalizado',
              finalizado_en: new Date().toISOString(),
            })
            .eq('id', contratoId)
            .select('*')
            .single(),
        ).pipe(
          switchMap(({ data: fin, error: e2 }) => {
            if (e2 || !fin) return this.fail(e2?.message || 'No se pudo finalizar');
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

  anular(contratoId: string): Observable<Contrato> {
    const sb = getSupabase();
    return from(sb.from('contratos').select('*').eq('id', contratoId).single()).pipe(
      switchMap(({ data: c, error }) => {
        if (error || !c) return this.fail('Contrato no encontrado');
        if (c.estado !== 'borrador') return this.fail('Solo se anula un contrato en borrador');
        return from(
          sb.from('contratos').update({ estado: 'anulado' }).eq('id', contratoId).select('*').single(),
        ).pipe(
          map(({ data, error: e2 }) => {
            if (e2 || !data) throw e2 || new Error('No se pudo anular');
            return this.map(data);
          }),
        );
      }),
    );
  }

  private assertSinActivoDuplicado(
    conductorId: string,
    motoId: string,
    excludeId: string,
  ): Observable<void> {
    const sb = getSupabase();
    return from(
      Promise.all([
        sb.from('contratos').select('id').eq('estado', 'activo').eq('conductor_id', conductorId),
        sb.from('contratos').select('id').eq('estado', 'activo').eq('moto_id', motoId),
      ]),
    ).pipe(
      switchMap(([condRes, motoRes]) => {
        const otroConductor = (condRes.data || []).some((r: { id: string }) => r.id !== excludeId);
        const otraMoto = (motoRes.data || []).some((r: { id: string }) => r.id !== excludeId);
        if (otroConductor) return this.fail('Ese conductor ya tiene un contrato activo.');
        if (otraMoto) return this.fail('Esa moto ya tiene un contrato activo.');
        return of(undefined);
      }),
    );
  }
}
