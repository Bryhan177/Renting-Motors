-- =============================================================================
-- Multi-tenant: empresas + aislamiento RLS (producción vs pruebas)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260831_abono_registrado_pagos_caja.sql)
--
-- Idempotente: se puede correr más de una vez.
-- Si un run anterior falló (42703 empresa_id_actual, o 42883 name[] = text[]
-- al soltar unique de placa/cédula), NO hagas DROP de empresas: vuelve a pegar
-- este archivo completo y Run. Las dos empresas sembradas se conservan.
--
-- Por qué: hoy todo el staff y los conductores comparten un solo dataset.
-- El dueño necesita un login de PRUEBAS que no vea ni mute cobros/abonos/
-- contratos/caja reales.
--
-- Qué hace:
--   1) Tabla public.empresas. Siembra GoRenting (producción) y GoRenting Pruebas.
--   2) empresa_id NOT NULL en tablas operativas. Backfill de filas existentes
--      → producción. NUNCA se borran filas financieras.
--   3) Membresía: usuarios.empresa_id. Helper empresa_id_actual() para RLS.
--   4) Inserts autenticados pisan empresa_id con la membresía (no se acepta un
--      id enviado por el cliente).
--   5) Unicidad por empresa (contrato activo, nombre de plan, placa, cédula).
--   6) RLS + RPC resumen_dashboard / estado_cuenta_conductor / resumen_cobros
--      filtrados por empresa_id_actual() — un admin de pruebas no suma ingresos
--      de producción. cobro_en_mora() no cambia.
--
-- Qué NO hace:
--   - NO borra cobros/abonos/pagos/caja (anulado sigue siendo la baja lógica).
--   - NO reescribe cuota_semanal ni montos de cobros.
--   - NO cambia la fórmula de mora, el wizard, ni la UX de talleres/planes
--     (solo los aísla por empresa).
--   - NO hay signup público ni selector de tenant en Angular.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) Empresas
-- -----------------------------------------------------------------------------
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresas_nombre_no_vacio check (length(trim(nombre)) > 0),
  constraint empresas_nombre_key unique (nombre)
);

comment on table public.empresas is
  'Tenant. En este slice cada auth user pertenece a exactamente una empresa.';

drop trigger if exists trg_empresas_updated on public.empresas;
create trigger trg_empresas_updated
  before update on public.empresas
  for each row
  execute function public.set_updated_at();

insert into public.empresas (nombre, activa)
values
  ('GoRenting', true),
  ('GoRenting Pruebas', true)
on conflict (nombre) do nothing;

create or replace function public.empresa_id_produccion()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.empresas e
  where e.nombre = 'GoRenting'
  order by e.created_at
  limit 1
$$;

create or replace function public.empresa_id_pruebas()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.empresas e
  where e.nombre = 'GoRenting Pruebas'
  order by e.created_at
  limit 1
$$;

grant execute on function public.empresa_id_produccion() to authenticated, anon, service_role;
grant execute on function public.empresa_id_pruebas() to authenticated, anon, service_role;

-- empresa_id_actual() / misma_empresa() se crean DESPUÉS de añadir usuarios.empresa_id.
-- LANGUAGE SQL valida columnas en CREATE FUNCTION (42703 si el helper va primero).

-- -----------------------------------------------------------------------------
-- 2) Stamp: el cliente no elige tenant. SQL Editor (sin JWT) sí puede setearlo.
-- -----------------------------------------------------------------------------
create or replace function public.stamp_empresa_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
begin
  v_empresa := public.empresa_id_actual();

  if tg_op = 'UPDATE' then
    if v_empresa is not null then
      new.empresa_id := old.empresa_id;
    elsif new.empresa_id is null then
      new.empresa_id := old.empresa_id;
    end if;
    return new;
  end if;

  -- INSERT
  if v_empresa is not null then
    new.empresa_id := v_empresa;
  elsif new.empresa_id is null then
    raise exception 'empresa_id requerido (el usuario no tiene membresía)'
      using errcode = '23502';
  end if;

  return new;
