# SQL pendiente (obligatorio)

Ejecuta en Supabase SQL Editor, en este orden si aún no lo hiciste:

1. `20260821_mvp_funcional.sql` (si no lo corriste)
2. `20260821_emergencia_motos_rls.sql` (si aún fallaba crear MDD)
3. `20260821_frecuencia_pago.sql`
4. **`20260821_mdd_completo.sql`** ← campos MDD, usuarios, pagos manual, caja, mantenimientos, documentos
5. **`20260822_novedades.sql`** ← reportes de novedad del conductor
6. **`20260822_motos_delete_cascade.sql`** ← permite eliminar MDD con historial (sin contrato activo)
7. **`20260826_cobros_finanzas_derivadas.sql`** ← mora, saldo y pagado se calculan en Postgres (Angular solo lee)
8. **`20260827_contratos_unicidad_activa.sql`** ← un conductor / una moto no pueden tener dos contratos activos (índice único parcial); duración mínima 3 meses; al activar se asigna la moto
9. **`20260828_planes_catalogo.sql`** ← catálogo `planes` + snapshot en contrato (`plan_id`, `plan_nombre`, `cuota_inicial`, `duracion_meses`); quita el DEFAULT 180000 de `cuota_semanal`. **No reescribe montos de contratos/cobros existentes. No toca mora.**
10. **`20260829_talleres_confianza.sql`** ← catálogo `talleres_confianza` (staff CRUD; conductor autenticado solo ve `activo = true`). **No siembra filas.** No toca planes, contratos, cobros, mora ni dashboard.

Luego cierra sesión y vuelve a entrar.

## Planes (20260828) — cómo aplicar y probar

1. Abre Supabase → **SQL Editor** → New query.
2. Pega el contenido de `supabase/migrations/20260828_planes_catalogo.sql` → **Run**.
3. Verifica:
   ```sql
   select nombre, valor_sugerido, periodicidades_permitidas, activo from public.planes order by nombre;
   -- Personal 115000, Trabajo 180000, Propietario 0 (a convenir)

   select column_name, column_default
   from information_schema.columns
   where table_schema = 'public' and table_name = 'contratos'
     and column_name in ('cuota_semanal', 'plan_id', 'plan_nombre', 'cuota_inicial', 'duracion_meses');
   -- cuota_semanal.column_default debe ser NULL (ya no 180000)
   ```
4. Contratos viejos: `plan_id` y `plan_nombre` quedan NULL (la UI muestra **Sin plan**). `cuota_semanal` **no cambia**.
5. En la app (admin/asesor): menú **Planes**. Edita, crea, activa/desactiva. Los tres de semilla son editables.
6. **Contratos → Nuevo contrato**:
   - Sin plan no deja guardar.
   - Elige **Personal** → sugerido $115.000 semanal (editable).
   - Elige frecuencia de la lista del plan.
   - El valor que guardes se congela en `contratos.cuota_semanal`.
7. Prueba de no-reescribir: anota la `cuota_semanal` de un contrato viejo. En **Planes**, cambia el `valor_sugerido` de Trabajo o Personal. Recarga el contrato: la cuota pactada **sigue igual**. Los cobros nuevos de ese contrato siguen copiando `contrato.cuota_semanal` (no el plan).

El plan **sugiere**. No hay tarifa global $160.000 / $180.000 para contratos.

## Talleres de confianza (20260829) — cómo aplicar y probar

1. Abre Supabase → **SQL Editor** → New query.
2. Pega el contenido de `supabase/migrations/20260829_talleres_confianza.sql` → **Run**.
3. Verifica:
   ```sql
   select column_name, data_type
   from information_schema.columns
   where table_schema = 'public' and table_name = 'talleres_confianza'
   order by ordinal_position;
   -- nombre, direccion, telefono, latitud, longitud, horario, servicios, activo

   select * from public.talleres_confianza;
   -- vacío es correcto (no hay semilla)
   ```
4. En la app (admin/asesor): menú **Talleres**. Crea un taller con lat/lng (ej. Bogotá 4.7110, −74.0721). Activa/desactiva.
5. Cierra sesión. Entra como **empleado** (conductor) → `/empleados` → **Talleres**. Debe verse solo el activo, con dirección, teléfono, horario, servicios, pin OSM y **Cómo llegar** (Google Maps, sin API key de billing).
6. Desactiva el taller como staff. Recarga el panel del conductor: ya no aparece.
7. (Opcional) Clic derecho en OpenStreetMap para copiar lat/lng. Ejemplo comentado al final del SQL.

```sql
-- insert into public.talleres_confianza
--   (nombre, direccion, telefono, latitud, longitud, horario, servicios, activo)
-- values
--   (
--     'Taller Central GoRenting',
--     'Cra 7 #32-16, Bogotá',
--     '3001234567',
--     4.7110000,
--     -74.0721000,
--     'Lun–Sáb 8:00–18:00',
--     'Llantas, aceite, frenos, diagnóstico',
--     true
--   );
```

## Si en producción no ves usuarios / pagos / caja / documentos

Suele ser **sesión expirada**: el menú te deja entrar (token viejo en localStorage) pero Supabase RLS no recibe JWT y las listas salen vacías.

1. Cierra sesión y vuelve a entrar en prod.
2. Confirma que tu usuario en tabla `usuarios` tiene `rol = administrador` o `asesor` y `activo = true`.
3. Confirma que el deploy usa el mismo `supabaseUrl` / `supabaseKey` que local (`src/environments/environment.ts`).
4. Ejecuta los SQL de arriba en **el mismo** proyecto Supabase de prod.
