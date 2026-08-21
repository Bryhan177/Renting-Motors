import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, from, switchMap, map, throwError } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { Usuario, CreateUsuarioPayload } from '../shared/interfaces/usuario';

export interface AuthResponse {
  access_token: string;
  usuario: Usuario;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'access_token';

  constructor(private router: Router) {}

  login(email: string, password: string): Observable<AuthResponse> {
    const sb = getSupabase();
    return from(sb.auth.signInWithPassword({ email, password })).pipe(
      switchMap(({ data, error }) => {
        if (error || !data.session || !data.user) {
          return throwError(() => ({ error: { message: error?.message || 'Credenciales inválidas' } }));
        }
        return this.loadProfile(data.user.id, data.session.access_token);
      }),
      map((res) => {
        this.persistSession(res);
        return res;
      }),
    );
  }

  register(payload: CreateUsuarioPayload): Observable<AuthResponse> {
    if (!payload.password) {
      return throwError(() => ({ error: { message: 'La contraseña es requerida' } }));
    }
    const sb = getSupabase();
    const email = payload.email.toLowerCase().trim();
    return from(
      sb.auth.signUp({
        email,
        password: payload.password,
      }),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data.user) {
          return throwError(() => ({ error: { message: error?.message || 'No se pudo registrar' } }));
        }
        const userId = data.user.id;
        // Público siempre entra como conductor; staff cambia el rol en el panel.
        return from(
          sb
            .from('usuarios')
            .insert({
              id: userId,
              nombre: payload.nombre,
              apellido: payload.apellido,
              email,
              cedula: Number(payload.cedula),
              telefono: String(payload.telefono),
              edad: payload.edad ?? null,
              rol: 'empleado',
              activo: payload.activo !== false,
            })
            .select('*')
            .single(),
        ).pipe(
          switchMap(({ data: profile, error: profileError }) => {
            if (profileError || !profile) {
              return throwError(() => ({
                error: { message: profileError?.message || 'No se pudo crear el perfil' },
              }));
            }
            const token = data.session?.access_token || '';
            const usuario = this.mapUsuario(profile);
            const res: AuthResponse = { access_token: token, usuario };
            this.persistSession(res);
            return from(Promise.resolve(res));
          }),
        );
      }),
    );
  }

  logout(): void {
    const sb = getSupabase();
    void sb.auth.signOut();
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    this.router.navigate(['/login']);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.tokenKey);
  }

  getRole(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('userRole');
  }

  getUserId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('userId');
  }

  redirectByRole(rol: string): void {
    switch (rol) {
      case 'administrador':
      case 'asesor':
        this.router.navigate(['/dashboard']);
        break;
      case 'empleado':
        this.router.navigate(['/empleados']);
        break;
      default:
        this.router.navigate(['/']);
    }
  }

  private loadProfile(userId: string, accessToken: string): Observable<AuthResponse> {
    const sb = getSupabase();
    return from(
      sb.from('usuarios').select('*').eq('id', userId).maybeSingle(),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) {
          return throwError(() => ({ error: { message: error.message } }));
        }
        if (!data) {
          return throwError(() => ({
            error: {
              message:
                'Usuario autenticado sin perfil en usuarios. Completa el registro o crea el perfil.',
            },
          }));
        }
        if (data.activo === false) {
          return throwError(() => ({ error: { message: 'Usuario inactivo' } }));
        }
        return from(
          Promise.resolve({
            access_token: accessToken,
            usuario: this.mapUsuario(data),
          } as AuthResponse),
        );
      }),
    );
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
      rol: row.rol,
      activo: row.activo !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private persistSession(res: AuthResponse): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.tokenKey, res.access_token);
    localStorage.setItem('userId', res.usuario._id || '');
    localStorage.setItem('userRole', res.usuario.rol);
    localStorage.setItem(
      'userName',
      `${res.usuario.nombre} ${res.usuario.apellido || ''}`.trim(),
    );
  }
}
