import { Injectable } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import {
  CreateTallerPayload,
  TallerConfianza,
  mapTallerFromRow,
  tallerToDb,
} from '../shared/interfaces/taller-confianza';

@Injectable({ providedIn: 'root' })
export class TalleresService {
  getTalleres(incluirInactivos = true): Observable<TallerConfianza[]> {
    let q = getSupabase()
      .from('talleres_confianza')
      .select('*')
      .order('nombre', { ascending: true });
    if (!incluirInactivos) q = q.eq('activo', true);
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => mapTallerFromRow(r));
      }),
    );
  }

  getActivos(): Observable<TallerConfianza[]> {
    return this.getTalleres(false);
  }

  create(payload: CreateTallerPayload): Observable<TallerConfianza> {
    return from(
      getSupabase().from('talleres_confianza').insert(tallerToDb(payload)).select('*').single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo crear el taller');
        return mapTallerFromRow(data);
      }),
    );
  }

  update(id: string, patch: Partial<CreateTallerPayload>): Observable<TallerConfianza> {
    return from(
      getSupabase()
        .from('talleres_confianza')
        .update(tallerToDb(patch))
        .eq('id', id)
        .select('*')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo actualizar el taller');
        return mapTallerFromRow(data);
      }),
    );
  }

  setActivo(id: string, activo: boolean): Observable<TallerConfianza> {
    return this.update(id, { activo });
  }
}
