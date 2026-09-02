-- =============================================================================
-- Limpieza producción: Wbeimar al día (sin caja) + mora Diego / Miguel
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Empresa: GoRenting (producción). NO toca GoRenting Pruebas.
--
-- Idempotente. NO hace DELETE (solo anulado / finalizado / activo=false).
--
-- Auditoría panel (control-motos.vercel.app), cartera = 19 periodos / $3.330.000:
--   Wbeimar  1 periodo  $180.000  (contrato Activo FSS51B)
--   Diego    2 periodos $270.000  (contrato Finalizado RIP-44G, activo=false)
--   Miguel  16 periodos $2.880.000 (contrato Finalizado RIP-44G, activo=false)
--
-- Cédulas del Excel pueden NO coincidir con la app. Preferir email + nombre.
-- Caja reciente describe por PLACA (FSS51B / RIP-44G), no por nombre.
--
-- -----------------------------------------------------------------------------
-- 1) Wbeimar — wbeimar@gmail.com / CC 1148144996 / FSS51B
-- -----------------------------------------------------------------------------
-- En la app YA está casi al día. Solo queda 1 cobro en mora $180000.
-- Se inserta UN abono registrado por ese saldo, fecha Excel semana 29 =
-- 2026-09-01 (no 2026-08-31). SIN movimientos_caja:
-- se apaga trg_abonos_sync_pago_caja, se crea el pago, se reenciende.
-- NO se reimporta el histórico Excel (ya está pagado en la app).
--
-- -----------------------------------------------------------------------------
-- 2) Diego — alejandro@gmail.com / Saavedra
--    CC app 1152220006 (Excel tenía 1150220006)
--    Miguel — miguel.rip44g@gorenting.local / CC app 1099000444
-- -----------------------------------------------------------------------------
-- Anular cobros con saldo (los de mora), sus abonos, pagos y caja ligados.
-- Contratos ya finalizados; se deja activo=false. Liberar RIP-44G si aplica.
-- FSS51B y Wbeimar intactos.
--
-- -----------------------------------------------------------------------------
-- 3) Re-conciliar caja → mdd 652189 / ahorro_mdd 1116324
--    Ajustes nuevos 2026-09-02 (no chocan con 2026-09-01).
-- =============================================================================

-- Match de producción (email + nombre primero; cédula Excel o UI).
drop table if exists pg_temp.limpieza_conductores;
create temporary table pg_temp.limpieza_conductores (
  etiqueta text primary key,
  usuario_id uuid not null
);

insert into pg_temp.limpieza_conductores (etiqueta, usuario_id)
select 'wbeimar', u.id
from public.usuarios u
where u.empresa_id = public.empresa_id_produccion()
  and (
    lower(trim(coalesce(u.email, ''))) = 'wbeimar@gmail.com'
    or regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g') = '1148144996'
    or (
      (u.nombre ilike '%Wbeimar%' or u.apellido ilike '%Wbeimar%')
      and (u.nombre ilike '%Berrio%' or u.apellido ilike '%Berrio%')
    )
  )
order by
  case when lower(trim(coalesce(u.email, ''))) = 'wbeimar@gmail.com' then 0 else 1 end,
  u.created_at
limit 1;

insert into pg_temp.limpieza_conductores (etiqueta, usuario_id)
select 'diego', u.id
from public.usuarios u
where u.empresa_id = public.empresa_id_produccion()
  and (
    lower(trim(coalesce(u.email, ''))) = 'alejandro@gmail.com'
    or regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g')
      in ('1152220006', '1150220006')
    or (
      (u.nombre ilike '%Saavedra%' or u.apellido ilike '%Saavedra%')
      and (
        u.nombre ilike '%Diego%' or u.apellido ilike '%Diego%'
        or u.nombre ilike '%Alejandro%' or u.apellido ilike '%Alejandro%'
      )
    )
  )
order by
  case when lower(trim(coalesce(u.email, ''))) = 'alejandro@gmail.com' then 0 else 1 end,
  u.created_at