end;
$$;

comment on function public.stamp_empresa_id() is
  'BEFORE INSERT/UPDATE: con JWT pisa empresa_id con la membresía. Sin JWT (SQL Editor) respeta el valor explícito.';

create or replace function public.assert_misma_empresa(p_tabla text, p_id uuid, p_empresa uuid)
returns void
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v uuid;
begin
  if p_id is null then
    return;
  end if;
  execute format('select empresa_id from public.%I where id = $1', p_tabla)
    into v
    using p_id;
  if v is null or v is distinct from p_empresa then
    raise exception 'Referencia de otra empresa no permitida (% %)', p_tabla, p_id
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.validar_refs_empresa()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_table_name = 'contratos' then
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    if new.plan_id is not null then
      perform public.assert_misma_empresa('planes', new.plan_id, new.empresa_id);
    end if;
  elsif tg_table_name = 'cobros' then
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
  elsif tg_table_name = 'abonos' then
    perform public.assert_misma_empresa('cobros', new.cobro_id, new.empresa_id);
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
  elsif tg_table_name = 'pagos' then
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
    perform public.assert_misma_empresa('abonos', new.abono_id, new.empresa_id);
  elsif tg_table_name = 'movimientos_caja' then
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
    perform public.assert_misma_empresa('abonos', new.abono_id, new.empresa_id);
  elsif tg_table_name = 'motos' then
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
  elsif tg_table_name = 'depositos' then
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
  elsif tg_table_name = 'movimientos_deposito' then
    perform public.assert_misma_empresa('depositos', new.deposito_id, new.empresa_id);
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
  elsif tg_table_name = 'entregas' then
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
  elsif tg_table_name = 'devoluciones' then
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
  elsif tg_table_name = 'novedades' then
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
  elsif tg_table_name = 'documentos' then
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
  elsif tg_table_name = 'mantenimientos' then
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_empresa_id() from public, anon, authenticated;
revoke all on function public.assert_misma_empresa(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.validar_refs_empresa() from public, anon, authenticated;

create or replace function public._ensure_empresa_id_column(p_table text)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = p_table
  ) then
    return;
  end if;

  execute format(
    'alter table public.%I add column if not exists empresa_id uuid references public.empresas(id)',
    p_table
  );
  execute format(
    'update public.%I set empresa_id = public.empresa_id_produccion() where empresa_id is null',
    p_table
  );
  execute format('alter table public.%I alter column empresa_id set not null', p_table);
  execute format(
    'create index if not exists %I on public.%I (empresa_id)',
    p_table || '_empresa_id_idx',
    p_table
  );
end;
$$;

do $$
declare
  t text;
begin
  if public.empresa_id_produccion() is null then
    raise exception 'No se pudo sembrar/encontrar empresa GoRenting';
  end if;
  foreach t in array array[
    'usuarios',
    'motos',
    'contratos',
    'cobros',
    'abonos',
    'pagos',
    'movimientos_caja',
    'planes',
    'talleres_confianza',
    'depositos',
    'movimientos_deposito',
    'entregas',
    'devoluciones',
    'mantenimientos',
    'documentos',
    'novedades'
  ]
  loop
    perform public._ensure_empresa_id_column(t);
  end loop;
end $$;

comment on column public.usuarios.empresa_id is
  'Membresía: en este slice un auth user pertenece a exactamente una empresa.';

-- Ahora sí: usuarios.empresa_id existe. plpgsql no valida la columna en CREATE;
-- igual el ALTER ya corrió para que RLS/SQL Editor puedan usarla de inmediato.
create or replace function public.empresa_id_actual()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  select u.empresa_id
    into v
  from public.usuarios u
  where u.id = auth.uid()
    and coalesce(u.activo, true) = true;
  return v;
end;
$$;

