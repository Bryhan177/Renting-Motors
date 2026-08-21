-- =============================================================================
-- MDD + usuarios + pagos + mantenimientos + docs + caja
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

-- MOTOS → campos MDD
alter table public.motos add column if not exists precio_compra numeric(14,0) default 0;
alter table public.motos add column if not exists precio_cobro numeric(14,0) default 180000;
alter table public.motos add column if not exists soat date;
alter table public.motos add column if not exists tecnomecanica date;
alter table public.motos add column if not exists aceite text;
alter table public.motos add column if not exists transito_matricula text;
alter table public.motos add column if not exists fecha_ingreso date default current_date;
alter table public.motos add column if not exists pico_y_placa text;
alter table public.motos add column if not exists modalidad text default 'arriendo'
  check (modalidad in ('arriendo', 'liquidacion'));

-- Si precio_compra está vacío, copiar de precio
update public.motos set precio_compra = coalesce(nullif(precio_compra, 0), precio, 0);
update public.motos set precio_cobro = coalesce(nullif(precio_cobro, 0), 180000);

-- USUARIOS extras
alter table public.usuarios add column if not exists edad int;
alter table public.usuarios add column if not exists direccion text;
alter table public.usuarios add column if not exists uso text;
alter table public.usuarios add column if not exists tiempo_contrato text;
alter table public.usuarios add column if not exists ref1_nombre text;
alter table public.usuarios add column if not exists ref1_parentesco text;
alter table public.usuarios add column if not exists ref1_telefono text;
alter table public.usuarios add column if not exists ref1_direccion text;
alter table public.usuarios add column if not exists ref2_nombre text;
alter table public.usuarios add column if not exists ref2_parentesco text;
alter table public.usuarios add column if not exists ref2_telefono text;
alter table public.usuarios add column if not exists ref2_direccion text;

-- PAGOS: campos para registro manual de asesora
alter table public.pagos add column if not exists moto_id uuid references public.motos(id);
alter table public.pagos add column if not exists valor_pagado numeric(14,0);
alter table public.pagos add column if not exists descripcion_gasto text;
alter table public.pagos add column if not exists observaciones text;
alter table public.pagos add column if not exists registrado_por uuid references public.usuarios(id);

update public.pagos set valor_pagado = coalesce(valor_pagado, monto) where valor_pagado is null;

-- MANTENIMIENTOS
create table if not exists public.mantenimientos (
  id uuid primary key default gen_random_uuid(),
  moto_id uuid not null references public.motos(id) on delete cascade,
  valor numeric(14,0) not null default 0,
  fecha_ingreso date not null default current_date,
  fecha_salida date,
  observacion text,
  tipo text default 'general',
  estado text not null default 'en_taller'
    check (estado in ('en_taller', 'finalizado', 'anulado')),
  registrado_por uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FLUJO DE CAJA (bancos MDD y Ahorro MDD)
create table if not exists public.movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  banco text not null check (banco in ('mdd', 'ahorro_mdd')),
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  monto numeric(14,0) not null check (monto > 0),
  fecha date not null default current_date,
  descripcion text,
  moto_id uuid references public.motos(id),
  pago_id uuid,
  mantenimiento_id uuid references public.mantenimientos(id),
  registrado_por uuid references public.usuarios(id),
  created_at timestamptz not null default now()
);

create index if not exists mov_caja_banco_fecha_idx on public.movimientos_caja (banco, fecha desc);

-- DOCUMENTOS (contratos PDF, CC, licencia, matrícula)
create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  categoria text not null
    check (categoria in ('contrato_plantilla', 'cc_cliente', 'licencia', 'matricula_mdd', 'otro')),
  nombre text not null,
  descripcion text,
  url text not null,
  storage_path text,
  mime_type text default 'application/pdf',
  conductor_id uuid references public.usuarios(id),
  moto_id uuid references public.motos(id),
  subido_por uuid references public.usuarios(id),
  created_at timestamptz not null default now()
);

-- Storage docs
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do update set public = true;

-- RLS helpers reuse es_usuario_activo / es_staff if exist
create or replace function public.es_usuario_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and coalesce(u.activo, true) = true
  );
$$;

grant execute on function public.es_usuario_activo() to authenticated, anon, service_role;

alter table public.mantenimientos enable row level security;
alter table public.movimientos_caja enable row level security;
alter table public.documentos enable row level security;

do $$
declare t text; pol record;
begin
  foreach t in array array['mantenimientos','movimientos_caja','documentos']
  loop
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.es_usuario_activo()) with check (public.es_usuario_activo())',
      t||'_activo_all', t
    );
  end loop;
end $$;

-- Storage policies documentos
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname='storage' and tablename='objects' and policyname ilike '%documentos%'
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

create policy "documentos_public_read" on storage.objects
  for select using (bucket_id = 'documentos');
create policy "documentos_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and public.es_usuario_activo());
create policy "documentos_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos' and public.es_usuario_activo());
create policy "documentos_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and public.es_usuario_activo());

-- Frecuencia pago si falta
alter table public.contratos
  add column if not exists frecuencia_pago text default 'semanal';

notify pgrst, 'reload schema';
