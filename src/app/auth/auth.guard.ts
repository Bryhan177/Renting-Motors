import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  const roles = (route.data['roles'] as string[]) || [];
  const role = auth.getRole();
  if (roles.length === 0 || (role && roles.includes(role))) {
    return true;
  }
  return router.createUrlTree([
    role === 'empleado' ? '/empleados' : '/dashboard',
  ]);
};