create or replace function public.misma_empresa(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_empresa_id is not null
     and public.empresa_id_actual() is not null
     and p_empresa_id = public.empresa_id_actual()
$$;

comment on function public.empresa_id_actual() is
  'Empresa de la membresía del JWT. Usada por RLS y por RPCs SECURITY DEFINER.';
comment on function public.misma_empresa(uuid) is
  'True si el id pertenece a la empresa del usuario autenticado.';

grant execute on function public.empresa_id_actual() to authenticated, anon, service_role;
grant execute on function public.misma_empresa(uuid) to authenticated, anon, service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'usuarios',
    'motos',
    'contratos',
    'cobros',
    'abonos',
    'pagos',
    'movimientos_caja',
    'planes',
    'talleres_confianza',
    'depositos',
    'movimientos_deposito',
    'entregas',
    'devoluciones',
    'mantenimientos',
    'documentos',
    'novedades'
  ]
  loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      continue;
    end if;
    execute format('drop trigger if exists trg_%s_stamp_empresa on public.%I', t, t);
    execute format(
      'create trigger trg_%s_stamp_empresa before insert or update on public.%I for each row execute function public.stamp_empresa_id()',
      t, t
    );
    execute format('drop trigger if exists trg_%s_validar_empresa on public.%I', t, t);
    execute format(
      'create trigger trg_%s_validar_empresa before insert or update on public.%I for each row execute function public.validar_refs_empresa()',
      t, t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3) Unicidad por empresa (antes era global)
-- -----------------------------------------------------------------------------
drop index if exists public.contratos_un_activo_conductor;
create unique index contratos_un_activo_conductor
  on public.contratos (empresa_id, conductor_id)
  where (estado = 'activo');

drop index if exists public.contratos_un_activo_moto;
create unique index contratos_un_activo_moto
  on public.contratos (empresa_id, moto_id)
  where (estado = 'activo');

comment on index public.contratos_un_activo_conductor is
  'Un conductor activo por empresa.';
comment on index public.contratos_un_activo_moto is
  'Una moto activa por empresa.';

alter table public.planes drop constraint if exists planes_nombre_key;
alter table public.planes drop constraint if exists planes_nombre_empresa_key;
alter table public.planes
  add constraint planes_nombre_empresa_key unique (empresa_id, nombre);

-- Unicidad global de placa/cédula → por empresa. Nombres típicos de Postgres.
alter table public.motos drop constraint if exists motos_placa_key;
alter table public.usuarios drop constraint if exists usuarios_cedula_key;
drop index if exists public.motos_placa_key;
drop index if exists public.usuarios_cedula_key;

-- Nombres desconocidos: attname es type `name` (name[] ≠ text[] → 42883).
do $$
declare
  r record;
begin
  for r in
    select c.conname, t.relname as tabla
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and c.contype = 'u'
      and t.relname in ('motos', 'usuarios')
      and (
        select array_agg(a.attname::text order by u.ord)
        from unnest(c.conkey) with ordinality u(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = u.attnum
      ) in (array['placa']::text[], array['cedula']::text[])
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.tabla, r.conname);
  end loop;
end $$;

do $$
begin
  execute 'create unique index if not exists motos_empresa_placa_uidx on public.motos (empresa_id, placa)';
exception when others then
  raise notice 'motos (empresa_id, placa) no único: %', sqlerrm;
end $$;

do $$
begin
  execute 'create unique index if not exists usuarios_empresa_cedula_uidx on public.usuarios (empresa_id, cedula)';
exception when others then
  raise notice 'usuarios (empresa_id, cedula) no único: %', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 4) Triggers de operación: no cruzar empresa
-- -----------------------------------------------------------------------------
create or replace function public.contratos_al_activar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'activo' and (tg_op = 'INSERT' or old.estado is distinct from 'activo') then
    update public.motos
      set conductor_id = new.conductor_id,
          estado = 'en_uso',
          updated_at = now()
      where id = new.moto_id
        and empresa_id = new.empresa_id;
  end if;
  return new;
