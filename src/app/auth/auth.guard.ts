import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { from, map, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { getSupabase } from '../supabase/supabase.client';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return from(auth.ensureSupabaseSession()).pipe(
    switchMap((ok) => {
      if (!ok) {
        return of(router.createUrlTree(['/login']));
      }
      // Recargar rol desde BD si falta en localStorage
      if (!auth.getRole() && auth.getUserId()) {
        return from(
          getSupabase()
            .from('usuarios')
            .select('rol,empresa_id')
            .eq('id', auth.getUserId()!)
            .maybeSingle(),
        ).pipe(
          map(({ data }) => {
            if (data?.rol && typeof window !== 'undefined') {
              localStorage.setItem('userRole', data.rol);
            }
            if (data?.empresa_id && typeof window !== 'undefined') {
              localStorage.setItem('empresaId', data.empresa_id);
            }
            return true as const;
          }),
        );
      }
      return of(true as const);
    }),
  );
};

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return from(auth.ensureSupabaseSession()).pipe(
    map((ok) => {
      if (!ok) {
        return router.createUrlTree(['/login']);
      }
      const roles = (route.data['roles'] as string[]) || [];
      const role = auth.getRole();
      if (roles.length === 0 || (role && roles.includes(role))) {
        return true;
      }
      return router.createUrlTree([role === 'empleado' ? '/empleados' : '/dashboard']);
    }),
  );
};