limit 1;

insert into pg_temp.limpieza_conductores (etiqueta, usuario_id)
select 'miguel', u.id
from public.usuarios u
where u.empresa_id = public.empresa_id_produccion()
  and (
    lower(trim(coalesce(u.email, ''))) = 'miguel.rip44g@gorenting.local'
    or regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g')
      in ('1099000444', '1033178568')
    or (
      (u.nombre ilike '%Miguel%' or u.apellido ilike '%Miguel%')
      and (
        u.nombre ilike '%RIP%' or u.apellido ilike '%RIP%'
        or u.email ilike '%rip44%' or u.email ilike '%rip-44%'
        or u.nombre ilike '%Rojas%' or u.apellido ilike '%Rojas%'
      )
    )
    or (
      (u.nombre ilike '%Miguel%' or u.apellido ilike '%Miguel%')
      and exists (
        select 1
        from public.contratos ct
        join public.motos m on m.id = ct.moto_id
        where ct.conductor_id = u.id
          and ct.empresa_id = public.empresa_id_produccion()
          and regexp_replace(upper(coalesce(m.placa, '')), '[^A-Z0-9]', '', 'g') = 'RIP44G'
      )
    )
  )
order by
  case
    when lower(trim(coalesce(u.email, ''))) = 'miguel.rip44g@gorenting.local' then 0
    else 1
  end,
  u.created_at
limit 1;

-- =============================================================================
-- INFORME INICIO
-- =============================================================================
select
  'INICIO · conductores matcheados (producción; email+nombre > cédula)' as informe,
  lc.etiqueta,
  u.id,
  u.nombre,
  u.apellido,
  u.email,
  u.cedula,
  u.activo,
  u.rol
from pg_temp.limpieza_conductores lc
join public.usuarios u on u.id = lc.usuario_id
order by lc.etiqueta;

select
  'INICIO · cartera abierta (auditoría: 19 per / 3330000)' as informe,
  lc.etiqueta,
  count(*) filter (
    where c.estado is distinct from 'anulado' and coalesce(c.saldo, 0) > 0
  ) as periodos_abiertos,
  coalesce(sum(c.saldo) filter (
    where c.estado is distinct from 'anulado' and coalesce(c.saldo, 0) > 0
  ), 0) as cartera,
  count(*) filter (
    where public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento)
  ) as periodos_mora
from pg_temp.limpieza_conductores lc
left join public.cobros c
  on c.conductor_id = lc.usuario_id
 and c.empresa_id = public.empresa_id_produccion()
group by lc.etiqueta
order by lc.etiqueta;

select
  'INICIO · cobros abiertos / contratos / motos' as informe,
  lc.etiqueta,
  c.numero_periodo,
  c.estado as cobro_estado,
  c.monto_esperado,
  c.monto_pagado,
  c.saldo,
  c.fecha_vencimiento,
  public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento) as en_mora,
  ct.estado as contrato_estado,
  m.placa
from pg_temp.limpieza_conductores lc
join public.cobros c
  on c.conductor_id = lc.usuario_id
 and c.empresa_id = public.empresa_id_produccion()
left join public.contratos ct on ct.id = c.contrato_id
left join public.motos m on m.id = c.moto_id
where c.estado is distinct from 'anulado'
  and coalesce(c.saldo, 0) > 0
order by lc.etiqueta, c.numero_periodo;

-- =============================================================================
-- MUTACIONES
-- =============================================================================
do $$
declare
  v_empresa uuid;
  v_actor uuid;
  v_wbeimar uuid;
  v_diego uuid;
  v_miguel uuid;
  v_rip uuid;
  v_fss uuid;
  v_inactivos uuid[];
  v_caja_off boolean := false;
  v_tag text := 'Limpieza Wbeimar 20260907';
  v_ref text := 'limpieza-20260907-wbeimar';
  r record;
  v_abono_id uuid;
  v_fecha_ts timestamptz;
  v_semana_iso text;
  v_banco text;
  v_desc text;
  v_meta numeric;
  v_actual numeric;
  v_delta numeric;
  v_ya boolean;
  v_n int;