end;
$$;

create or replace function public.abonos_sync_pago_caja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moto uuid;
  v_placa text;
  v_fecha date;
  v_semana text;
  v_pago uuid;
  v_actor uuid;
  v_desc text;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.estado = 'registrado'
     and (tg_op = 'INSERT' or coalesce(old.estado, '') is distinct from 'registrado') then

    select c.moto_id, m.placa
      into v_moto, v_placa
    from public.cobros c
    left join public.motos m on m.id = c.moto_id
    where c.id = new.cobro_id;

    v_fecha := (timezone('America/Bogota', new.fecha_pago))::date;
    v_semana := to_char(v_fecha, 'IYYY') || '-W' || to_char(v_fecha, 'IW');
    v_actor := coalesce(new.confirmado_por, new.responsable_id);
    v_desc := 'Abono cuota'
      || coalesce(' · ' || v_placa, '')
      || coalesce(' · ' || new.metodo_pago, '');

    if not exists (select 1 from public.pagos p where p.abono_id = new.id) then
      insert into public.pagos (
        conductor_id, moto_id, fecha_pago, monto, valor_pagado, gastos,
        metodo_pago, observaciones, semana, pagado, registrado_por,
        comprobante_imagen, abono_id, estado, empresa_id
      ) values (
        new.conductor_id,
        v_moto,
        new.fecha_pago,
        new.monto,
        new.monto,
        0,
        coalesce(new.metodo_pago, 'TRANSFERENCIA'),
        coalesce(new.observaciones, 'Abono de cuota'),
        v_semana,
        true,
        v_actor,
        new.comprobante,
        new.id,
        'registrado',
        new.empresa_id
      )
      returning id into v_pago;
    else
      select p.id into v_pago from public.pagos p where p.abono_id = new.id limit 1;
      update public.pagos
        set estado = 'registrado',
            pagado = true,
            monto = new.monto,
            valor_pagado = new.monto
        where abono_id = new.id
          and estado is distinct from 'anulado';
    end if;

    if not exists (select 1 from public.movimientos_caja mc where mc.abono_id = new.id) then
      insert into public.movimientos_caja (
        banco, tipo, monto, fecha, descripcion, moto_id, pago_id,
        registrado_por, abono_id, estado, empresa_id
      ) values (
        'mdd',
        'ingreso',
        new.monto,
        v_fecha,
        v_desc,
        v_moto,
        v_pago,
        v_actor,
        new.id,
        'registrado',
        new.empresa_id
      );
    else
      update public.movimientos_caja
        set estado = 'registrado',
            monto = new.monto
        where abono_id = new.id
          and estado is distinct from 'anulado';
    end if;

  elsif new.estado = 'anulado'
        and tg_op = 'UPDATE'
        and coalesce(old.estado, '') = 'registrado' then
    update public.pagos
      set estado = 'anulado',
          pagado = false
      where abono_id = new.id;
    update public.movimientos_caja
      set estado = 'anulado'
      where abono_id = new.id;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) RPCs: siempre la empresa del JWT (SQL Editor sin JWT → producción)
-- -----------------------------------------------------------------------------
create or replace function public.estado_cuenta_conductor(p_conductor_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'deuda_total',
          coalesce(sum(c.saldo) filter (where c.estado is distinct from 'anulado'), 0),
        'deuda_en_mora',
          coalesce(sum(c.saldo) filter (where public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento)), 0),
        'periodos_vencidos',
          coalesce(count(*) filter (where public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento)), 0),
        'en_mora',
          coalesce(bool_or(public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento)), false),
        'fecha_mora_mas_antigua',
          min(c.fecha_vencimiento) filter (where public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento))
      )
      from public.cobros c
      where c.conductor_id = p_conductor_id
        and (
          auth.uid() is null
          or c.empresa_id = public.empresa_id_actual()
        )
    ),
    jsonb_build_object(
      'deuda_total', 0,
      'deuda_en_mora', 0,
      'periodos_vencidos', 0,
      'en_mora', false,
      'fecha_mora_mas_antigua', null
    )
  );
