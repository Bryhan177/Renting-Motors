-- =============================================================================
-- Dashboard: KPIs de dinero desde public.pagos (misma fuente que /pagos / Excel)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260903_dashboard_ingresos_egresos.sql y 20260908_import_pagos_excel.sql)
--
-- Idempotente: create or replace de resumen_dashboard.
--
-- Qué verifica / corrige:
--   Tras 20260908, /pagos es la verdad Excel:
--     Total cobrado = sum(pagos.valor_pagado)  ≈ 6.280.000
--     Total gastos  = sum(pagos.gastos)        ≈ 1.357.613
--   El RPC seguía sumando abonos.estado = 'registrado' (histórico inventado)
--   + movimientos_caja ingreso sin abono_id, y egresos de caja.
--   Por eso el dashboard no coincidía con Pagos/Excel.
--
-- Fuente de verdad (no duplicar):
--   ingresos_cuotas     = sum(pagos.valor_pagado) no anulado, valor_pagado > 0
--   ingresos_otros      = 0  (Franklin/otros ya van en valor_pagado; sumar caja
--                         duplicaría)
--   ingresos_periodo    = ingresos_cuotas + ingresos_otros
--   cantidad_abonos_periodo = count de esas filas (nombre UI legado)
--   cantidad_otros_periodo  = 0
--   egresos_periodo     = sum(pagos.gastos) no anulado, gastos > 0
--   cantidad_egresos_periodo = count de esas filas
--   Fecha = (timezone('America/Bogota', pagos.fecha_pago))::date
--
-- Qué NO hace:
--   - NO toca Flujo de caja / resumen_caja / saldos MDD-Ahorro.
--   - NO toca cobro_en_mora / cartera / contratos / flota.
--   - NO borra filas financieras (solo REPLACE de la función).
--   - Staff-only + empresa_id del JWT (igual que 20260903).
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
        select sum(p.valor_pagado)::numeric(12,0)
        from public.pagos p
        where p.estado is distinct from 'anulado'
          and p.empresa_id = v_empresa
          and coalesce(p.valor_pagado, 0) > 0
          and (timezone('America/Bogota', p.fecha_pago))::date between v_desde and v_hasta
      ), 0),
    'ingresos_otros', 0,
    'ingresos_periodo',
      coalesce((
        select sum(p.valor_pagado)::numeric(12,0)
        from public.pagos p
        where p.estado is distinct from 'anulado'
          and p.empresa_id = v_empresa
          and coalesce(p.valor_pagado, 0) > 0
          and (timezone('America/Bogota', p.fecha_pago))::date between v_desde and v_hasta
      ), 0),
    'cantidad_abonos_periodo',
      coalesce((
        select count(*)::int
        from public.pagos p
        where p.estado is distinct from 'anulado'
          and p.empresa_id = v_empresa
          and coalesce(p.valor_pagado, 0) > 0
          and (timezone('America/Bogota', p.fecha_pago))::date between v_desde and v_hasta
      ), 0),
    'cantidad_otros_periodo', 0,
    'egresos_periodo',
      coalesce((
        select sum(p.gastos)::numeric(12,0)
        from public.pagos p
        where p.estado is distinct from 'anulado'
          and p.empresa_id = v_empresa
          and coalesce(p.gastos, 0) > 0
          and (timezone('America/Bogota', p.fecha_pago))::date between v_desde and v_hasta
      ), 0),
    'cantidad_egresos_periodo',
      coalesce((
        select count(*)::int
        from public.pagos p
        where p.estado is distinct from 'anulado'
          and p.empresa_id = v_empresa
          and coalesce(p.gastos, 0) > 0
          and (timezone('America/Bogota', p.fecha_pago))::date between v_desde and v_hasta
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
        select sum(p.valor_pagado)::numeric(12,0)
        from public.pagos p
        where p.estado is distinct from 'anulado'
          and p.empresa_id = v_empresa
          and coalesce(p.valor_pagado, 0) > 0
          and (timezone('America/Bogota', p.fecha_pago))::date between v_mes_ini and v_hoy
      ), 0),
    'ingresos_mes_anterior',
      coalesce((
        select sum(p.valor_pagado)::numeric(12,0)
        from public.pagos p
        where p.estado is distinct from 'anulado'
          and p.empresa_id = v_empresa
          and coalesce(p.valor_pagado, 0) > 0
          and (timezone('America/Bogota', p.fecha_pago))::date between v_mes_ant_ini and v_mes_ant_fin
      ), 0),
    'egresos_mes_actual',
      coalesce((
        select sum(p.gastos)::numeric(12,0)
        from public.pagos p
        where p.estado is distinct from 'anulado'
          and p.empresa_id = v_empresa
          and coalesce(p.gastos, 0) > 0
          and (timezone('America/Bogota', p.fecha_pago))::date between v_mes_ini and v_hoy
      ), 0),
    'egresos_mes_anterior',
      coalesce((
        select sum(p.gastos)::numeric(12,0)
        from public.pagos p
        where p.estado is distinct from 'anulado'
          and p.empresa_id = v_empresa
          and coalesce(p.gastos, 0) > 0
          and (timezone('America/Bogota', p.fecha_pago))::date between v_mes_ant_ini and v_mes_ant_fin
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
            coalesce(sum(p.valor_pagado), 0)::numeric(12,0) as ingresos
          from public.pagos p
          left join lateral (
            select c.plan_nombre
            from public.contratos c
            where c.conductor_id = p.conductor_id
              and c.empresa_id = v_empresa
            order by
              (c.estado = 'activo') desc,
              (c.estado is distinct from 'anulado') desc,
              coalesce(c.fecha_inicio, c.created_at::date) desc,
              c.created_at desc
            limit 1
          ) ct on true
          where p.estado is distinct from 'anulado'
            and p.empresa_id = v_empresa
            and coalesce(p.valor_pagado, 0) > 0
            and (timezone('America/Bogota', p.fecha_pago))::date between v_desde and v_hasta
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
            'monto', coalesce(cobrado.monto, 0),
            'monto_cuotas', coalesce(cobrado.monto, 0),
            'monto_otros', 0,
            'cantidad_abonos', coalesce(cobrado.cantidad, 0),
            'cantidad_otros', 0
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
            coalesce(sum(p.valor_pagado), 0)::numeric(12,0) as monto,
            count(*)::int as cantidad
          from public.pagos p
          where p.estado is distinct from 'anulado'
            and p.empresa_id = v_empresa
            and coalesce(p.valor_pagado, 0) > 0
            and date_trunc('month', timezone('America/Bogota', p.fecha_pago)) = mes
        ) cobrado on true
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
            coalesce(sum(p.gastos), 0)::numeric(12,0) as monto,
            count(*)::int as cantidad
          from public.pagos p
          where p.estado is distinct from 'anulado'
            and p.empresa_id = v_empresa
            and coalesce(p.gastos, 0) > 0
            and date_trunc('month', timezone('America/Bogota', p.fecha_pago)) = mes
        ) sumas on true
      ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

comment on function public.resumen_dashboard(text) is
  'KPIs staff de LA EMPRESA del JWT. Ingresos = sum(pagos.valor_pagado) no anulado. Egresos = sum(pagos.gastos) no anulado. ingresos_otros = 0 (Excel ya incluye otros en valor_pagado). No toca caja. Mora = cobro_en_mora().';

create index if not exists pagos_dashboard_fecha_idx
  on public.pagos (empresa_id, fecha_pago)
  where estado is distinct from 'anulado';

revoke all on function public.resumen_dashboard(text) from public, anon;
grant execute on function public.resumen_dashboard(text) to authenticated, service_role;

notify pgrst, 'reload schema';
