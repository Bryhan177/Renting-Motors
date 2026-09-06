-- =============================================================================
-- Catálogo de bancos del Flujo de caja
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260906_resumen_caja.sql / 20260901_multi_tenant_empresas.sql)
--
-- Idempotente: se puede correr más de una vez.
--
-- Por qué: movimientos_caja.banco era un CHECK fijo ('mdd', 'ahorro_mdd').
-- La UI no podía crear ni renombrar bancos (ej. "Deposito DAN78D").
--
-- Qué hace:
--   1) Crea public.bancos_caja (codigo + nombre) por empresa.
--   2) Siembra Banco MDD / Ahorro MDD. ON CONFLICT no pisa nombres editados.
--   3) Quita el CHECK de dos valores. movimientos_caja.banco sigue siendo el
--      codigo (no se reescriben filas). Renombrar solo cambia nombre.
--   4) resumen_caja agrega TODOS los bancos del catálogo + códigos huérfanos.
--   5) RLS staff + misma_empresa (igual que planes / caja).
--
-- Qué NO hace:
--   - NO toca montos, fechas, tipos ni estado de movimientos existentes.
--   - NO cambia el trigger de abonos → caja (sigue banco 'mdd').
--   - NO cambia KPIs del dashboard que recortan mdd / ahorro_mdd.
--   - NO borra bancos. No hay DELETE en la UI.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) Catálogo
-- -----------------------------------------------------------------------------
create table if not exists public.bancos_caja (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  codigo text not null,
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bancos_caja_codigo_no_vacio check (length(trim(codigo)) > 0),
  constraint bancos_caja_nombre_no_vacio check (length(trim(nombre)) > 0)
);

comment on table public.bancos_caja is
  'Catálogo de bancos del Flujo de caja. codigo se guarda en movimientos_caja.banco; nombre es la etiqueta editable.';
comment on column public.bancos_caja.codigo is
  'Identidad estable del banco (mdd, ahorro_mdd, deposito_dan78d, …). No cambia al renombrar.';
comment on column public.bancos_caja.nombre is
  'Etiqueta visible (ej. Banco MDD, Deposito DAN78D). Renombrar no mueve movimientos.';

alter table public.bancos_caja add column if not exists empresa_id uuid references public.empresas(id);
alter table public.bancos_caja add column if not exists codigo text;
alter table public.bancos_caja add column if not exists nombre text;
alter table public.bancos_caja add column if not exists created_at timestamptz not null default now();
alter table public.bancos_caja add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_ensure_empresa_id_column'
  ) then
    perform public._ensure_empresa_id_column('bancos_caja');
  end if;
end $$;

create unique index if not exists bancos_caja_empresa_codigo_uidx
  on public.bancos_caja (empresa_id, codigo);

create unique index if not exists bancos_caja_empresa_nombre_uidx
  on public.bancos_caja (empresa_id, lower(trim(nombre)));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bancos_caja_empresa_codigo_key'
      and conrelid = 'public.bancos_caja'::regclass
  ) then
    alter table public.bancos_caja
      add constraint bancos_caja_empresa_codigo_key unique using index bancos_caja_empresa_codigo_uidx;
  end if;
exception
  when duplicate_object then null;
  when others then
    -- unique index already used or table vacío: el índice cubre ON CONFLICT
    null;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Semilla: los dos bancos que ya existen en movimientos (no pisa ediciones)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'empresas'
  ) then
    insert into public.bancos_caja (empresa_id, codigo, nombre)
    select e.id, v.codigo, v.nombre
    from public.empresas e
    cross join (
      values
        ('mdd'::text, 'Banco MDD'::text),
        ('ahorro_mdd'::text, 'Ahorro MDD'::text)
    ) as v(codigo, nombre)
    on conflict (empresa_id, codigo) do nothing;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3) Triggers: stamp tenant, codigo inmutable al renombrar, updated_at
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

create or replace function public.bancos_caja_preparar()
returns trigger
language plpgsql
as $$
declare
  v_base text;
  v_codigo text;
  v_n int := 1;
begin
  new.nombre := btrim(new.nombre);
  if new.nombre is null or new.nombre = '' then
    raise exception 'El nombre del banco es obligatorio' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.codigo := old.codigo;
    return new;
  end if;

  if new.codigo is null or btrim(new.codigo) = '' then
    v_base := lower(regexp_replace(new.nombre, '[^A-Za-z0-9]+', '_', 'g'));
    v_base := trim(both '_' from v_base);
    if v_base = '' then
      v_base := 'banco';
    end if;
    if length(v_base) > 40 then
      v_base := left(v_base, 40);
    end if;
    v_codigo := v_base;
    while exists (
      select 1
      from public.bancos_caja b
      where b.empresa_id is not distinct from new.empresa_id
        and b.codigo = v_codigo
    ) loop
      v_n := v_n + 1;
      v_codigo := left(v_base, 36) || '_' || v_n::text;
    end loop;
    new.codigo := v_codigo;
  else
    new.codigo := btrim(new.codigo);
  end if;

  return new;
end;
$$;

comment on function public.bancos_caja_preparar() is
  'INSERT: genera codigo desde el nombre si viene vacío. UPDATE: no cambia codigo (los movimientos siguen apuntando al mismo banco).';