$$;

create or replace function public.resumen_cobros()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'pagado_total',
          coalesce(sum(c.monto_pagado) filter (where c.estado is distinct from 'anulado'), 0),
        'pendiente_total',
          coalesce(sum(c.saldo) filter (where c.estado is distinct from 'anulado'), 0),
        'en_mora_total',
          coalesce(sum(c.saldo) filter (where public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento)), 0)
      )
      from public.cobros c
      where c.empresa_id = coalesce(public.empresa_id_actual(), public.empresa_id_produccion())
    ),
    jsonb_build_object(
      'pagado_total', 0,
      'pendiente_total', 0,
      'en_mora_total', 0
    )
  );
$$;

create or replace function public.resumen_dashboard(p_periodo text default 'mes')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_periodo text;
  v_desde date;
  v_hasta date;
  v_hoy date;
  v_mes_ini date;
  v_mes_ant_ini date;
  v_mes_ant_fin date;
  v_empresa uuid;
  v_result jsonb;
begin
  if auth.uid() is not null and not public.es_staff() then
    raise exception 'Solo el staff (administrador/asesor) puede consultar el dashboard'
      using errcode = '42501';
  end if;

  v_empresa := coalesce(public.empresa_id_actual(), public.empresa_id_produccion());
  if v_empresa is null then
    raise exception 'Sin empresa para el dashboard' using errcode = '42501';
  end if;

  select r.periodo, r.desde, r.hasta
    into v_periodo, v_desde, v_hasta
  from public.rango_periodo_dashboard(p_periodo) r;

  v_hoy := public.hoy_colombia();
  v_mes_ini := date_trunc('month', v_hoy::timestamp)::date;
  v_mes_ant_ini := (date_trunc('month', v_hoy::timestamp) - interval '1 month')::date;
  v_mes_ant_fin := v_mes_ini - 1;

  select jsonb_build_object(
    'periodo', v_periodo,
    'periodo_desde', v_desde,
    'periodo_hasta', v_hasta,
    'ingresos_periodo',
      coalesce((
        select sum(a.monto)::numeric(12,0)
        from public.abonos a
        where a.estado = 'registrado'
          and a.empresa_id = v_empresa
          and (timezone('America/Bogota', a.fecha_pago))::date between v_desde and v_hasta
      ), 0),
    'cantidad_abonos_periodo',
      coalesce((
        select count(*)::int
        from public.abonos a
        where a.estado = 'registrado'
          and a.empresa_id = v_empresa
          and (timezone('America/Bogota', a.fecha_pago))::date between v_desde and v_hasta
      ), 0),
    'contratos_activos',
      coalesce((
        select count(*)::int from public.contratos c
        where c.estado = 'activo' and c.empresa_id = v_empresa
      ), 0),
    'contratos_nuevos',
      coalesce((
        select count(*)::int
        from public.contratos c
        where c.estado is distinct from 'anulado'
          and c.empresa_id = v_empresa
          and c.fecha_inicio between v_desde and v_hasta
      ), 0),
    'conductores_activos',
      coalesce((
        select count(distinct c.conductor_id)::int
        from public.contratos c
        where c.estado = 'activo' and c.empresa_id = v_empresa
      ), 0),
    'motos_total',
      coalesce((select count(*)::int from public.motos m where m.empresa_id = v_empresa), 0),
    'motos_alquiladas',
      coalesce((
        select count(*)::int from public.motos m
        where m.estado = 'en_uso' and m.empresa_id = v_empresa
      ), 0),
    'motos_disponibles',
      coalesce((
        select count(*)::int from public.motos m
        where m.estado = 'disponible' and m.empresa_id = v_empresa
      ), 0),
    'motos_en_mantenimiento',
      coalesce((
        select count(*)::int from public.motos m
        where m.estado = 'en_mantenimiento' and m.empresa_id = v_empresa
      ), 0),
    'motos_fuera_servicio',
      coalesce((
        select count(*)::int from public.motos m
        where m.estado = 'fuera_servicio' and m.empresa_id = v_empresa
      ), 0),
    'cartera',
      coalesce((
        select sum(c.saldo)::numeric(12,0)
        from public.cobros c
        where c.estado is distinct from 'anulado' and c.empresa_id = v_empresa
      ), 0),
    'mora_cantidad',
      coalesce((
        select count(*)::int
        from public.cobros c
        where public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento)
          and c.empresa_id = v_empresa
      ), 0),
    'mora_monto',
      coalesce((
        select sum(c.saldo)::numeric(12,0)
        from public.cobros c
        where public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento)
          and c.empresa_id = v_empresa
      ), 0),
    'ingresos_mes_actual',
      coalesce((
        select sum(a.monto)::numeric(12,0)
        from public.abonos a
        where a.estado = 'registrado'
          and a.empresa_id = v_empresa
          and (timezone('America/Bogota', a.fecha_pago))::date between v_mes_ini and v_hoy
      ), 0),
    'ingresos_mes_anterior',
      coalesce((
        select sum(a.monto)::numeric(12,0)
        from public.abonos a
        where a.estado = 'registrado'
          and a.empresa_id = v_empresa
          and (timezone('America/Bogota', a.fecha_pago))::date between v_mes_ant_ini and v_mes_ant_fin
      ), 0),
    'planes',
      coalesce((
        with plan_activos as (
          select
            coalesce(nullif(btrim(c.plan_nombre), ''), 'Sin plan') as plan_nombre,
            count(*)::int as contratos_activos
          from public.contratos c
          where c.estado = 'activo' and c.empresa_id = v_empresa
          group by 1
        ),
        plan_ingresos as (
          select
            coalesce(nullif(btrim(ct.plan_nombre), ''), 'Sin plan') as plan_nombre,
            coalesce(sum(a.monto), 0)::numeric(12,0) as ingresos
          from public.abonos a
          join public.contratos ct on ct.id = a.contrato_id
          where a.estado = 'registrado'
            and a.empresa_id = v_empresa
            and (timezone('America/Bogota', a.fecha_pago))::date between v_desde and v_hasta
          group by 1
        )
        select jsonb_agg(
          jsonb_build_object(
            'plan_nombre', coalesce(plan_activos.plan_nombre, plan_ingresos.plan_nombre),
            'contratos_activos', coalesce(plan_activos.contratos_activos, 0),
            'ingresos', coalesce(plan_ingresos.ingresos, 0)
          )
          order by coalesce(plan_ingresos.ingresos, 0) desc,
                   coalesce(plan_activos.contratos_activos, 0) desc,
                   coalesce(plan_activos.plan_nombre, plan_ingresos.plan_nombre)
        )
        from plan_activos
        full outer join plan_ingresos on plan_ingresos.plan_nombre = plan_activos.plan_nombre
      ), '[]'::jsonb),
    'ingresos_mensuales',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'key', to_char(mes, 'YYYY-MM'),
            'monto', coalesce(sumas.monto, 0),
            'cantidad_abonos', coalesce(sumas.cantidad, 0)
          )
          order by mes
        )
        from generate_series(
          date_trunc('month', v_hoy::timestamp) - interval '11 months',
          date_trunc('month', v_hoy::timestamp),
          interval '1 month'
        ) as mes
        left join lateral (
          select
            coalesce(sum(a.monto), 0)::numeric(12,0) as monto,
            count(*)::int as cantidad
          from public.abonos a
          where a.estado = 'registrado'
            and a.empresa_id = v_empresa
            and date_trunc('month', timezone('America/Bogota', a.fecha_pago)) = mes
        ) sumas on true
      ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

