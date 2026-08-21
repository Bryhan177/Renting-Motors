import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';

export type CategoriaDocumento =
  | 'contrato_plantilla'
  | 'cc_cliente'
  | 'licencia'
  | 'matricula_mdd'
  | 'formulario'
  | 'tecnomecanica'
  | 'soat'
  | 'otro';

export interface Documento {
  _id?: string;
  categoria: CategoriaDocumento;
  nombre: string;
  descripcion?: string | null;
  url: string;
  storagePath?: string | null;
  mimeType?: string;
  conductorId?: string | null;
  motoId?: string | null;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentosService {
  constructor(private auth: AuthService) {}

  private map(row: any): Documento {
    return {
      _id: row.id,
      categoria: row.categoria,
      nombre: row.nombre,
      descripcion: row.descripcion,
      url: row.url,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      conductorId: row.conductor_id,
      motoId: row.moto_id,
      createdAt: row.created_at,
    };
  }

  list(categoria?: CategoriaDocumento): Observable<Documento[]> {
    let q = getSupabase().from('documentos').select('*').order('created_at', { ascending: false });
    if (categoria) q = q.eq('categoria', categoria);
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  upload(payload: {
    file: File;
    categoria: CategoriaDocumento;
    nombre: string;
    descripcion?: string;
    conductorId?: string | null;
    motoId?: string | null;
  }): Observable<Documento> {
    const sb = getSupabase();
    const safe = payload.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${payload.categoria}/${Date.now()}_${safe}`;
    return from(
      sb.storage.from('documentos').upload(path, payload.file, {
        upsert: true,
        contentType: payload.file.type || 'application/pdf',
      }),
    ).pipe(
      switchMap(({ error }) => {
        if (error) throw error;
        const url = sb.storage.from('documentos').getPublicUrl(path).data.publicUrl;
        return from(
          sb
            .from('documentos')
            .insert({
              categoria: payload.categoria,
              nombre: payload.nombre,
              descripcion: payload.descripcion || null,
              url,
              storage_path: path,
              mime_type: payload.file.type || 'application/pdf',
              conductor_id: payload.conductorId || null,
              moto_id: payload.motoId || null,
              subido_por: this.auth.getUserId(),
            })
            .select('*')
            .single(),
        ).pipe(
          map(({ data, error: e2 }) => {
            if (e2 || !data) throw e2 || new Error('No se pudo guardar documento');
            return this.map(data);
          }),
        );
      }),
    );
  }

  eliminar(id: string, storagePath?: string | null): Observable<void> {
    const sb = getSupabase();
    return from(sb.from('documentos').delete().eq('id', id)).pipe(
      switchMap(({ error }) => {
        if (error) throw error;
        if (!storagePath) return from(Promise.resolve(undefined));
        return from(sb.storage.from('documentos').remove([storagePath])).pipe(map(() => void 0));
      }),
    );
  }

  actualizar(
    id: string,
    payload: {
      categoria: CategoriaDocumento;
      nombre: string;
      descripcion?: string;
      conductorId?: string | null;
      motoId?: string | null;
    },
  ): Observable<Documento> {
    return from(
      getSupabase()
        .from('documentos')
        .update({
          categoria: payload.categoria,
          nombre: payload.nombre,
          descripcion: payload.descripcion || null,
          conductor_id: payload.conductorId || null,
          moto_id: payload.motoId || null,
        })
        .eq('id', id)
        .select('*')
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo actualizar');
        return this.map(data);
      }),
    );
  }
}
