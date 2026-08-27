import { Injectable } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { CreatePlanPayload, Plan } from '../shared/interfaces/plan';
import { FrecuenciaPago } from '../shared/periodo.util';
import { PERIODICIDADES, periodicidadesDe } from '../shared/plan-economia';
import { stripClienteEmpresaId } from '../shared/empresa-scope';

@Injectable({ providedIn: 'root' })
export class PlanesService {
  private map(row: any): Plan {
    const raw: string[] = Array.isArray(row.periodicidades_permitidas)
      ? row.periodicidades_permitidas
      : [];
    const periodicidadesPermitidas = PERIODICIDADES.filter((p) => raw.includes(p)) as FrecuenciaPago[];
    return {
      _id: row.id,
      nombre: row.nombre,
      descripcion: row.descripcion || '',
      condicionesUso: row.condiciones_uso || '',
      periodicidadesPermitidas: periodicidadesPermitidas.length ? periodicidadesPermitidas : ['semanal'],
      valorSugerido: Number(row.valor_sugerido) || 0,
      permiteNegociacion: row.permite_negociacion !== false,
      duracionMinimaMeses: Number(row.duracion_minima_meses) || 3,
      requiereCuotaInicial: !!row.requiere_cuota_inicial,
      activo: row.activo !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toDb(plan: Partial<CreatePlanPayload>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (plan.nombre !== undefined) payload['nombre'] = plan.nombre.trim();
    if (plan.descripcion !== undefined) payload['descripcion'] = plan.descripcion || '';
    if (plan.condicionesUso !== undefined) payload['condiciones_uso'] = plan.condicionesUso || '';
    if (plan.periodicidadesPermitidas !== undefined) {
      payload['periodicidades_permitidas'] = periodicidadesDe({
        periodicidadesPermitidas: plan.periodicidadesPermitidas,
      } as Plan);
    }
    if (plan.valorSugerido !== undefined) payload['valor_sugerido'] = Number(plan.valorSugerido) || 0;
    if (plan.permiteNegociacion !== undefined) payload['permite_negociacion'] = !!plan.permiteNegociacion;
    if (plan.duracionMinimaMeses !== undefined) {
      payload['duracion_minima_meses'] = Number(plan.duracionMinimaMeses) || 3;
    }
    if (plan.requiereCuotaInicial !== undefined) {
      payload['requiere_cuota_inicial'] = !!plan.requiereCuotaInicial;
    }
    if (plan.activo !== undefined) payload['activo'] = !!plan.activo;
    return stripClienteEmpresaId(payload);
  }

  getPlanes(incluirInactivos = true): Observable<Plan[]> {
    let q = getSupabase().from('planes').select('*').order('nombre', { ascending: true });
    if (!incluirInactivos) q = q.eq('activo', true);
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  getActivos(): Observable<Plan[]> {
    return this.getPlanes(false);
  }

  getOne(id: string): Observable<Plan> {
    return from(getSupabase().from('planes').select('*').eq('id', id).single()).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('Plan no encontrado');
        return this.map(data);
      }),
    );
  }

  create(payload: CreatePlanPayload): Observable<Plan> {
    return from(getSupabase().from('planes').insert(this.toDb(payload)).select('*').single()).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo crear el plan');
        return this.map(data);
      }),
    );
  }

  update(id: string, patch: Partial<CreatePlanPayload>): Observable<Plan> {
    return from(
      getSupabase().from('planes').update(this.toDb(patch)).eq('id', id).select('*').single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo actualizar el plan');
        return this.map(data);
      }),
    );
  }

  setActivo(id: string, activo: boolean): Observable<Plan> {
    return this.update(id, { activo });
  }
}