comment on function public.resumen_dashboard(text) is
  'KPIs staff de LA EMPRESA del JWT (empresa_id_actual). SQL Editor sin JWT usa GoRenting producción. Mora = cobro_en_mora().';

drop view if exists public.v_cobros;
create view public.v_cobros
  with (security_invoker = true)
as
select
  c.*,
  public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento) as en_mora
from public.cobros c;

grant select on public.v_cobros to authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- 6) RLS: staff y conductor solo su empresa. Landing anónima = producción.
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

alter table public.empresas enable row level security;
grant select on table public.empresas to authenticated;

select public._drop_all_policies('empresas');
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
select public._drop_all_policies('planes');
select public._drop_all_policies('talleres_confianza');
select public._drop_all_policies('movimientos_caja');
select public._drop_all_policies('mantenimientos');
select public._drop_all_policies('documentos');
select public._drop_all_policies('novedades');

create policy empresas_select_propia on public.empresas
  for select to authenticated
  using (id = public.empresa_id_actual());

-- USUARIOS
create policy usuarios_staff_all on public.usuarios
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));

create policy usuarios_self_select on public.usuarios
  for select to authenticated
  using (id = auth.uid());

create policy usuarios_self_insert on public.usuarios
  for insert to authenticated
  with check (id = auth.uid());

