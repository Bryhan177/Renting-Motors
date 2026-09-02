-- =============================================================================
-- RPC resumen_caja: saldo real por banco (TODAS las filas, no las últimas 200)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
--
-- Por qué: CajaService.resumen() leía list().limit(200) y el saldo de Flujo
-- de caja quedaba corto cuando hay más de 200 movimientos.
--
-- Agrega ingresos / egresos / saldo por banco (mdd, ahorro_mdd) de
-- movimientos_caja.estado IS DISTINCT FROM 'anulado', empresa del JWT.
-- Staff-only. Angular cae a un SELECT sin tope si este RPC aún no existe.
--
-- Qué NO hace: no inserta ni anula movimientos. No toca abonos/cobros.
-- =============================================================================

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
      values
        (1, 'mdd'::text),
        (2, 'ahorro_mdd'::text)
    ) as b(ord, banco)
  ) x;

  return v_result;
end;
$$;

comment on function public.resumen_caja() is
  'Saldo real por banco (mdd / ahorro_mdd) de LA EMPRESA del JWT. Suma todas las filas no anuladas. No usa LIMIT. Staff-only.';

revoke all on function public.resumen_caja() from public, anon;
grant execute on function public.resumen_caja() to authenticated, service_role;

notify pgrst, 'reload schema';
