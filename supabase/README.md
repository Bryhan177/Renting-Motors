# SQL pendiente (obligatorio)

Ejecuta en Supabase SQL Editor, en este orden si aún no lo hiciste:

1. `20260821_mvp_funcional.sql` (si no lo corriste)
2. `20260821_emergencia_motos_rls.sql` (si aún fallaba crear MDD)
3. `20260821_frecuencia_pago.sql`
4. **`20260821_mdd_completo.sql`** ← campos MDD, usuarios, pagos manual, caja, mantenimientos, documentos
5. **`20260822_novedades.sql`** ← reportes de novedad del conductor
6. **`20260822_motos_delete_cascade.sql`** ← permite eliminar MDD con historial (sin contrato activo)
7. **`20260826_cobros_finanzas_derivadas.sql`** ← mora, saldo y pagado se calculan en Postgres (Angular solo lee)

Luego cierra sesión y vuelve a entrar.

## Si en producción no ves usuarios / pagos / caja / documentos

Suele ser **sesión expirada**: el menú te deja entrar (token viejo en localStorage) pero Supabase RLS no recibe JWT y las listas salen vacías.

1. Cierra sesión y vuelve a entrar en prod.
2. Confirma que tu usuario en tabla `usuarios` tiene `rol = administrador` o `asesor` y `activo = true`.
3. Confirma que el deploy usa el mismo `supabaseUrl` / `supabaseKey` que local (`src/environments/environment.ts`).
4. Ejecuta los SQL de arriba en **el mismo** proyecto Supabase de prod.
