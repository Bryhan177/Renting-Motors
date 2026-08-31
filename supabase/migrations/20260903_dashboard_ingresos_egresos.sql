-- =============================================================================
-- Dashboard: otros ingresos + serie de egresos
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260902_assert_misma_empresa_grant.sql)
--
-- Idempotente: create or replace de resumen_dashboard.
--
-- Qué verifica / corrige:
--   El RPC sumaba solo abonos.estado = 'registrado' (cuotas de contrato).
--   El pago staff `registrarManual` (moto, no cobro) escribe public.pagos +
--   movimientos_caja.tipo = ingreso con abono_id NULL. Esos 30.000 COP de
--   alquiler puntual nunca eran abono → desaparecían de KPIs/charts.
--
-- Fuente de verdad (no duplicar):
--   ingresos_cuotas     = abonos registrados (cuota semanal / periodo)
--   ingresos_otros      = movimientos_caja ingreso, abono_id IS NULL, no anulado
--                         (alquiler puntual, pago manual, ingreso de caja)
--   ingresos_periodo    = cuotas + otros
--   NO se suman movimientos_caja con abono_id: el trigger 20260831 ya los
--   creó al registrar el abono. Sumarlos otra vez duplicaría la cuota.
--   egresos_periodo     = movimientos_caja.tipo = egreso, no anulado
--                         (mantenimientos, egreso de Flujo de caja).
--   pagos.gastos NO entra aquí: el form legacy lo resta del neto del ingreso,
--   no es un stream de egresos.
--
-- Qué NO hace:
--   - NO toca cobro_en_mora / cuota_semanal / talleres / planes wizard.
--   - NO borra filas financieras.
--   - NO hace cobro_id nullable en abonos (otros ingresos no son cuota).
--   - Staff-only + empresa_id del JWT (igual que 20260901).
-- =============================================================================

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
    'ingresos_cuotas',
      coalesce((
        select sum(a.monto)::numeric(12,0)
        from public.abonos a
        where a.estado = 'registrado'
          and a.empresa_id = v_empresa
          and (timezone('America/Bogota', a.fecha_pago))::date between v_desde and v_hasta
      ), 0),
    'ingresos_otros',
      coalesce((
        select sum(mc.monto)::numeric(12,0)
        from public.movimientos_caja mc
        where mc.tipo = 'ingreso'
          and mc.estado is distinct from 'anulado'
          and mc.abono_id is null
          and mc.empresa_id = v_empresa
          and mc.fecha between v_desde and v_hasta
      ), 0),
    'ingresos_periodo',
      coalesce((
        select sum(a.monto)::numeric(12,0)
        from public.abonos a
        where a.estado = 'registrado'
          and a.empresa_id = v_empresa
          and (timezone('America/Bogota', a.fecha_pago))::date between v_desde and v_hasta
      ), 0)
      +
      coalesce((
        select sum(mc.monto)::numeric(12,0)
        from public.movimientos_caja mc
        where mc.tipo = 'ingreso'
          and mc.estado is distinct from 'anulado'
          and mc.abono_id is null
          and mc.empresa_id = v_empresa
          and mc.fecha between v_desde and v_hasta
      ), 0),
    'cantidad_abonos_periodo',
      coalesce((
        select count(*)::int
        from public.abonos a
        where a.estado = 'registrado'
          and a.empresa_id = v_empresa
          and (timezone('America/Bogota', a.fecha_pago))::date between v_desde and v_hasta
      ), 0),
    'cantidad_otros_periodo',
      coalesce((
        select count(*)::int
        from public.movimientos_caja mc
        where mc.tipo = 'ingreso'
          and mc.estado is distinct from 'anulado'
          and mc.abono_id is null
          and mc.empresa_id = v_empresa
          and mc.fecha between v_desde and v_hasta
      ), 0),
    'egresos_periodo',
      coalesce((
        select sum(mc.monto)::numeric(12,0)
        from public.movimientos_caja mc
        where mc.tipo = 'egreso'
          and mc.estado is distinct from 'anulado'
          and mc.empresa_id = v_empresa
          and mc.fecha between v_desde and v_hasta
      ), 0),
    'cantidad_egresos_periodo',
      coalesce((
        select count(*)::int
        from public.movimientos_caja mc
        where mc.tipo = 'egreso'
          and mc.estado is distinct from 'anulado'
          and mc.empresa_id = v_empresa
          and mc.fecha between v_desde and v_hasta
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
      ), 0)
      +
      coalesce((
        select sum(mc.monto)::numeric(12,0)
        from public.movimientos_caja mc
        where mc.tipo = 'ingreso'
          and mc.estado is distinct from 'anulado'
          and mc.abono_id is null
          and mc.empresa_id = v_empresa
          and mc.fecha between v_mes_ini and v_hoy
      ), 0),
    'ingresos_mes_anterior',
      coalesce((
        select sum(a.monto)::numeric(12,0)
        from public.abonos a
        where a.estado = 'registrado'
          and a.empresa_id = v_empresa
          and (timezone('America/Bogota', a.fecha_pago))::date between v_mes_ant_ini and v_mes_ant_fin
      ), 0)
      +
      coalesce((
        select sum(mc.monto)::numeric(12,0)
        from public.movimientos_caja mc
        where mc.tipo = 'ingreso'
          and mc.estado is distinct from 'anulado'
          and mc.abono_id is null
          and mc.empresa_id = v_empresa
          and mc.fecha between v_mes_ant_ini and v_mes_ant_fin
      ), 0),
    'egresos_mes_actual',
      coalesce((
        select sum(mc.monto)::numeric(12,0)
        from public.movimientos_caja mc
        where mc.tipo = 'egreso'
          and mc.estado is distinct from 'anulado'
          and mc.empresa_id = v_empresa
          and mc.fecha between v_mes_ini and v_hoy
      ), 0),
    'egresos_mes_anterior',
      coalesce((
        select sum(mc.monto)::numeric(12,0)
        from public.movimientos_caja mc
        where mc.tipo = 'egreso'
          and mc.estado is distinct from 'anulado'
          and mc.empresa_id = v_empresa
          and mc.fecha between v_mes_ant_ini and v_mes_ant_fin
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
            'monto', coalesce(cuotas.monto, 0) + coalesce(otros.monto, 0),
            'monto_cuotas', coalesce(cuotas.monto, 0),
            'monto_otros', coalesce(otros.monto, 0),
            'cantidad_abonos', coalesce(cuotas.cantidad, 0),
            'cantidad_otros', coalesce(otros.cantidad, 0)
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
        ) cuotas on true
        left join lateral (
          select
            coalesce(sum(mc.monto), 0)::numeric(12,0) as monto,
            count(*)::int as cantidad
          from public.movimientos_caja mc
          where mc.tipo = 'ingreso'
            and mc.estado is distinct from 'anulado'
            and mc.abono_id is null
            and mc.empresa_id = v_empresa
            and date_trunc('month', mc.fecha::timestamp) = mes
        ) otros on true
      ), '[]'::jsonb),
    'egresos_mensuales',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'key', to_char(mes, 'YYYY-MM'),
            'monto', coalesce(sumas.monto, 0),
            'cantidad', coalesce(sumas.cantidad, 0)
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
            coalesce(sum(mc.monto), 0)::numeric(12,0) as monto,
            count(*)::int as cantidad
          from public.movimientos_caja mc
          where mc.tipo = 'egreso'
            and mc.estado is distinct from 'anulado'
            and mc.empresa_id = v_empresa
            and date_trunc('month', mc.fecha::timestamp) = mes
        ) sumas on true
      ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

comment on function public.resumen_dashboard(text) is
  'KPIs staff de LA EMPRESA del JWT. Ingresos = abonos registrados (cuotas) + movimientos_caja ingreso sin abono_id (otros). Egresos = caja tipo egreso. No duplica caja ligada a abono. Mora = cobro_en_mora().';

create index if not exists movimientos_caja_tipo_fecha_idx
  on public.movimientos_caja (empresa_id, tipo, fecha)
  where estado is distinct from 'anulado';

revoke all on function public.resumen_dashboard(text) from public, anon;
grant execute on function public.resumen_dashboard(text) to authenticated, service_role;

notify pgrst, 'reload schema';