begin
  v_empresa := public.empresa_id_produccion();
  if v_empresa is null then
    raise exception 'No existe la empresa GoRenting (producción)';
  end if;

  select usuario_id into v_wbeimar
  from pg_temp.limpieza_conductores where etiqueta = 'wbeimar';
  select usuario_id into v_diego
  from pg_temp.limpieza_conductores where etiqueta = 'diego';
  select usuario_id into v_miguel
  from pg_temp.limpieza_conductores where etiqueta = 'miguel';

  select u.id
    into v_actor
  from public.usuarios u
  where u.empresa_id = v_empresa
    and u.rol in ('administrador', 'asesor')
    and coalesce(u.activo, true) = true
  order by case when u.rol = 'administrador' then 0 else 1 end, u.created_at
  limit 1;

  if v_actor is null then
    v_actor := coalesce(v_wbeimar, v_diego, v_miguel);
  end if;

  select m.id into v_fss
  from public.motos m
  where m.empresa_id = v_empresa
    and regexp_replace(upper(coalesce(m.placa, '')), '[^A-Z0-9]', '', 'g') = 'FSS51B'
  limit 1;

  select m.id into v_rip
  from public.motos m
  where m.empresa_id = v_empresa
    and regexp_replace(upper(coalesce(m.placa, '')), '[^A-Z0-9]', '', 'g') = 'RIP44G'
  limit 1;

  raise notice 'empresa=% wbeimar=% diego=% miguel=% fss51b=% rip44g=% actor=%',
    v_empresa, v_wbeimar, v_diego, v_miguel, v_fss, v_rip, v_actor;

  -- -------------------------------------------------------------------------
  -- A) Wbeimar: solo el cobro abierto ($180000). Fecha Excel 2026-09-01.
  -- -------------------------------------------------------------------------
  if v_wbeimar is null then
    raise notice 'Wbeimar no matcheó; se omite el abono';
  else
    if v_actor is null then
      raise exception 'No hay usuario responsable para el abono de Wbeimar';
    end if;

    if exists (
      select 1 from pg_trigger
      where tgname = 'trg_abonos_sync_pago_caja'
        and tgrelid = 'public.abonos'::regclass
        and not tgisinternal
    ) then
      execute 'alter table public.abonos enable trigger trg_abonos_sync_pago_caja';
      execute 'alter table public.abonos disable trigger trg_abonos_sync_pago_caja';
      v_caja_off := true;
      raise notice 'trg_abonos_sync_pago_caja DESACTIVADO';
    end if;

    begin
      v_fecha_ts := ((timestamp '2026-09-01 12:00:00') at time zone 'America/Bogota');
      v_semana_iso := '2026-W36';

      v_n := 0;
      for r in
        select c.id, c.contrato_id, c.moto_id, c.saldo, c.numero_periodo
        from public.cobros c
        where c.conductor_id = v_wbeimar
          and c.empresa_id = v_empresa
          and c.estado is distinct from 'anulado'
          and coalesce(c.saldo, 0) > 0
        order by c.numero_periodo, c.fecha_vencimiento
      loop
        if exists (
          select 1 from public.abonos a
          where a.cobro_id = r.id
            and a.referencia = v_ref
            and a.estado is distinct from 'anulado'
        ) then
          continue;
        end if;

        insert into public.abonos (
          cobro_id, contrato_id, conductor_id, monto, fecha_pago,
          metodo_pago, referencia, responsable_id, origen_abono, estado,
          observaciones, confirmado_por, confirmado_en, empresa_id
        ) values (
          r.id,
          r.contrato_id,
          v_wbeimar,
          r.saldo,
          v_fecha_ts,
          'TRANSFERENCIA',
          v_ref,
          v_actor,
          'sistema',
          'registrado',
          v_tag || ' · Excel FSS51B semana 29 · 2026-09-01 · periodo ' || r.numero_periodo,
          v_actor,
          v_fecha_ts,
          v_empresa
        )
        returning id into v_abono_id;

        if not exists (select 1 from public.pagos p where p.abono_id = v_abono_id) then
          insert into public.pagos (
            conductor_id, moto_id, fecha_pago, monto, valor_pagado, gastos,
            metodo_pago, observaciones, semana, pagado, registrado_por,
            abono_id, estado, empresa_id
          ) values (
            v_wbeimar,
            r.moto_id,
            v_fecha_ts,
            r.saldo,
            r.saldo,
            0,
            'TRANSFERENCIA',
            v_tag || ' · Excel FSS51B semana 29 · 2026-09-01',
            v_semana_iso,
            true,
            v_actor,
            v_abono_id,
            'registrado',
            v_empresa
          );
        end if;
        -- SIN movimientos_caja.
        v_n := v_n + 1;
      end loop;

      raise notice 'Wbeimar: % cobro(s) cerrado(s) con abono 2026-09-01 sin caja', v_n;

      update public.abonos a
        set estado = 'anulado',
            anulado_en = coalesce(a.anulado_en, now()),
            anulado_por = coalesce(a.anulado_por, v_actor),
            motivo_anulacion = coalesce(a.motivo_anulacion, v_tag || ' · pendiente sustituido'),
            updated_at = now()
      where a.conductor_id = v_wbeimar
        and a.empresa_id = v_empresa
        and a.estado = 'pendiente_confirmacion';

      insert into public.pagos (
        conductor_id, moto_id, fecha_pago, monto, valor_pagado, gastos,
        metodo_pago, observaciones, semana, pagado, registrado_por,
        abono_id, estado, empresa_id
      )
      select
        a.conductor_id,
        c.moto_id,
        a.fecha_pago,
        a.monto,
        a.monto,
        0,
        coalesce(a.metodo_pago, 'TRANSFERENCIA'),
        coalesce(a.observaciones, v_tag),
        to_char((timezone('America/Bogota', a.fecha_pago))::date, 'IYYY')
          || '-W' || to_char((timezone('America/Bogota', a.fecha_pago))::date, 'IW'),
        true,
        coalesce(a.confirmado_por, a.responsable_id),
        a.id,
        'registrado',
        v_empresa
      from public.abonos a
      join public.cobros c on c.id = a.cobro_id
      where a.conductor_id = v_wbeimar
        and a.empresa_id = v_empresa
        and a.referencia = v_ref
        and a.estado = 'registrado'
        and not exists (select 1 from public.pagos p where p.abono_id = a.id);

    exception
      when others then
        if v_caja_off then
          execute 'alter table public.abonos enable trigger trg_abonos_sync_pago_caja';
        end if;
        raise;
    end;

    if v_caja_off then
      execute 'alter table public.abonos enable trigger trg_abonos_sync_pago_caja';
      v_caja_off := false;
      raise notice 'trg_abonos_sync_pago_caja REACTIVADO';
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- B) Diego / Miguel: anular mora (trigger de caja activo)
  -- -------------------------------------------------------------------------
  v_inactivos := array_remove(array[v_diego, v_miguel], null);
  if coalesce(cardinality(v_inactivos), 0) = 0 then
    raise notice 'Diego/Miguel no matchearon; se omite la baja de mora';
  else
    -- Solo cobros que aún mueven cartera (saldo > 0). Los pagados se dejan.
    update public.cobros c
      set estado = 'anulado',
          anulado_en = coalesce(c.anulado_en, now()),
          anulado_por = coalesce(c.anulado_por, v_actor),
          motivo_anulacion = coalesce(c.motivo_anulacion, 'Baja conductor inactivo 20260907'),
          updated_at = now()
    where c.empresa_id = v_empresa
      and c.conductor_id = any (v_inactivos)
      and c.estado is distinct from 'anulado'
      and coalesce(c.saldo, 0) > 0;

    update public.abonos a
      set estado = 'anulado',
          anulado_en = coalesce(a.anulado_en, now()),
          anulado_por = coalesce(a.anulado_por, v_actor),
          motivo_anulacion = coalesce(a.motivo_anulacion, 'Baja conductor inactivo 20260907'),
          updated_at = now()
    where a.empresa_id = v_empresa
      and a.conductor_id = any (v_inactivos)
      and a.estado is distinct from 'anulado'
      and (
        a.estado = 'pendiente_confirmacion'
        or exists (
          select 1 from public.cobros c
          where c.id = a.cobro_id
            and c.estado = 'anulado'
            and c.motivo_anulacion = 'Baja conductor inactivo 20260907'
        )
      );

    update public.pagos p
      set estado = 'anulado',
          pagado = false
    where p.empresa_id = v_empresa
      and p.estado is distinct from 'anulado'
      and (
        p.abono_id in (
          select a.id from public.abonos a
          where a.conductor_id = any (v_inactivos)
            and a.estado = 'anulado'
        )
        or (
          p.conductor_id = any (v_inactivos)
          and p.abono_id is null
          and coalesce(p.pagado, true) = true
          and exists (
            select 1 from public.cobros c
            where c.conductor_id = p.conductor_id
              and c.empresa_id = v_empresa
              and c.estado = 'anulado'
              and c.motivo_anulacion = 'Baja conductor inactivo 20260907'
          )
        )
      );

    -- Caja ligada por abono/pago. Descripciones usan placa (RIP-44G), no nombre.
    update public.movimientos_caja mc
      set estado = 'anulado'
    where mc.empresa_id = v_empresa
      and mc.estado is distinct from 'anulado'
      and (
        mc.abono_id in (
          select a.id from public.abonos a
          where a.conductor_id = any (v_inactivos)
        )
        or mc.pago_id in (
          select p.id from public.pagos p
          where p.conductor_id = any (v_inactivos)
            and p.estado = 'anulado'
        )
      );

    update public.contratos ct
      set estado = case
            when ct.estado = 'borrador' then 'anulado'
            else 'finalizado'
          end,
          finalizado_en = case
            when ct.estado = 'activo' then coalesce(ct.finalizado_en, now())
            else ct.finalizado_en
          end,
          updated_at = now()
    where ct.empresa_id = v_empresa
      and ct.conductor_id = any (v_inactivos)
      and ct.estado in ('borrador', 'activo');

    update public.usuarios u
      set activo = false,
          updated_at = now()
    where u.empresa_id = v_empresa
      and u.id = any (v_inactivos)
      and coalesce(u.activo, true) = true;

    if v_rip is not null
       and (v_fss is null or v_rip is distinct from v_fss)
       and not exists (
         select 1 from public.contratos ct
         where ct.moto_id = v_rip
           and ct.empresa_id = v_empresa
           and ct.estado = 'activo'
       )
    then
      update public.motos m
        set estado = 'disponible',
            conductor_id = null,
            updated_at = now()
      where m.id = v_rip
        and m.empresa_id = v_empresa
        and (
          m.conductor_id is null
          or m.conductor_id = any (v_inactivos)
        );
      raise notice 'RIP-44G liberada si seguía asignada';
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- C) Ajustes caja 2026-09-02 → 652189 / 1116324
  -- -------------------------------------------------------------------------
  for v_banco, v_desc, v_meta in
    select *
    from (
      values
        ('mdd'::text,
         'Ajuste post-limpieza conductores 2026-09-02 (MDD)'::text,
         652189::numeric),
        ('ahorro_mdd'::text,
         'Ajuste post-limpieza conductores 2026-09-02 (Ahorro MDD)'::text,
         1116324::numeric)
    ) as t(banco, descripcion, meta)
  loop
    select coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end), 0)
      into v_actual
    from public.movimientos_caja mc
    where mc.empresa_id = v_empresa
      and mc.banco = v_banco
      and mc.estado is distinct from 'anulado';

    raise notice 'caja % saldo=% meta=% delta=%',
      v_banco, v_actual, v_meta, (v_meta - v_actual);

    if v_actual = v_meta then
      raise notice '  % ya coincide; no se inserta ajuste 2026-09-02', v_banco;
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
      raise notice '  ajuste "%" ya existe; no se inserta otro', v_desc;
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
      date '2026-09-02',
      v_desc,
      'registrado'
    );

    raise notice '  insertado % de % (%)',
      case when v_delta > 0 then 'ingreso' else 'egreso' end,
      abs(v_delta),
      v_desc;
  end loop;

  if v_caja_off then
    execute 'alter table public.abonos enable trigger trg_abonos_sync_pago_caja';
  end if;
