-- =============================================================================
-- MVP FUNCIONAL — GoRenting / control-motos
-- Ejecutar UNA vez en: Supabase → SQL Editor → Run
-- Incluye: tablas operativas + storage + RLS que no bloquea a admin/asesor
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- TABLAS
-- -----------------------------------------------------------------------------
create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.usuarios(id),
  moto_id uuid not null references public.motos(id),
  fecha_inicio date not null,
  fecha_fin date,
  cuota_semanal numeric(12,0) not null default 180000,
  deposito_pactado numeric(12,0) not null default 300000,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'activo', 'finalizado', 'anulado')),
  saldo_a_favor numeric(12,0) not null default 0,
  activado_en timestamptz,
  finalizado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contratos_un_activo_conductor
  on public.contratos (conductor_id) where (estado = 'activo');
create unique index if not exists contratos_un_activo_moto
  on public.contratos (moto_id) where (estado = 'activo');

create table if not exists public.cobros (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  conductor_id uuid not null references public.usuarios(id),
  moto_id uuid not null references public.motos(id),
  numero_periodo int not null check (numero_periodo >= 1),
  periodo_inicio date not null,
  periodo_fin date not null,
  fecha_vencimiento date not null,
  monto_esperado numeric(12,0) not null,
  monto_pagado numeric(12,0) not null default 0,
  saldo numeric(12,0) not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'parcial', 'pagado', 'anulado')),
  en_mora boolean not null default false,
  justificacion_mora text,
  generado_por uuid references public.usuarios(id),
  generado_en timestamptz not null default now(),
  anulado_por uuid references public.usuarios(id),
  anulado_en timestamptz,
  motivo_anulacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contrato_id, numero_periodo)
);

create table if not exists public.abonos (
  id uuid primary key default gen_random_uuid(),
  cobro_id uuid not null references public.cobros(id) on delete cascade,
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  conductor_id uuid not null references public.usuarios(id),
  monto numeric(12,0) not null check (monto > 0),
  fecha_pago timestamptz not null default now(),
  metodo_pago text not null default 'TRANSFERENCIA',
  referencia text,
  comprobante text,
  responsable_id uuid not null references public.usuarios(id),
  origen_abono text not null check (origen_abono in ('admin', 'conductor', 'sistema')),
  estado text not null default 'registrado'
    check (estado in ('pendiente_confirmacion', 'registrado', 'anulado')),
  observaciones text,
  confirmado_por uuid references public.usuarios(id),
  confirmado_en timestamptz,
  anulado_por uuid references public.usuarios(id),
  anulado_en timestamptz,
  motivo_anulacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.depositos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null unique references public.contratos(id) on delete cascade,
  conductor_id uuid not null references public.usuarios(id),
  moto_id uuid not null references public.motos(id),
  monto_esperado numeric(12,0) not null default 0,
  monto_recibido numeric(12,0) not null default 0,
  monto_devuelto numeric(12,0) not null default 0,
  monto_retenido numeric(12,0) not null default 0,
  saldo_pendiente numeric(12,0) not null default 0,
  saldo_en_custodia numeric(12,0) not null default 0,
  estado text not null default 'pendiente'
    check (estado in (
      'pendiente', 'parcial', 'recibido', 'en_liquidacion',
      'devuelto', 'parcialmente_devuelto', 'retenido', 'anulado'
    )),
  fecha_recepcion_completa timestamptz,
  observaciones text,
  liquidado_en timestamptz,
  liquidado_por uuid references public.usuarios(id),
  motivo_liquidacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.movimientos_deposito (
  id uuid primary key default gen_random_uuid(),
  deposito_id uuid not null references public.depositos(id) on delete cascade,
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  tipo text not null check (tipo in ('recepcion', 'devolucion', 'retencion')),
  monto numeric(12,0) not null check (monto > 0),
  fecha timestamptz not null default now(),
  metodo_pago text not null default 'TRANSFERENCIA',
  referencia text,
  comprobante text,
  responsable_id uuid not null references public.usuarios(id),
  estado text not null default 'registrado' check (estado in ('registrado', 'anulado')),
  observaciones text,
  anulado_por uuid references public.usuarios(id),
  anulado_en timestamptz,
  motivo_anulacion text,
  created_at timestamptz not null default now()
);

create table if not exists public.entregas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  moto_id uuid not null references public.motos(id),
  conductor_id uuid not null references public.usuarios(id),
  fecha_hora timestamptz not null default now(),
  kilometraje numeric(12,0) not null default 0,
  nivel_combustible text not null default '1/2'
    check (nivel_combustible in ('vacio', '1/4', '1/2', '3/4', 'lleno')),
  estado_general text not null default 'bueno'
    check (estado_general in ('bueno', 'regular', 'malo')),
  observaciones text,
  accesorios jsonb not null default '[]'::jsonb,
  documentos jsonb not null default '[]'::jsonb,
  danos_preexistentes jsonb not null default '[]'::jsonb,
  evidencias text[] not null default '{}',
  registrado_por uuid not null references public.usuarios(id),
  estado text not null default 'borrador'
    check (estado in ('borrador', 'confirmada', 'anulada')),
  confirmada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists entregas_un_confirmada_contrato
  on public.entregas (contrato_id) where (estado = 'confirmada');

create table if not exists public.devoluciones (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  entrega_id uuid not null references public.entregas(id),
  moto_id uuid not null references public.motos(id),
  conductor_id uuid not null references public.usuarios(id),
  fecha_hora timestamptz not null default now(),
  kilometraje numeric(12,0) not null default 0,
  nivel_combustible text not null default '1/2'
    check (nivel_combustible in ('vacio', '1/4', '1/2', '3/4', 'lleno')),
  estado_general text not null default 'bueno'
    check (estado_general in ('bueno', 'regular', 'malo')),
  observaciones text,
  accesorios jsonb not null default '[]'::jsonb,
  documentos jsonb not null default '[]'::jsonb,
  danos_encontrados jsonb not null default '[]'::jsonb,
  evidencias text[] not null default '{}',
  recibido_por uuid not null references public.usuarios(id),
  condicion_moto text not null default 'disponible'
    check (condicion_moto in ('disponible', 'en_mantenimiento', 'fuera_servicio')),
  snapshot_entrega jsonb,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'confirmada', 'anulada')),
  confirmada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists devoluciones_un_confirmada_contrato
  on public.devoluciones (contrato_id) where (estado = 'confirmada');

