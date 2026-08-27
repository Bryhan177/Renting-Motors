import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, from, switchMap, map, throwError, of } from 'rxjs';
import { getSupabase, resetSupabaseClient } from '../supabase/supabase.client';
import { Usuario, CreateUsuarioPayload } from '../shared/interfaces/usuario';
import { mapEmpresaIdFromRow } from '../shared/empresa-scope';

export interface AuthResponse {
  access_token: string;
  usuario: Usuario;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'access_token';
  private readonly empresaKey = 'empresaId';
  private sessionReady: Promise<boolean> | null = null;

  constructor(private router: Router) {}

  /**
   * Sincroniza localStorage con la sesión real de Supabase.
   * Evita el caso prod: hay access_token viejo pero RLS no ve JWT → listas vacías.
   */
  ensureSupabaseSession(): Promise<boolean> {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if (!this.sessionReady) {
      this.sessionReady = (async () => {
        const sb = getSupabase();
        const { data } = await sb.auth.getSession();
        if (data.session?.access_token) {
          localStorage.setItem(this.tokenKey, data.session.access_token);
          if (data.session.user?.id) {
            localStorage.setItem('userId', data.session.user.id);
            if (!localStorage.getItem('userRole') || !localStorage.getItem(this.empresaKey)) {
              const { data: profile } = await sb
                .from('usuarios')
                .select('rol,nombre,apellido,empresa_id')
                .eq('id', data.session.user.id)
                .maybeSingle();
              if (profile?.rol) {
                localStorage.setItem('userRole', profile.rol);
                localStorage.setItem(
                  'userName',
                  `${profile.nombre || ''} ${profile.apellido || ''}`.trim(),
                );
              }
              const empresaId = mapEmpresaIdFromRow(profile);
              if (empresaId) localStorage.setItem(this.empresaKey, empresaId);
            }
          }
          return true;
        }
        // Token fantasma en localStorage sin sesión Supabase
        if (localStorage.getItem(this.tokenKey)) {
          localStorage.removeItem(this.tokenKey);
          localStorage.removeItem('userName');
          localStorage.removeItem('userId');
          localStorage.removeItem('userRole');
          localStorage.removeItem(this.empresaKey);
        }
        return false;
      })();
    }
    return this.sessionReady;
  }

  /** Fuerza revalidación en el próximo ensure. */
  invalidateSessionCache(): void {
    this.sessionReady = null;
  }

  login(email: string, password: string): Observable<AuthResponse> {
    const sb = getSupabase();
    this.invalidateSessionCache();
    return from(sb.auth.signInWithPassword({ email, password })).pipe(
      switchMap(({ data, error }) => {
        if (error || !data.session || !data.user) {
          return throwError(() => ({ error: { message: error?.message || 'Credenciales inválidas' } }));
        }
        return this.loadProfile(data.user.id, data.session.access_token);
      }),
      map((res) => {
        this.persistSession(res);
        this.sessionReady = Promise.resolve(true);
        return res;
      }),
    );
  }

  register(payload: CreateUsuarioPayload): Observable<AuthResponse> {
    if (!payload.password) {
      return throwError(() => ({ error: { message: 'La contraseña es requerida' } }));
    }
    const sb = getSupabase();
    this.invalidateSessionCache();
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
                error: {
                  message:
                    'El alta público no asigna empresa. Pide a un administrador de tu operación que te cree la cuenta.',
                },
              }));
            }
            const token = data.session?.access_token || '';
            const usuario = this.mapUsuario(profile);
            const res: AuthResponse = { access_token: token, usuario };
            this.persistSession(res);
            this.sessionReady = Promise.resolve(!!token);
            return of(res);
          }),
        );
      }),
    );
  }

  logout(): void {
    this.invalidateSessionCache();
    const sb = getSupabase();
    void sb.auth.signOut();
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    localStorage.removeItem(this.empresaKey);
    resetSupabaseClient();
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

  /** Membresía del perfil. Extra-safe en queries; RLS es la pared real. No mostrar en UI. */
  getEmpresaId(): string | null {
    if (typeof window === 'undefined') return null;
    return mapEmpresaIdFromRow({ empresa_id: localStorage.getItem(this.empresaKey) });
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
        return of({
          access_token: accessToken,
          usuario: this.mapUsuario(data),
        } as AuthResponse);
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
      empresaId: mapEmpresaIdFromRow(row),
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
    if (res.usuario.empresaId) {
      localStorage.setItem(this.empresaKey, res.usuario.empresaId);
    } else {
      localStorage.removeItem(this.empresaKey);
    }
  }
}
