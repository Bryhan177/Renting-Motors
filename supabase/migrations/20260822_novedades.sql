-- Novedades / reportes de incidente del conductor
-- Ejecutar en Supabase SQL Editor después de mdd_completo.

create table if not exists public.novedades (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.usuarios(id) on delete cascade,
  moto_id uuid references public.motos(id) on delete set null,
  tipo text not null check (tipo in ('pinchazo', 'choque', 'falla', 'documento', 'pago', 'otro')),
  titulo text not null,
  descripcion text not null,
  foto text,
  estado text not null default 'abierta'
    check (estado in ('abierta', 'en_proceso', 'resuelta', 'cerrada')),
  respuesta_staff text,
  atendido_por uuid references public.usuarios(id),
  atendido_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_novedades_conductor on public.novedades (conductor_id);
create index if not exists idx_novedades_estado on public.novedades (estado);
create index if not exists idx_novedades_created on public.novedades (created_at desc);

alter table public.novedades enable row level security;

drop policy if exists "novedades_staff_all" on public.novedades;
create policy "novedades_staff_all" on public.novedades
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

drop policy if exists "novedades_empleado_select" on public.novedades;
create policy "novedades_empleado_select" on public.novedades
  for select to authenticated
  using (public.es_empleado() and conductor_id = auth.uid());

drop policy if exists "novedades_empleado_insert" on public.novedades;
create policy "novedades_empleado_insert" on public.novedades
  for insert to authenticated
  with check (public.es_empleado() and conductor_id = auth.uid());

grant select, insert, update, delete on public.novedades to authenticated;