-- -----------------------------------------------------------------------------
-- NORMALIZAR ROLES EXISTENTES
-- -----------------------------------------------------------------------------
update public.usuarios
set rol = case lower(trim(rol::text))
  when 'admin' then 'administrador'
  when 'administrador' then 'administrador'
  when 'asesor' then 'asesor'
  when 'asesora' then 'asesor'
  when 'empleado' then 'empleado'
  when 'conductor' then 'empleado'
  when 'usuario' then 'empleado'
  else lower(trim(rol::text))
end
where rol is not null;

update public.usuarios set activo = true where activo is null;

-- -----------------------------------------------------------------------------
-- HELPERS RLS (con GRANT — sin esto las policies fallan en silencio)
-- -----------------------------------------------------------------------------
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
      and lower(trim(u.rol::text)) in ('administrador', 'asesor')
  );
$$;

create or replace function public.es_empleado()
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
      and lower(trim(u.rol::text)) = 'empleado'
  );
$$;

-- Fase staff-only: autenticado con perfil activo (admin/asesor/empleado).
-- Cuando entren conductores masivos, se endurece quitando esta función de policies.
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

grant execute on function public.es_staff() to authenticated, anon, service_role;
grant execute on function public.es_empleado() to authenticated, anon, service_role;
grant execute on function public.es_usuario_activo() to authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- STORAGE
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('motos', 'motos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (policyname ilike '%motos%' or policyname ilike '%comprobantes%')
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

create policy "motos_public_read"
  on storage.objects for select
  using (bucket_id = 'motos');

create policy "motos_auth_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'motos' and public.es_usuario_activo());

create policy "motos_auth_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'motos' and public.es_usuario_activo());

create policy "motos_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'motos' and public.es_usuario_activo());

create policy "comprobantes_auth_all"
  on storage.objects for all to authenticated
  using (bucket_id = 'comprobantes' and public.es_usuario_activo())
  with check (bucket_id = 'comprobantes' and public.es_usuario_activo());

-- -----------------------------------------------------------------------------
-- LIMPIAR Y RECREAR RLS EN TABLAS
-- -----------------------------------------------------------------------------
create or replace function public._drop_all_policies(p_table text)
returns void
language plpgsql
as $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = p_table
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, p_table);
  end loop;
