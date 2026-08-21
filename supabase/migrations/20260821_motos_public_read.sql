-- Lectura pública de MDD para la landing (solo SELECT).
-- Escritura sigue restringida a usuarios autenticados con perfil activo.

drop policy if exists "motos_public_select" on public.motos;

create policy "motos_public_select"
  on public.motos
  for select
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
