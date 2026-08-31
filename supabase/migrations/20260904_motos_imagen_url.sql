-- =============================================================================
-- motos.imagen_url — URL corta para listas (landing, inventario, contratos)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260903_dashboard_ingresos_egresos.sql si aplica)
--
-- Idempotente.
--
-- Por qué:
--   motos.imagen a veces guarda un data: de varios MB (el upload a Storage
--   falló). Un SELECT de lista o un LIKE sobre imagen obliga a Postgres a
--   leer TODOS esos blobs. La UI se congela minutos y luego pinta.
--
-- Qué hace:
--   1) Columna imagen_url text (URL http pública, corta).
--   2) Backfill: copia imagen → imagen_url SOLO si empieza por http.
--      NO copia data:.
--   3) Las listas de Angular leen SOLO imagen_url. Nunca la columna imagen.
--
-- Qué NO hace:
--   - NO borra motos.imagen (los data: quedan ahí hasta re-subir a Storage).
--   - NO re-ejecuta 20260901.
--   - NO toca RLS de empresa, pagos, mora, talleres ni planes.
-- =============================================================================

alter table public.motos
  add column if not exists imagen_url text;

comment on column public.motos.imagen_url is
  'URL pública corta (Storage). Listas y catálogo leen SOLO esta columna. Nunca un data: ni el blob motos.imagen.';

update public.motos
set imagen_url = imagen
where imagen_url is null
  and imagen is not null
  and imagen like 'http%';

notify pgrst, 'reload schema';
