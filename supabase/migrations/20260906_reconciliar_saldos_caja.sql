-- =============================================================================
-- Conciliar saldos de caja con Excel CONTROL MAQUINA DE DINERO 2026
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Empresa: GoRenting (producción). NO toca GoRenting Pruebas.
--
-- Fuente de verdad HOY (2026-09-01):
--   banco mdd        saldo = 652189 COP
--   banco ahorro_mdd saldo = 1116324 COP
--
-- 1) Informe: saldo actual = sum(ingreso) - sum(egreso) donde estado != anulado.
-- 2) Ajuste idempotente: si el saldo ≠ meta, inserta UN movimiento
--    (ingreso o egreso) con descripción fija. Si ya existe ese ajuste
--    no anulado, no inserta otro. Si el saldo ya es la meta, no hace nada.
-- 3) NO borra historial. NO toca abonos ni cobros.
--
-- Si más adelante se reimporta el Excel fila a fila, anular estos ajustes:
--   update public.movimientos_caja
--   set estado = 'anulado'
--   where descripcion in (
--     'Ajuste conciliación Excel 2026-09-01 (MDD)',
--     'Ajuste conciliación Excel 2026-09-01 (Ahorro MDD)'
--   )
--   and empresa_id = public.empresa_id_produccion();
-- =============================================================================

-- 1) Informe ANTES (visible en Results del SQL Editor)
select
  mc.banco,
  coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else 0 end), 0) as ingresos,
  coalesce(sum(case when mc.tipo = 'egreso' then mc.monto else 0 end), 0) as egresos,
  coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end), 0) as saldo,
  case mc.banco
    when 'mdd' then 652189
    when 'ahorro_mdd' then 1116324
    else null
  end as meta_excel_2026_09_01
from public.movimientos_caja mc
where mc.empresa_id = public.empresa_id_produccion()
  and mc.estado is distinct from 'anulado'
group by mc.banco
order by mc.banco;

-- 2) Ajustes (un movimiento por banco, solo si hace falta)
do $$
declare
  v_empresa uuid;
  v_banco text;
  v_desc text;
  v_meta numeric;
  v_actual numeric;
  v_delta numeric;
  v_ya boolean;
begin
  v_empresa := public.empresa_id_produccion();
  if v_empresa is null then
    raise exception 'No existe la empresa GoRenting (producción)';
  end if;

  for v_banco, v_desc, v_meta in
    select *
    from (
      values
        ('mdd'::text, 'Ajuste conciliación Excel 2026-09-01 (MDD)'::text, 652189::numeric),
        ('ahorro_mdd'::text, 'Ajuste conciliación Excel 2026-09-01 (Ahorro MDD)'::text, 1116324::numeric)
    ) as t(banco, descripcion, meta)
  loop
    select coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end), 0)
      into v_actual
    from public.movimientos_caja mc
    where mc.empresa_id = v_empresa
      and mc.banco = v_banco
      and mc.estado is distinct from 'anulado';

    raise notice 'GoRenting % saldo actual=% meta=%', v_banco, v_actual, v_meta;

    if v_actual = v_meta then
      raise notice '  ya coincide; no se inserta ajuste';
      continue;
    end if;

    select exists (
      select 1
      from public.movimientos_caja mc
      where mc.empresa_id = v_empresa
        and mc.banco = v_banco
        and mc.descripcion = v_desc
        and mc.estado is distinct from 'anulado'
    ) into v_ya;

    if v_ya then
      raise notice '  ajuste "%" ya existe (no anulado); no se inserta otro', v_desc;
      continue;
    end if;

    v_delta := v_meta - v_actual;
    if v_delta = 0 then
      continue;
    end if;

    insert into public.movimientos_caja (
      empresa_id, banco, tipo, monto, fecha, descripcion, estado
    ) values (
      v_empresa,
      v_banco,
      case when v_delta > 0 then 'ingreso' else 'egreso' end,
      abs(v_delta),
      date '2026-09-01',
      v_desc,
      'registrado'
    );

    raise notice '  insertado % de % (%)',
      case when v_delta > 0 then 'ingreso' else 'egreso' end,
      abs(v_delta),
      v_desc;
  end loop;
end $$;

-- 3) Informe DESPUÉS
select
  mc.banco,
  coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else 0 end), 0) as ingresos,
  coalesce(sum(case when mc.tipo = 'egreso' then mc.monto else 0 end), 0) as egresos,
  coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end), 0) as saldo,
  case mc.banco
    when 'mdd' then 652189
    when 'ahorro_mdd' then 1116324
    else null
  end as meta_excel_2026_09_01
from public.movimientos_caja mc
where mc.empresa_id = public.empresa_id_produccion()
  and mc.estado is distinct from 'anulado'
group by mc.banco
order by mc.banco;