end $$;

-- =============================================================================
-- INFORME FINAL
-- =============================================================================
select
  'FINAL · cartera (Wbeimar 0 mora; Diego/Miguel 0 abiertos)' as informe,
  lc.etiqueta,
  u.email,
  u.cedula,
  u.activo,
  count(*) filter (
    where c.estado is distinct from 'anulado' and coalesce(c.saldo, 0) > 0
  ) as periodos_abiertos,
  coalesce(sum(c.saldo) filter (
    where c.estado is distinct from 'anulado' and coalesce(c.saldo, 0) > 0
  ), 0) as cartera,
  count(*) filter (
    where public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento)
  ) as periodos_mora
from pg_temp.limpieza_conductores lc
join public.usuarios u on u.id = lc.usuario_id
left join public.cobros c
  on c.conductor_id = lc.usuario_id
 and c.empresa_id = public.empresa_id_produccion()
group by lc.etiqueta, u.email, u.cedula, u.activo
order by lc.etiqueta;

select
  'FINAL · cobros Wbeimar (abiertos deben ser 0; caja_de_esta_limpieza = 0)' as informe,
  c.numero_periodo,
  c.estado,
  c.monto_esperado,
  c.monto_pagado,
  c.saldo,
  c.fecha_vencimiento,
  public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento) as en_mora,
  (
    select count(*)
    from public.movimientos_caja mc
    join public.abonos a on a.id = mc.abono_id
    where a.cobro_id = c.id
      and a.referencia = 'limpieza-20260907-wbeimar'
      and mc.estado is distinct from 'anulado'
  ) as caja_de_esta_limpieza
