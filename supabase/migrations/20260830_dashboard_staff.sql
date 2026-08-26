-- =============================================================================
-- Dashboard staff — KPIs reales (ingresos, contratos, flota, cartera, mora, planes)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260829_talleres_confianza.sql si aún no lo corriste)
--
-- Idempotente: se puede correr más de una vez.
--
-- Qué hace:
--   1) rango_periodo_dashboard(semana|mes|anio) en calendario America/Bogota
--      (reusa hoy_colombia() de 20260826).
--   2) RPC resumen_dashboard(p_periodo) — agrega en Postgres. Solo staff
--      (administrador/asesor). El navegador no suma miles de filas.
--
-- Qué NO hace (a propósito):
--   - NO toca cobro_en_mora / en_mora / resumen_cobros / estado_cuenta_conductor.
--   - NO toca triggers de cobros/abonos ni generación de cobros.
--   - NO reescribe cuota_semanal, planes, talleres ni contratos.
--
-- Definiciones (también en supabase/README.md):
--   Ingresos = sum(abonos.monto) donde estado = 'registrado'
--     (excluye anulado y pendiente_confirmacion). Fecha = fecha_pago en Bogota.
--   Contratos nuevos = contratos con fecha_inicio en el periodo y estado <> anulado.
--     Se usa fecha_inicio (inicio comercial), no created_at (alta del borrador).
--   Conductores activos = distinct conductor_id con contrato estado = activo.
--   Motos alquiladas = motos.estado = 'en_uso' (no se inventan estados).
--   Motos disponibles = motos.estado = 'disponible'.
--   Cartera = sum(cobros.saldo) donde estado <> anulado.
--   Mora = cobro_en_mora() (columna computada / misma regla SQL). No se recalcula
--     en el browser.
--   Crecimiento mensual = ingresos del mes calendario actual vs mes anterior
--     (independiente del filtro semana/mes/año).
--   Planes = contrato.plan_nombre snapshot; NULL/vacío → 'Sin plan'.
-- =============================================================================

-- Rango del filtro: semana ISO (lun–dom), mes o año, según hoy en Bogota.
create or replace function public.rango_periodo_dashboard(p_periodo text default 'mes')
returns table (periodo text, desde date, hasta date)
language plpgsql
stable
set search_path = public
as $$
declare
  v_periodo text;
  v_hoy date;
  v_desde date;
  v_hasta date;
begin
  v_periodo := lower(trim(coalesce(p_periodo, 'mes')));
  if v_periodo in ('año', 'ano', 'year') then
    v_periodo := 'anio';
  elsif v_periodo in ('week', 'semana') then
    v_periodo := 'semana';
  elsif v_periodo in ('month', 'mes') then
    v_periodo := 'mes';
  else
    v_periodo := 'mes';
  end if;

  v_hoy := public.hoy_colombia();

  if v_periodo = 'semana' then
    v_desde := date_trunc('week', v_hoy::timestamp)::date;
    v_hasta := v_desde + 6;
  elsif v_periodo = 'anio' then
    v_desde := make_date(extract(year from v_hoy)::int, 1, 1);
    v_hasta := make_date(extract(year from v_hoy)::int, 12, 31);
  else
    v_desde := date_trunc('month', v_hoy::timestamp)::date;
    v_hasta := (date_trunc('month', v_hoy::timestamp) + interval '1 month' - interval '1 day')::date;
  end if;

  periodo := v_periodo;
  desde := v_desde;
  hasta := v_hasta;
  return next;
end;
$$;

comment on function public.rango_periodo_dashboard(text) is
  'Rango semana|mes|anio en America/Bogota. Semana ISO lunes–domingo. Default mes.';

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
  v_result jsonb;
