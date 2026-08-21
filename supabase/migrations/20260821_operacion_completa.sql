-- =============================================================================
-- GoRenting / control-motos — esquema operativo en Supabase
-- Ejecutar completo en: Dashboard → SQL Editor → New query → Run
-- =============================================================================
-- Flujo:
--   Contrato borrador → Entrega borrador → Confirmar entrega
--     → Contrato activo + Moto en_uso + primer cobro + Depósito
--   Cobro → Abono → Mora  ||  Depósito → Movimiento → Liquidación
--   Devolución → Contrato finalizado + Moto condición + Depósito en_liquidacion
-- =============================================================================

-- Extensiones
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- CONTRATOS
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
create index if not exists contratos_estado_idx on public.contratos (estado);

-- -----------------------------------------------------------------------------
-- COBROS (cuotas semanales por contrato)
-- -----------------------------------------------------------------------------
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

create index if not exists cobros_conductor_mora_idx on public.cobros (conductor_id, en_mora);
create index if not exists cobros_estado_venc_idx on public.cobros (estado, fecha_vencimiento);

-- -----------------------------------------------------------------------------
-- ABONOS
-- -----------------------------------------------------------------------------
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

create index if not exists abonos_cobro_estado_idx on public.abonos (cobro_id, estado);

-- -----------------------------------------------------------------------------
-- DEPÓSITOS + MOVIMIENTOS
-- -----------------------------------------------------------------------------
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

create index if not exists mov_dep_deposito_idx on public.movimientos_deposito (deposito_id, created_at desc);

-- -----------------------------------------------------------------------------
-- ENTREGAS / DEVOLUCIONES (actas)
-- -----------------------------------------------------------------------------
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
-- STORAGE: fotos de motos (+ comprobantes opcionales)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('motos', 'motos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

-- Políticas storage (staff autenticado)
drop policy if exists "motos_public_read" on storage.objects;
create policy "motos_public_read"
  on storage.objects for select
  using (bucket_id = 'motos');

drop policy if exists "motos_auth_write" on storage.objects;
create policy "motos_auth_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'motos');

drop policy if exists "motos_auth_update" on storage.objects;
create policy "motos_auth_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'motos');

drop policy if exists "motos_auth_delete" on storage.objects;
create policy "motos_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'motos');

drop policy if exists "comprobantes_auth_all" on storage.objects;
create policy "comprobantes_auth_all"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'comprobantes')
  with check (bucket_id = 'comprobantes');

-- -----------------------------------------------------------------------------
-- RLS: por ahora staff (admin/asesor) opera todo; conductores vendrán después
-- -----------------------------------------------------------------------------
alter table public.contratos enable row level security;
alter table public.cobros enable row level security;
alter table public.abonos enable row level security;
alter table public.depositos enable row level security;
alter table public.movimientos_deposito enable row level security;
alter table public.entregas enable row level security;
alter table public.devoluciones enable row level security;

-- Asegurar RLS también en tablas existentes
alter table public.usuarios enable row level security;
alter table public.motos enable row level security;
alter table public.pagos enable row level security;

-- Helper: usuario autenticado es staff
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
      and u.activo is true
      and u.rol in ('administrador', 'asesor')
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
      and u.activo is true
      and u.rol = 'empleado'
  );
$$;

-- USUARIOS
drop policy if exists "usuarios_staff_all" on public.usuarios;
create policy "usuarios_staff_all" on public.usuarios
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

drop policy if exists "usuarios_self_read" on public.usuarios;
create policy "usuarios_self_read" on public.usuarios
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "usuarios_self_insert" on public.usuarios;
create policy "usuarios_self_insert" on public.usuarios
  for insert to authenticated
  with check (id = auth.uid());

-- MOTOS
drop policy if exists "motos_staff_all" on public.motos;
create policy "motos_staff_all" on public.motos
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

drop policy if exists "motos_empleado_read_propia" on public.motos;
create policy "motos_empleado_read_propia" on public.motos
  for select to authenticated
  using (conductor_id = auth.uid() or public.es_staff());

-- PAGOS legacy
drop policy if exists "pagos_staff_all" on public.pagos;
create policy "pagos_staff_all" on public.pagos
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

drop policy if exists "pagos_empleado_own" on public.pagos;
create policy "pagos_empleado_own" on public.pagos
  for all to authenticated
  using (conductor_id = auth.uid() or public.es_staff())
  with check (conductor_id = auth.uid() or public.es_staff());

-- OPERACIÓN NUEVA: staff full; empleado lectura/abonos propios
do $$
declare
  t text;
begin
  foreach t in array array[
    'contratos','cobros','abonos','depositos','movimientos_deposito','entregas','devoluciones'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t||'_staff_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.es_staff()) with check (public.es_staff())',
      t||'_staff_all', t
    );
  end loop;
end $$;

drop policy if exists "contratos_empleado_read" on public.contratos;
create policy "contratos_empleado_read" on public.contratos
  for select to authenticated
  using (conductor_id = auth.uid());

drop policy if exists "cobros_empleado_read" on public.cobros;
create policy "cobros_empleado_read" on public.cobros
  for select to authenticated
  using (conductor_id = auth.uid());

drop policy if exists "abonos_empleado_own" on public.abonos;
create policy "abonos_empleado_own" on public.abonos
  for all to authenticated
  using (conductor_id = auth.uid() or public.es_staff())
  with check (conductor_id = auth.uid() or public.es_staff());

drop policy if exists "depositos_empleado_read" on public.depositos;
create policy "depositos_empleado_read" on public.depositos
  for select to authenticated
  using (conductor_id = auth.uid());

-- -----------------------------------------------------------------------------
-- updated_at trigger genérico
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
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

notify pgrst, 'reload schema';