create policy usuarios_self_update on public.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- MOTOS: anónimo solo ve la flota de producción (landing). Autenticado = su empresa.
create policy motos_staff_all on public.motos
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));

create policy motos_empleado_select on public.motos
  for select to authenticated
  using (conductor_id = auth.uid() and public.misma_empresa(empresa_id));

create policy motos_anon_select_produccion on public.motos
  for select to anon
  using (empresa_id = public.empresa_id_produccion());

-- PAGOS (sin "or es_staff" en la policy del conductor: eso filtraba mal entre tenants)
create policy pagos_staff_all on public.pagos
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));

create policy pagos_empleado_read_own on public.pagos
  for select to authenticated
  using (conductor_id = auth.uid() and public.misma_empresa(empresa_id));

create policy contratos_staff_all on public.contratos
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));
create policy contratos_empleado_select on public.contratos
  for select to authenticated
  using (conductor_id = auth.uid() and public.misma_empresa(empresa_id));

create policy cobros_staff_all on public.cobros
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));
create policy cobros_empleado_select on public.cobros
  for select to authenticated
  using (conductor_id = auth.uid() and public.misma_empresa(empresa_id));

create policy abonos_staff_all on public.abonos
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));
create policy abonos_empleado_own on public.abonos
  for all to authenticated
  using (conductor_id = auth.uid() and public.misma_empresa(empresa_id))
  with check (conductor_id = auth.uid() and public.misma_empresa(empresa_id));

create policy depositos_staff_all on public.depositos
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));
create policy depositos_empleado_select on public.depositos
  for select to authenticated
  using (conductor_id = auth.uid() and public.misma_empresa(empresa_id));

create policy movimientos_deposito_staff_all on public.movimientos_deposito
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));

create policy entregas_staff_all on public.entregas
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));

create policy devoluciones_staff_all on public.devoluciones
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));

create policy planes_staff_all on public.planes
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));
create policy planes_auth_select_activos on public.planes
  for select to authenticated
  using (activo = true and public.misma_empresa(empresa_id));

create policy talleres_confianza_staff_all on public.talleres_confianza
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));
create policy talleres_confianza_auth_select_activos on public.talleres_confianza
  for select to authenticated
  using (activo = true and public.misma_empresa(empresa_id));

create policy movimientos_caja_staff_all on public.movimientos_caja
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));

create policy mantenimientos_activo_empresa on public.mantenimientos
  for all to authenticated
  using (public.es_usuario_activo() and public.misma_empresa(empresa_id))
  with check (public.es_usuario_activo() and public.misma_empresa(empresa_id));

