-- =============================================================================
-- Talleres de confianza GoRenting
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260828_planes_catalogo.sql si aún no lo corriste)
--
-- Idempotente: se puede correr más de una vez.
--
-- Qué hace:
--   1) Crea tabla public.talleres_confianza (catálogo de talleres aliados).
--   2) RLS: staff (administrador/asesor) CRUD completo; autenticados
--      (conductores) solo SELECT de filas con activo = true.
--
-- Qué NO hace (a propósito):
--   - NO siembra talleres. El catálogo vacío es válido.
--   - NO toca planes, contratos, cobros, mora ni dashboard.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) Catálogo
-- -----------------------------------------------------------------------------
create table if not exists public.talleres_confianza (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text not null,
  telefono text not null,
  latitud numeric(10, 7) not null,
  longitud numeric(10, 7) not null,
  horario text not null default '',
  servicios text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talleres_confianza_nombre_no_vacio check (length(trim(nombre)) > 0),
  constraint talleres_confianza_direccion_no_vacia check (length(trim(direccion)) > 0),
  constraint talleres_confianza_telefono_no_vacio check (length(trim(telefono)) > 0),
  constraint talleres_confianza_latitud_rango check (latitud >= -90 and latitud <= 90),
  constraint talleres_confianza_longitud_rango check (longitud >= -180 and longitud <= 180)
);

comment on table public.talleres_confianza is
  'Catálogo de talleres de confianza GoRenting. Staff escribe; conductores autenticados leen los activos.';
comment on column public.talleres_confianza.latitud is
  'Latitud WGS84. Se usa en el pin OSM y en la URL de Cómo llegar (Google Maps, sin API key).';
comment on column public.talleres_confianza.longitud is
  'Longitud WGS84. Se usa en el pin OSM y en la URL de Cómo llegar (Google Maps, sin API key).';
comment on column public.talleres_confianza.servicios is
  'Texto libre (ej. Llantas, aceite, frenos). Visible en el panel del conductor.';
comment on column public.talleres_confianza.activo is
  'Si es false, staff lo sigue viendo; el conductor no.';

create index if not exists talleres_confianza_activo_idx
  on public.talleres_confianza (activo);

create index if not exists talleres_confianza_nombre_idx
  on public.talleres_confianza (nombre);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_talleres_confianza_updated on public.talleres_confianza;
create trigger trg_talleres_confianza_updated
  before update on public.talleres_confianza
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) RLS: staff escribe todo; autenticados leen activos
-- -----------------------------------------------------------------------------
alter table public.talleres_confianza enable row level security;

grant select, insert, update, delete on table public.talleres_confianza to authenticated;

drop policy if exists "talleres_confianza_staff_all" on public.talleres_confianza;
create policy "talleres_confianza_staff_all" on public.talleres_confianza
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

drop policy if exists "talleres_confianza_auth_select_activos" on public.talleres_confianza;
create policy "talleres_confianza_auth_select_activos" on public.talleres_confianza
  for select to authenticated
  using (activo = true);

notify pgrst, 'reload schema';

-- Ejemplo opcional (comentado). El catálogo puede quedar vacío.
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

-- Verificación (opcional, en otra query):
--   select nombre, direccion, telefono, latitud, longitud, horario, servicios, activo
--     from public.talleres_confianza
--     order by nombre;
--   -- staff: ve activos e inactivos
--   -- conductor autenticado: solo activo = true
