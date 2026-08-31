import { Injectable } from '@angular/core';
import { Observable, from, map, throwError } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import { Usuario } from '../shared/interfaces/usuario';
import { Moto } from '../shared/interfaces/moto';
import { MOTOS_EMBED_SELECT, fotoDesdeImagenUrl } from './motos.service';

export type TipoNovedad = 'pinchazo' | 'choque' | 'falla' | 'documento' | 'pago' | 'otro';
export type EstadoNovedad = 'abierta' | 'en_proceso' | 'resuelta' | 'cerrada';

const NOVEDAD_COLS =
  'id,conductor_id,moto_id,tipo,titulo,descripcion,estado,respuesta_staff,atendido_por,atendido_en,created_at';
const USUARIOS_EMBED = 'usuarios:conductor_id(id,nombre,apellido,email,cedula,telefono,rol,activo)';
const MOTOS_EMBED = `motos:moto_id(${MOTOS_EMBED_SELECT})`;

/** Lista staff/dashboard: sin `foto` (data:) y sin `motos.imagen`. */
export const NOVEDADES_LISTA_SELECT = `${NOVEDAD_COLS},${USUARIOS_EMBED},${MOTOS_EMBED}`;

/** Detalle / alta: incluye `foto` de esa fila (un blob, no toda la tabla). */
export const NOVEDADES_DETALLE_SELECT = `${NOVEDAD_COLS},foto,${USUARIOS_EMBED},${MOTOS_EMBED}`;

export interface Novedad {
  _id?: string;
  conductorId: string;
  motoId?: string | null;
  tipo: TipoNovedad;
  titulo: string;
  descripcion: string;
  foto?: string | null;
  estado: EstadoNovedad;
  respuestaStaff?: string | null;
  atendidoPor?: string | null;
  atendidoEn?: string | null;
  createdAt?: string;
  conductor?: Usuario;
  moto?: Moto;
}

@Injectable({ providedIn: 'root' })
export class NovedadesService {
  constructor(private auth: AuthService) {}

  private mapUsuario(row: any): Usuario | undefined {
    if (!row) return undefined;
    return {
      _id: row.id,
      nombre: row.nombre,
      apellido: row.apellido,
      email: row.email || '',
      cedula: row.cedula || 0,
      telefono: row.telefono || '',
      rol: row.rol || 'empleado',
      activo: row.activo !== false,
    };
  }

  private mapMoto(row: any): Moto | undefined {
    if (!row) return undefined;
    const foto = fotoDesdeImagenUrl(row);
    return {
      _id: row.id,
      marca: row.marca,
      modelo: row.modelo,
      placa: row.placa,
      precio: Number(row.precio) || 0,
      estado: row.estado,
      imagen: foto,
      imagenUrl: foto,
    };
  }

  private map(row: any): Novedad {
    return {
      _id: row.id,
      conductorId: row.conductor_id,
      motoId: row.moto_id,
      tipo: row.tipo,
      titulo: row.titulo,
      descripcion: row.descripcion,
      foto: row.foto,
      estado: row.estado,
      respuestaStaff: row.respuesta_staff,
      atendidoPor: row.atendido_por,
      atendidoEn: row.atendido_en,
      createdAt: row.created_at,
      conductor: this.mapUsuario(row.usuarios),
      moto: this.mapMoto(row.motos),
    };
  }

  list(params?: { estado?: EstadoNovedad; conductorId?: string; conFoto?: boolean }): Observable<Novedad[]> {
    const columns = params?.conFoto ? NOVEDADES_DETALLE_SELECT : NOVEDADES_LISTA_SELECT;
    let q = getSupabase().from('novedades').select(columns).order('created_at', { ascending: false });
    if (params?.estado) q = q.eq('estado', params.estado);
    if (params?.conductorId) q = q.eq('conductor_id', params.conductorId);
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.map(r));
      }),
    );
  }

  crear(payload: {
    tipo: TipoNovedad;
    titulo: string;
    descripcion: string;
    motoId?: string | null;
    foto?: string | null;
  }): Observable<Novedad> {
    const conductorId = this.auth.getUserId();
    if (!conductorId) return throwError(() => ({ error: { message: 'Sin sesión' } }));
    return from(
      getSupabase()
        .from('novedades')
        .insert({
          conductor_id: conductorId,
          moto_id: payload.motoId || null,
          tipo: payload.tipo,
          titulo: payload.titulo.trim(),
          descripcion: payload.descripcion.trim(),
          foto: payload.foto || null,
          estado: 'abierta',
        })
        .select(NOVEDADES_DETALLE_SELECT)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo registrar la novedad');
        return this.map(data);
      }),
    );
  }

  actualizarEstado(
    id: string,
    payload: { estado: EstadoNovedad; respuestaStaff?: string },
  ): Observable<Novedad> {
    const actorId = this.auth.getUserId();
    const update: Record<string, unknown> = {
      estado: payload.estado,
      updated_at: new Date().toISOString(),
    };
    if (payload.respuestaStaff !== undefined) {
      update['respuesta_staff'] = payload.respuestaStaff || null;
    }
    if (payload.estado === 'en_proceso' || payload.estado === 'resuelta' || payload.estado === 'cerrada') {
      update['atendido_por'] = actorId;
      update['atendido_en'] = new Date().toISOString();
    }
    return from(
      getSupabase()
        .from('novedades')
        .update(update)
        .eq('id', id)
        .select(NOVEDADES_LISTA_SELECT)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('No se pudo actualizar');
        return this.map(data);
      }),
    );
  }
}
