-- =============================================================================
-- motos.imagen: borrar data: (TOAST de varios MB) DESPUÉS de 20260904
-- Ejecutar en: Supabase → SQL Editor → New query → Run
--
-- Idempotente. Correr UNA vez después de 20260904_motos_imagen_url.sql.
-- NO re-ejecutes 20260901.
--
-- ⚠️ Este UPDATE puede tardar 1–2 minutos UNA vez (reescribe TOAST).
--    Después la tabla queda liviana para siempre.
--
-- Qué hace:
--   1) Si hay data: en imagen y ya existe imagen_url http, copia la URL
--      corta a imagen (deja de ser un blob).
--   2) El resto de data: se pone NULL. Motos que SOLO tenían data: (sin
--      imagen_url http) pierden el blob: la UI muestra fallback hasta
--      re-subir la foto a Storage. No se re-ejecuta 20260901.
--
-- VACUUM ANALYZE (opcional):
--   VACUUM no puede ir en la misma transacción que los UPDATE.
--   Si pegas este archivo entero y el editor lo envuelve en BEGIN/COMMIT,
--   un VACUUM al final PUEDE fallar y echar atrás los UPDATE.
--   Por eso VACUUM va COMENTADO. Después de que los UPDATE terminen OK,
--   pega esto SOLO, en otra query:
--     VACUUM ANALYZE public.motos;
--   Si el rol no puede (error), sáltalo: los UPDATE ya bastan.
-- =============================================================================

update public.motos
set imagen = imagen_url
where imagen like 'data:%'
  and imagen_url like 'http%';

update public.motos
set imagen = null
where imagen like 'data:%';

-- VACUUM ANALYZE public.motos;  -- correr SOLO, en otra query, si el rol puede