drop trigger if exists trg_bancos_caja_01_stamp_empresa on public.bancos_caja;
drop trigger if exists trg_bancos_caja_02_codigo on public.bancos_caja;
drop trigger if exists trg_bancos_caja_03_validar_empresa on public.bancos_caja;
drop trigger if exists trg_bancos_caja_04_updated on public.bancos_caja;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'stamp_empresa_id'
  ) then
    execute $q$
      create trigger trg_bancos_caja_01_stamp_empresa
        before insert or update on public.bancos_caja
        for each row execute function public.stamp_empresa_id()
    $q$;
  end if;

  execute $q$
    create trigger trg_bancos_caja_02_codigo
      before insert or update on public.bancos_caja
      for each row execute function public.bancos_caja_preparar()
  $q$;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'validar_refs_empresa'
  ) then
    execute $q$
      create trigger trg_bancos_caja_03_validar_empresa
        before insert or update on public.bancos_caja
        for each row execute function public.validar_refs_empresa()
    $q$;
  end if;
end $$;

create trigger trg_bancos_caja_04_updated
  before update on public.bancos_caja
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4) RLS: solo staff de la misma empresa
-- -----------------------------------------------------------------------------
alter table public.bancos_caja enable row level security;

grant select, insert, update, delete on table public.bancos_caja to authenticated;

drop policy if exists bancos_caja_staff_all on public.bancos_caja;
create policy bancos_caja_staff_all on public.bancos_caja
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));

-- -----------------------------------------------------------------------------
-- 5) movimientos_caja.banco: deja de ser un enum de 2 valores
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'movimientos_caja'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'banco'
      and pg_get_constraintdef(con.oid) ~* 'ahorro_mdd'
  loop
    execute format('alter table public.movimientos_caja drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.movimientos_caja drop constraint if exists movimientos_caja_banco_no_vacio;
alter table public.movimientos_caja
  add constraint movimientos_caja_banco_no_vacio check (length(trim(banco)) > 0);

comment on column public.movimientos_caja.banco is
  'Codigo del banco (public.bancos_caja.codigo). Histórico: mdd, ahorro_mdd. Renombrar el catálogo no reescribe esta columna.';

-- -----------------------------------------------------------------------------
-- 6) resumen_caja: todos los bancos del catálogo + huérfanos en movimientos
-- -----------------------------------------------------------------------------
create or replace function public.resumen_caja()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_result jsonb;
begin
  if auth.uid() is not null and not public.es_staff() then
    raise exception 'Solo el staff (administrador/asesor) puede consultar el flujo de caja'
      using errcode = '42501';
  end if;

  v_empresa := coalesce(public.empresa_id_actual(), public.empresa_id_produccion());
  if v_empresa is null then
    raise exception 'Sin empresa para el resumen de caja' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x.fila order by x.ord), '[]'::jsonb)
    into v_result
  from (
    select
      b.ord,
      jsonb_build_object(
        'banco', b.banco,
        'ingresos', coalesce((
          select sum(mc.monto)::numeric(14,0)
          from public.movimientos_caja mc
          where mc.empresa_id = v_empresa
            and mc.banco = b.banco
            and mc.tipo = 'ingreso'
            and mc.estado is distinct from 'anulado'
        ), 0),
        'egresos', coalesce((
          select sum(mc.monto)::numeric(14,0)
          from public.movimientos_caja mc
          where mc.empresa_id = v_empresa
            and mc.banco = b.banco
            and mc.tipo = 'egreso'
            and mc.estado is distinct from 'anulado'
        ), 0),
        'saldo',
          coalesce((
            select sum(mc.monto)::numeric(14,0)
            from public.movimientos_caja mc
            where mc.empresa_id = v_empresa
              and mc.banco = b.banco
              and mc.tipo = 'ingreso'
              and mc.estado is distinct from 'anulado'
          ), 0)
          -
          coalesce((
            select sum(mc.monto)::numeric(14,0)
            from public.movimientos_caja mc
            where mc.empresa_id = v_empresa
              and mc.banco = b.banco
              and mc.tipo = 'egreso'
              and mc.estado is distinct from 'anulado'
          ), 0)
      ) as fila
    from (
      select
        row_number() over (
          order by
            case s.codigo
              when 'mdd' then 1
              when 'ahorro_mdd' then 2
              else 3
            end,
            s.nombre
        ) as ord,
        s.codigo as banco
      from (
        select bc.codigo, bc.nombre
        from public.bancos_caja bc
        where bc.empresa_id = v_empresa
        union
        select mc.banco, mc.banco
        from public.movimientos_caja mc
        where mc.empresa_id = v_empresa
          and not exists (
            select 1
            from public.bancos_caja bc
            where bc.empresa_id = v_empresa
              and bc.codigo = mc.banco
          )
      ) s
    ) as b
  ) x;

  return v_result;
end;
$$;

comment on function public.resumen_caja() is
  'Saldo real por banco del catálogo (y códigos huérfanos) de LA EMPRESA del JWT. Suma todas las filas no anuladas. No usa LIMIT. Staff-only.';

revoke all on function public.resumen_caja() from public, anon;
grant execute on function public.resumen_caja() to authenticated, service_role;

notify pgrst, 'reload schema';