begin
  -- JWT de empleado: 42501. SQL Editor (sin JWT) y service_role sí pueden verificar.
  if auth.uid() is not null and not public.es_staff() then
    raise exception 'Solo el staff (administrador/asesor) puede consultar el dashboard'
      using errcode = '42501';
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
          and (timezone('America/Bogota', a.fecha_pago))::date between v_desde and v_hasta
      ), 0),
    'cantidad_abonos_periodo',
      coalesce((
        select count(*)::int
        from public.abonos a
        where a.estado = 'registrado'
          and (timezone('America/Bogota', a.fecha_pago))::date between v_desde and v_hasta
      ), 0),
    'contratos_activos',
      coalesce((select count(*)::int from public.contratos c where c.estado = 'activo'), 0),
    'contratos_nuevos',
      coalesce((
        select count(*)::int
        from public.contratos c
        where c.estado is distinct from 'anulado'
          and c.fecha_inicio between v_desde and v_hasta
      ), 0),
    'conductores_activos',
      coalesce((
        select count(distinct c.conductor_id)::int
        from public.contratos c
        where c.estado = 'activo'
      ), 0),
    'motos_total',
      coalesce((select count(*)::int from public.motos), 0),
    'motos_alquiladas',
      coalesce((select count(*)::int from public.motos m where m.estado = 'en_uso'), 0),
    'motos_disponibles',
      coalesce((select count(*)::int from public.motos m where m.estado = 'disponible'), 0),
    'motos_en_mantenimiento',
      coalesce((select count(*)::int from public.motos m where m.estado = 'en_mantenimiento'), 0),
    'motos_fuera_servicio',
      coalesce((select count(*)::int from public.motos m where m.estado = 'fuera_servicio'), 0),
    'cartera',
      coalesce((
        select sum(c.saldo)::numeric(12,0)
        from public.cobros c
        where c.estado is distinct from 'anulado'
      ), 0),
    'mora_cantidad',
      coalesce((
        select count(*)::int
        from public.cobros c
        where public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento)
      ), 0),
    'mora_monto',
      coalesce((
        select sum(c.saldo)::numeric(12,0)
        from public.cobros c
        where public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento)
      ), 0),
    'ingresos_mes_actual',
      coalesce((
        select sum(a.monto)::numeric(12,0)
        from public.abonos a
        where a.estado = 'registrado'
          and (timezone('America/Bogota', a.fecha_pago))::date between v_mes_ini and v_hoy
      ), 0),
    'ingresos_mes_anterior',
      coalesce((
        select sum(a.monto)::numeric(12,0)
        from public.abonos a
        where a.estado = 'registrado'
          and (timezone('America/Bogota', a.fecha_pago))::date between v_mes_ant_ini and v_mes_ant_fin
      ), 0),
    'planes',
      coalesce((
        with plan_activos as (
          select
            coalesce(nullif(btrim(c.plan_nombre), ''), 'Sin plan') as plan_nombre,
            count(*)::int as contratos_activos
          from public.contratos c
          where c.estado = 'activo'
          group by 1
        ),
        plan_ingresos as (
          select
            coalesce(nullif(btrim(ct.plan_nombre), ''), 'Sin plan') as plan_nombre,
            coalesce(sum(a.monto), 0)::numeric(12,0) as ingresos
          from public.abonos a
          join public.contratos ct on ct.id = a.contrato_id
          where a.estado = 'registrado'
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
            and date_trunc('month', timezone('America/Bogota', a.fecha_pago)) = mes
        ) sumas on true
      ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

comment on function public.resumen_dashboard(text) is
  'KPIs del dashboard staff. p_periodo: semana|mes|anio (default mes, America/Bogota). Ingresos = abonos registrados. Mora usa cobro_en_mora().';

create index if not exists abonos_registrados_fecha_idx
  on public.abonos (fecha_pago)
  where estado = 'registrado';

revoke all on function public.rango_periodo_dashboard(text) from public, anon;
revoke all on function public.resumen_dashboard(text) from public, anon;
grant execute on function public.rango_periodo_dashboard(text) to authenticated, service_role;
grant execute on function public.resumen_dashboard(text) to authenticated, service_role;

notify pgrst, 'reload schema';
