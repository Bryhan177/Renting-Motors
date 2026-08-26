-- =============================================================================
-- EMERGENCIA RLS MOTOS — ejecutar YA en SQL Editor
-- Abre motos (y operación) a cualquier usuario autenticado con perfil activo.
-- Fase actual: solo tú y la asesora; luego se endurece.
-- =============================================================================

-- 1) Diagnóstico: ¿el perfil coincide con Auth?
select
  au.id as auth_id,
  au.email as auth_email,
  u.id as perfil_id,
  u.email as perfil_email,
  u.rol,
  u.activo,
  (u.id is not null) as tiene_perfil,
  (u.id = au.id) as ids_coinciden
from auth.users au
left join public.usuarios u on u.id = au.id
order by au.created_at desc;

-- 2) Forzar staff a todos los perfiles que NO sean conductor
--    (ajusta si quieres ser más selectivo)
update public.usuarios
set
  rol = case
    when lower(trim(rol::text)) in ('empleado', 'conductor', 'usuario') then 'empleado'
    else 'administrador'
  end,
  activo = true
where coalesce(activo, true) = true
  and lower(trim(rol::text)) not in ('empleado', 'conductor', 'usuario');

-- Si TU email debe ser admin seguro (cambia el email):
-- update public.usuarios
-- set rol = 'administrador', activo = true
-- where lower(email) = 'tu@email.com';

-- 3) Helper: perfil activo (cualquier rol)
create or replace function public.es_usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and coalesce(u.activo, true) = true
  );
$$;

create or replace function public.es_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and coalesce(u.activo, true) = true
      and lower(trim(u.rol::text)) in ('administrador', 'asesor', 'admin')
  );
$$;

grant execute on function public.es_usuario_activo() to authenticated, anon, service_role;
grant execute on function public.es_staff() to authenticated, anon, service_role;

-- 4) LIMPIAR policies de motos y abrir a autenticados con perfil
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'motos'
  loop
    execute format('drop policy if exists %I on public.motos', pol.policyname);
  end loop;
end $$;

alter table public.motos enable row level security;

-- MVP: cualquier autenticado CON perfil activo puede CRUD motos
create policy "motos_usuario_activo_all"
  on public.motos
  for all
  to authenticated
  using (public.es_usuario_activo())
  with check (public.es_usuario_activo());

-- 5) Mismo arreglo para storage de fotos
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname ilike '%motos%'
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

create policy "motos_public_read"
  on storage.objects for select
  using (bucket_id = 'motos');

create policy "motos_auth_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'motos' and public.es_usuario_activo());

create policy "motos_auth_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'motos' and public.es_usuario_activo());

create policy "motos_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'motos' and public.es_usuario_activo());

notify pgrst, 'reload schema';

-- 6) Confirmación
select email, rol, activo from public.usuarios order by created_at desc;