end;
$$;

select public._drop_all_policies('usuarios');
select public._drop_all_policies('motos');
select public._drop_all_policies('pagos');
select public._drop_all_policies('contratos');
select public._drop_all_policies('cobros');
select public._drop_all_policies('abonos');
select public._drop_all_policies('depositos');
select public._drop_all_policies('movimientos_deposito');
select public._drop_all_policies('entregas');
select public._drop_all_policies('devoluciones');

alter table public.usuarios enable row level security;
alter table public.motos enable row level security;
alter table public.pagos enable row level security;
alter table public.contratos enable row level security;
alter table public.cobros enable row level security;
alter table public.abonos enable row level security;
alter table public.depositos enable row level security;
alter table public.movimientos_deposito enable row level security;
alter table public.entregas enable row level security;
alter table public.devoluciones enable row level security;

-- USUARIOS: staff gestiona todo; cada uno lee/crea su perfil
create policy "usuarios_staff_all" on public.usuarios
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

create policy "usuarios_self_select" on public.usuarios
  for select to authenticated
  using (id = auth.uid());

create policy "usuarios_self_insert" on public.usuarios
  for insert to authenticated
  with check (id = auth.uid());

create policy "usuarios_self_update" on public.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- MOTOS: staff full; conductor ve la suya
create policy "motos_staff_all" on public.motos
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

create policy "motos_empleado_select" on public.motos
  for select to authenticated
  using (conductor_id = auth.uid());

-- PAGOS legacy
create policy "pagos_staff_all" on public.pagos
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

create policy "pagos_empleado_own" on public.pagos
  for all to authenticated
  using (conductor_id = auth.uid())
  with check (conductor_id = auth.uid());

-- Operación: staff full
create policy "contratos_staff_all" on public.contratos
  for all to authenticated using (public.es_staff()) with check (public.es_staff());
create policy "contratos_empleado_select" on public.contratos
  for select to authenticated using (conductor_id = auth.uid());

create policy "cobros_staff_all" on public.cobros
  for all to authenticated using (public.es_staff()) with check (public.es_staff());
create policy "cobros_empleado_select" on public.cobros
  for select to authenticated using (conductor_id = auth.uid());

create policy "abonos_staff_all" on public.abonos
  for all to authenticated using (public.es_staff()) with check (public.es_staff());
create policy "abonos_empleado_own" on public.abonos
  for all to authenticated
  using (conductor_id = auth.uid())
  with check (conductor_id = auth.uid());

create policy "depositos_staff_all" on public.depositos
  for all to authenticated using (public.es_staff()) with check (public.es_staff());
create policy "depositos_empleado_select" on public.depositos
  for select to authenticated using (conductor_id = auth.uid());

create policy "movimientos_deposito_staff_all" on public.movimientos_deposito
  for all to authenticated using (public.es_staff()) with check (public.es_staff());

create policy "entregas_staff_all" on public.entregas
  for all to authenticated using (public.es_staff()) with check (public.es_staff());
create policy "devoluciones_staff_all" on public.devoluciones
  for all to authenticated using (public.es_staff()) with check (public.es_staff());

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'contratos','cobros','abonos','depositos','entregas','devoluciones','motos','usuarios'
  ]
  loop
    execute format('drop trigger if exists trg_%s_updated on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated before update on public.%I for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Verificación: lista usuarios y si su rol cuenta como staff
-- -----------------------------------------------------------------------------
select
  email,
  rol,
  activo,
  lower(trim(rol::text)) in ('administrador', 'asesor') as cuenta_como_staff
from public.usuarios
order by created_at desc;

notify pgrst, 'reload schema';
