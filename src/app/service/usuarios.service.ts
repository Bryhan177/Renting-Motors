import { Injectable } from '@angular/core';
import { Observable, from, map, throwError } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { Usuario, CreateUsuarioPayload, ReferenciaPersonal } from '../shared/interfaces/usuario';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private mapRef(prefix: string, row: any): ReferenciaPersonal {
    return {
      nombre: row[`${prefix}_nombre`] || '',
      parentesco: row[`${prefix}_parentesco`] || '',
      telefono: row[`${prefix}_telefono`] || '',
      direccion: row[`${prefix}_direccion`] || '',
    };
  }

  private mapUsuario(row: any): Usuario {
    return {
      _id: row.id,
      nombre: row.nombre,
      apellido: row.apellido,
      email: row.email,
      cedula: row.cedula,
      telefono: row.telefono,
      edad: row.edad ?? null,
      direccion: row.direccion || null,
      uso: row.uso || null,
      tiempoContrato: row.tiempo_contrato || null,
      referencia1: this.mapRef('ref1', row),
      referencia2: this.mapRef('ref2', row),
      rol: row.rol,
      activo: row.activo !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private normalizeRol(rol: string): string {
    const r = (rol || '').toLowerCase().trim();
    if (r === 'admin') return 'administrador';
    if (r === 'asesora') return 'asesor';
    if (r === 'conductor' || r === 'usuario') return 'empleado';
    return r || 'empleado';
  }

  private toDb(usuario: Partial<Usuario> | CreateUsuarioPayload): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (usuario.nombre !== undefined) payload['nombre'] = usuario.nombre;
    if (usuario.apellido !== undefined) payload['apellido'] = usuario.apellido;
    if (usuario.email !== undefined) payload['email'] = usuario.email;
    if (usuario.cedula !== undefined) payload['cedula'] = Number(usuario.cedula);
    if (usuario.telefono !== undefined) payload['telefono'] = String(usuario.telefono);
    if (usuario.edad !== undefined) payload['edad'] = usuario.edad || null;
    if (usuario.direccion !== undefined) payload['direccion'] = usuario.direccion || null;
    if (usuario.uso !== undefined) payload['uso'] = usuario.uso || null;
    if (usuario.tiempoContrato !== undefined) payload['tiempo_contrato'] = usuario.tiempoContrato || null;
    if (usuario.rol !== undefined) payload['rol'] = this.normalizeRol(usuario.rol);
    if (usuario.activo !== undefined) payload['activo'] = usuario.activo;
    const r1 = usuario.referencia1;
    if (r1) {
      payload['ref1_nombre'] = r1.nombre || null;
      payload['ref1_parentesco'] = r1.parentesco || null;
      payload['ref1_telefono'] = r1.telefono || null;
      payload['ref1_direccion'] = r1.direccion || null;
    }
    const r2 = usuario.referencia2;
    if (r2) {
      payload['ref2_nombre'] = r2.nombre || null;
      payload['ref2_parentesco'] = r2.parentesco || null;
      payload['ref2_telefono'] = r2.telefono || null;
      payload['ref2_direccion'] = r2.direccion || null;
    }
    return payload;
  }

  getUsuarios(incluirInactivos = true): Observable<Usuario[]> {
    let q = getSupabase().from('usuarios').select('*').order('created_at', { ascending: false });
    if (!incluirInactivos) q = q.eq('activo', true);
    return from(q).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => this.mapUsuario(r));
      }),
    );
  }

  getUsuario(id: string): Observable<Usuario> {
    return from(getSupabase().from('usuarios').select('*').eq('id', id).single()).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('Usuario no encontrado');
        return this.mapUsuario(data);
      }),
    );
  }

  createUsuario(usuario: CreateUsuarioPayload): Observable<Usuario> {
    if (!usuario.password || usuario.password.length < 6) {
      return throwError(() => ({ error: { message: 'Contraseña mínima 6 caracteres' } }));
    }
    const sb = getSupabase();
    const email = usuario.email.toLowerCase().trim();
    return from(
      (async () => {
        const { data: sessionData } = await sb.auth.getSession();
        const adminSession = sessionData.session;
        const { data, error } = await sb.auth.signUp({ email, password: usuario.password! });
        if (error || !data.user) {
          throw { error: { message: error?.message || 'No se pudo crear Auth' } };
        }
        const body = {
          id: data.user.id,
          email,
          ...this.toDb({ ...usuario, rol: this.normalizeRol(usuario.rol) as any }),
          activo: usuario.activo !== false,
        };
        const { data: row, error: err } = await sb.from('usuarios').insert(body).select('*').single();
        if (adminSession) {
          await sb.auth.setSession({
            access_token: adminSession.access_token,
            refresh_token: adminSession.refresh_token,
          });
        }
        if (err || !row) throw err || new Error('No se pudo crear perfil');
        return this.mapUsuario(row);
      })(),
    );
  }

  updateUsuario(id: string, usuario: Partial<Usuario>): Observable<Usuario> {
    return from(
      getSupabase().from('usuarios').update(this.toDb(usuario)).eq('id', id).select('*').maybeSingle(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Sin permiso para actualizar (RLS)');
        return this.mapUsuario(data);
      }),
    );
  }

  deleteUsuario(id: string): Observable<Usuario> {
    return this.updateUsuario(id, { activo: false });
  }

  reactivarUsuario(id: string): Observable<Usuario> {
    return this.updateUsuario(id, { activo: true });
  }
}
