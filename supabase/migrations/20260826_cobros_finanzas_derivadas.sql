-- =============================================================================
-- Finanzas derivadas en Postgres — mora, saldo, pagado, estado de cuenta
-- Ejecutar en: Supabase → SQL Editor → Run (después de las migraciones 20260822_*)
--
-- Por qué: Angular (cobros.service.ts) recalculaba en_mora en el navegador y
-- escribía el flag. Si nadie abría Pagos, conductor y staff veían deuda vieja.
-- en_mora depende de CURRENT DATE, así que NO puede ser generated column
-- (Postgres exige IMMUTABLE). Diseño:
--   1) Función cobro_en_mora() = regla de negocio (hoy Colombia)
--   2) Columna computada PostgREST en_mora(cobros) — se lee, no se persiste
--   3) Trigger: monto_pagado / saldo / estado (salvo anulado) salen de abonos
--   4) RPC estado_cuenta_conductor / resumen_cobros para agregados
--
-- Filas financieras no se borran: usar estado = 'anulado'.
-- Generar cobros faltantes sigue en la app.
-- =============================================================================

-- Fecha de negocio: calendario de Colombia (sin DST).
create or replace function public.hoy_colombia()
returns date
language sql
stable
set search_path = public
as $$
  select (timezone('America/Bogota', now()))::date;
$$;

-- Regla: cobro en mora si no está anulado, saldo > 0 y hoy es posterior al vencimiento.
create or replace function public.cobro_en_mora(
  p_estado text,
  p_saldo numeric,
  p_fecha_vencimiento date
)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    coalesce(p_estado, '') is distinct from 'anulado'
    and coalesce(p_saldo, 0) > 0
    and p_fecha_vencimiento is not null
    and public.hoy_colombia() > p_fecha_vencimiento;
$$;

comment on function public.cobro_en_mora(text, numeric, date) is
  'Mora: no anulado, saldo > 0 y hoy (America/Bogota) posterior a fecha_vencimiento.';

-- Quitar el flag persistido: deja de ser fuente de verdad (y de PostgREST).
drop index if exists public.cobros_conductor_mora_idx;
alter table public.cobros drop column if exists en_mora;

-- Columna computada para GET /cobros?select=*,en_mora
-- Parámetro SIN nombre: así PostgREST la trata como computed column.
drop function if exists public.en_mora(public.cobros);
create function public.en_mora(public.cobros)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.cobro_en_mora($1.estado, $1.saldo, $1.fecha_vencimiento);
$$;

-- -----------------------------------------------------------------------------
-- monto_pagado, saldo y estado (pendiente/parcial/pagado) derivados de abonos.
-- estado = anulado se respeta (no se pisa).
-- SECURITY DEFINER: el conductor puede insertar un abono pendiente y el
-- trigger igual debe poder actualizar el cobro (RLS del conductor es solo SELECT).
-- -----------------------------------------------------------------------------
create or replace function public.cobros_aplicar_finanzas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pagado numeric(12,0);
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  select coalesce(sum(a.monto), 0)::numeric(12,0)
    into pagado
    from public.abonos a
    where a.cobro_id = new.id
      and a.estado = 'registrado';

  new.monto_pagado := pagado;
  new.saldo := greatest(0, coalesce(new.monto_esperado, 0) - pagado);

  if new.estado is distinct from 'anulado' then
    if pagado <= 0 then
      new.estado := 'pendiente';
    elsif pagado >= new.monto_esperado then
      new.estado := 'pagado';
    else
      new.estado := 'parcial';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cobros_aplicar_finanzas on public.cobros;
create trigger trg_cobros_aplicar_finanzas
  before insert or update on public.cobros
  for each row
  execute function public.cobros_aplicar_finanzas();

-- Al cambiar abonos, tocar el cobro para que el trigger anterior recalcule.
create or replace function public.abonos_sync_cobro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.cobros set updated_at = now() where id = old.cobro_id;
    return old;
  end if;

  update public.cobros set updated_at = now() where id = new.cobro_id;

  if tg_op = 'UPDATE' and old.cobro_id is distinct from new.cobro_id then
    update public.cobros set updated_at = now() where id = old.cobro_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_abonos_sync_cobro on public.abonos;
create trigger trg_abonos_sync_cobro
  after insert or update or delete on public.abonos
  for each row
  execute function public.abonos_sync_cobro();

-- Recalcular filas existentes (deriva pagado/saldo/estado desde abonos).
update public.cobros set updated_at = now();

create index if not exists cobros_conductor_venc_idx
  on public.cobros (conductor_id, fecha_vencimiento)
  where estado is distinct from 'anulado';

-- -----------------------------------------------------------------------------
-- Agregados: deuda total, deuda en mora, periodos vencidos, fecha más antigua
-- SECURITY INVOKER: RLS de cobros aplica (conductor solo ve lo suyo).
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
    ),
    jsonb_build_object(
      'pagado_total', 0,
      'pendiente_total', 0,
      'en_mora_total', 0
    )
  );
$$;

-- Vista de verificación en SQL Editor (no la usa Angular; embeddings quedan en cobros).
drop view if exists public.v_cobros;
create view public.v_cobros
  with (security_invoker = true)
as
select
  c.*,
  public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento) as en_mora
from public.cobros c;

comment on view public.v_cobros is
  'Cobros con en_mora vivo. Ejemplo: select id, saldo, fecha_vencimiento, en_mora from v_cobros where en_mora;';

-- Permisos API
grant execute on function public.hoy_colombia() to authenticated, anon, service_role;
grant execute on function public.cobro_en_mora(text, numeric, date) to authenticated, anon, service_role;
grant execute on function public.en_mora(public.cobros) to authenticated, anon, service_role;
grant execute on function public.estado_cuenta_conductor(uuid) to authenticated, service_role;
grant execute on function public.resumen_cobros() to authenticated, service_role;
grant select on public.v_cobros to authenticated, anon, service_role;

revoke all on function public.cobros_aplicar_finanzas() from public;
revoke all on function public.abonos_sync_cobro() from public;

notify pgrst, 'reload schema';
