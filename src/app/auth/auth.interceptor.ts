import { HttpInterceptorFn } from '@angular/common/http';

/** Con Supabase el cliente JS usa su propia sesión; este interceptor solo aplica a llamadas Nest. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (typeof window === 'undefined') {
    return next(req);
  }
  if (req.url.includes('supabase.co')) {
    return next(req);
  }
  const token = localStorage.getItem('access_token');
  if (!token) {
    return next(req);
  }
  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