create policy documentos_activo_empresa on public.documentos
  for all to authenticated
  using (public.es_usuario_activo() and public.misma_empresa(empresa_id))
  with check (public.es_usuario_activo() and public.misma_empresa(empresa_id));

create policy novedades_staff_all on public.novedades
  for all to authenticated
  using (public.es_staff() and public.misma_empresa(empresa_id))
  with check (public.es_staff() and public.misma_empresa(empresa_id));
create policy novedades_empleado_select on public.novedades
  for select to authenticated
  using (public.es_empleado() and conductor_id = auth.uid() and public.misma_empresa(empresa_id));
create policy novedades_empleado_insert on public.novedades
  for insert to authenticated
  with check (public.es_empleado() and conductor_id = auth.uid() and public.misma_empresa(empresa_id));

-- -----------------------------------------------------------------------------
-- 7) Semilla OPCIONAL solo para GoRenting Pruebas (no copia producción)
--    Pon v_sembrar := true y vuelve a correr este archivo.
-- -----------------------------------------------------------------------------
do $$
declare
  v_sembrar boolean := false; -- ← true para 1 moto fake + 1 plan inactivo
  v_pruebas uuid;
begin
  if not v_sembrar then
    return;
  end if;

  v_pruebas := public.empresa_id_pruebas();
  if v_pruebas is null then
    raise exception 'No existe GoRenting Pruebas';
  end if;

  if not exists (
    select 1 from public.planes p
    where p.empresa_id = v_pruebas and p.nombre = 'Plan Pruebas'
  ) then
    insert into public.planes (
      nombre, descripcion, condiciones_uso, periodicidades_permitidas,
      valor_sugerido, permite_negociacion, duracion_minima_meses,
      requiere_cuota_inicial, activo, empresa_id
    ) values (
      'Plan Pruebas',
      'Plan de sandbox. Actívalo en el catálogo para usar el wizard.',
      'Solo empresa GoRenting Pruebas. No es un plan de producción.',
      array['semanal']::text[],
      1000,
      true,
      3,
      false,
      false,
      v_pruebas
    );
  end if;

  if not exists (
    select 1 from public.motos m
    where m.empresa_id = v_pruebas and m.placa = 'TST-000'
  ) then
    insert into public.motos (
      marca, modelo, placa, precio, estado, empresa_id
    ) values (
      'Prueba',
      'Sandbox',
      'TST-000',
      0,
      'disponible',
      v_pruebas
    );
  end if;
end $$;

-- Ejemplo comentado (equivalente a v_sembrar := true):
-- insert into public.planes (
--   nombre, descripcion, condiciones_uso, periodicidades_permitidas,
--   valor_sugerido, permite_negociacion, duracion_minima_meses,
--   requiere_cuota_inicial, activo, empresa_id
-- ) values (
--   'Plan Pruebas', 'Sandbox', 'Solo pruebas', array['semanal']::text[],
--   1000, true, 3, false, false, public.empresa_id_pruebas()
-- ) on conflict (empresa_id, nombre) do nothing;
--
-- insert into public.motos (marca, modelo, placa, precio, estado, empresa_id)
-- select 'Prueba', 'Sandbox', 'TST-000', 0, 'disponible', public.empresa_id_pruebas()
-- where not exists (
--   select 1 from public.motos
--   where empresa_id = public.empresa_id_pruebas() and placa = 'TST-000'
-- );

notify pgrst, 'reload schema';

-- Verificación (opcional, otra query):
--   select nombre, id from public.empresas order by nombre;
--   select count(*) filter (where empresa_id = public.empresa_id_produccion()) as prod,
--          count(*) filter (where empresa_id = public.empresa_id_pruebas()) as pruebas
--   from public.contratos;
--   -- prod = contratos reales; pruebas = 0
--
-- Adjuntar usuarios de Authentication → supabase/snippets/attach_usuario_pruebas.sql
-- NUNCA adjuntar un usuario de prueba a la empresa GoRenting (producción).