from public.cobros c
join pg_temp.limpieza_conductores lc
  on lc.usuario_id = c.conductor_id and lc.etiqueta = 'wbeimar'
where c.empresa_id = public.empresa_id_produccion()
order by c.numero_periodo;

select
  'FINAL · estado_cuenta_conductor' as informe,
  lc.etiqueta,
  public.estado_cuenta_conductor(lc.usuario_id) as estado_cuenta
from pg_temp.limpieza_conductores lc
order by lc.etiqueta;

select
  'FINAL · contratos / motos (FSS51B intacta)' as informe,
  lc.etiqueta,
  ct.estado as contrato_estado,
  m.placa,
  m.estado as moto_estado,
  m.conductor_id is not null as moto_asignada
from pg_temp.limpieza_conductores lc
left join public.contratos ct
  on ct.conductor_id = lc.usuario_id
 and ct.empresa_id = public.empresa_id_produccion()
left join public.motos m on m.id = ct.moto_id
order by lc.etiqueta, ct.created_at;

select
  'FINAL · caja producción vs meta Excel' as informe,
  mc.banco,
  coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else 0 end), 0) as ingresos,
  coalesce(sum(case when mc.tipo = 'egreso' then mc.monto else 0 end), 0) as egresos,
  coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end), 0) as saldo_todas_las_filas,
  case mc.banco
    when 'mdd' then 652189
    when 'ahorro_mdd' then 1116324
    else null
  end as meta_excel
from public.movimientos_caja mc
where mc.empresa_id = public.empresa_id_produccion()
  and mc.estado is distinct from 'anulado'
group by mc.banco
order by mc.banco;

-- Si el script falla a mitad y el trigger queda apagado:
--   alter table public.abonos enable trigger trg_abonos_sync_pago_caja;
