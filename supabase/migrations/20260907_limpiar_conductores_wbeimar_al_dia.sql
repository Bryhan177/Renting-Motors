-- =============================================================================
-- Limpieza producción: Wbeimar al día (sin caja) + baja Diego / Miguel
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Empresa: GoRenting (producción). NO toca GoRenting Pruebas.
--
-- Idempotente. Se puede pegar más de una vez.
-- NO hace DELETE de filas financieras (solo anulado / finalizado / activo=false).
--
-- -----------------------------------------------------------------------------
-- 1) Wbeimar Berrio Martínez (FSS51B) — al día, SIN inflar Flujo de caja
-- -----------------------------------------------------------------------------
-- Cobros.monto_pagado / saldo / estado salen de sum(abonos.estado='registrado')
-- (migración 20260826). Por eso hay que insertar abonos REGISTRADOS.
-- El trigger trg_abonos_sync_pago_caja (20260831 / 20260901) crearía
-- movimientos_caja al insertar esos abonos. Aquí se DESACTIVA solo ese
-- trigger, se insertan abonos + pagos (pantalla Pagos) y se VUELVE a
-- activar. movimientos_caja de Wbeimar no se toca ni se crea.
--
-- Fechas: REGISTRO DE PAGOS, columna AUTECO BAJAJ PLATINO 100 FSS51B
-- (hoja pública gid 1356346860). No se inventan fechas de Excel.
-- Semana 1 = gavela (valor 0, no deuda, no caja).
-- Si el Excel no trae la última cuota y el dueño la cobró ayer
-- (2026-08-31 America/Bogota), solo ESE periodo usa 2026-08-31.
-- Periodos residuales más viejos (Excel se acabó y el cobro sigue
-- abierto) usan least(fecha_vencimiento, 2026-08-31).
-- Gastos del dueño (ej. llanta 90.000) NO son abono del conductor.
--
-- -----------------------------------------------------------------------------
-- 2) Diego Alejandro Saavedra Montoya y Miguel Ángel Rojas Morales (RIP-44G)
-- -----------------------------------------------------------------------------
-- Soft-clean: anular abonos / cobros pendientes / pagos / caja ligados;
-- contratos borrador→anulado, activo→finalizado; usuarios.activo=false;
-- liberar RIP-44G si ya no hay contrato activo. FSS51B y Wbeimar intactos.
--
-- -----------------------------------------------------------------------------
-- 3) Re-conciliar caja a las metas Excel (después de anular caja de inactivos)
-- -----------------------------------------------------------------------------
-- Metas (igual que 20260906_reconciliar_saldos_caja.sql):
--   mdd        = 652189
--   ahorro_mdd = 1116324
-- Ajustes NUEVOS con fecha 2026-09-02 (no chocan con los de 2026-09-01):
--   'Ajuste post-limpieza conductores 2026-09-02 (MDD)'
--   'Ajuste post-limpieza conductores 2026-09-02 (Ahorro MDD)'
-- Si el dueño aún no corrió 20260906, este bloque deja el saldo en la meta.
-- =============================================================================

-- Fechas Excel FSS51B (varias filas la misma semana = varios abonos).
drop table if exists pg_temp.excel_fss51b;
create temporary table pg_temp.excel_fss51b (
  semana int not null,
  fecha date not null,
  monto numeric(12,0) not null,
  metodo text not null,
  obs text not null,
  seq int not null
);

-- Semana 1 Excel = gavela (valor 0, obs 'Se otorga gavela de 1 semana...').
-- No hay fila aquí: abonos.monto > 0 y no hay fecha de cobro en el Excel.
-- El DO anula cobro numero_periodo=1 si no tiene abonos registrados.
insert into pg_temp.excel_fss51b (semana, fecha, monto, metodo, obs, seq) values
  -- Semana 2: 01/03/2026
  (2, date '2026-03-01', 50000, 'TRANSFERENCIA',
   'Excel FSS51B semana 2 · transferencia', 1),
  (2, date '2026-03-01', 130000, 'EFECTIVO',
   'Excel FSS51B semana 2 · efectivo (gasto llanta 90000 del dueño IGNORADO)', 2),
  -- Semana 3: 08/03/2026
  (3, date '2026-03-08', 140000, 'TRANSFERENCIA',
   'Excel FSS51B semana 3 · 140000', 1),
  (3, date '2026-03-08', 40000, 'TRANSFERENCIA',
   'Excel FSS51B semana 3 · 40000', 2),
  -- Semana 4: 16/03/2026
  (4, date '2026-03-16', 180000, 'TRANSFERENCIA',
   'Excel FSS51B semana 4 · 180000', 1);
  -- Semanas 5+ del mismo sheet (gid 1356346860): pegar más VALUES aquí.
  -- No inventar fechas. Si el Excel no trae la última cuota de la app,
  -- el residual usa 2026-08-31 solo en el periodo más reciente.

-- =============================================================================
-- INFORME INICIO — quién matcheó (producción)
-- =============================================================================
select
  'INICIO · conductores matcheados (solo GoRenting producción)' as informe,
  u.id,
  u.nombre,
  u.apellido,
  u.cedula,
  u.rol,
  u.activo,
  case
    when regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g') = '1148144996'
      or (
        (u.nombre ilike '%Wbeimar%' or u.apellido ilike '%Wbeimar%')
        and (u.nombre ilike '%Berrio%' or u.apellido ilike '%Berrio%')
      )
      then 'wbeimar'
    when regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g') = '1150220006'
      or (
        (u.nombre ilike '%Diego%' or u.apellido ilike '%Diego%')
        and (u.nombre ilike '%Saavedra%' or u.apellido ilike '%Saavedra%')
      )
      then 'diego'
    when regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g') = '1033178568'
      or (
        (u.nombre ilike '%Miguel%' or u.apellido ilike '%Miguel%')
        and (u.nombre ilike '%Rojas%' or u.apellido ilike '%Rojas%')
        and (u.nombre ilike '%Morales%' or u.apellido ilike '%Morales%')
      )
      then 'miguel'
    else 'otro'
  end as etiqueta
from public.usuarios u
where u.empresa_id = public.empresa_id_produccion()
  and (
    regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g')
      in ('1148144996', '1150220006', '1033178568')
    or (
      (u.nombre ilike '%Wbeimar%' or u.apellido ilike '%Wbeimar%')
      and (u.nombre ilike '%Berrio%' or u.apellido ilike '%Berrio%')
    )
    or (
      (u.nombre ilike '%Diego%' or u.apellido ilike '%Diego%')
      and (u.nombre ilike '%Saavedra%' or u.apellido ilike '%Saavedra%')
    )
    or (
      (u.nombre ilike '%Miguel%' or u.apellido ilike '%Miguel%')
      and (u.nombre ilike '%Rojas%' or u.apellido ilike '%Rojas%')
    )
  )
order by etiqueta, u.apellido, u.nombre;

select
  'INICIO · cobros / contratos / motos de los matcheados' as informe,
  u.nombre || ' ' || u.apellido as conductor,
  c.id as cobro_id,
  c.numero_periodo,
  c.estado as cobro_estado,
  c.monto_esperado,
  c.monto_pagado,
  c.saldo,
  c.fecha_vencimiento,
  ct.estado as contrato_estado,
  m.placa,
  m.estado as moto_estado,
  m.conductor_id as moto_conductor_id
from public.usuarios u
join public.cobros c
  on c.conductor_id = u.id
 and c.empresa_id = public.empresa_id_produccion()
left join public.contratos ct
  on ct.id = c.contrato_id
left join public.motos m
  on m.id = c.moto_id
where u.empresa_id = public.empresa_id_produccion()
  and (
    regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g')
      in ('1148144996', '1150220006', '1033178568')
    or (u.nombre ilike '%Wbeimar%' and u.apellido ilike '%Berrio%')
    or (u.nombre ilike '%Berrio%' and u.apellido ilike '%Wbeimar%')
    or (u.nombre ilike '%Diego%' and u.apellido ilike '%Saavedra%')
    or (u.nombre ilike '%Saavedra%' and u.apellido ilike '%Diego%')
    or (u.nombre ilike '%Miguel%' and (u.nombre ilike '%Rojas%' or u.apellido ilike '%Rojas%'))
    or (u.apellido ilike '%Rojas%' and u.apellido ilike '%Morales%')
  )
order by conductor, c.numero_periodo;

select
  'INICIO · Excel FSS51B (filas con monto>0 se vuelven abonos; gavela se salta)' as informe,
  e.semana,
  e.fecha,
  e.monto,
  e.metodo,
  e.obs
from pg_temp.excel_fss51b e
order by e.semana, e.seq;

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
  v_cobro_id uuid;
  v_contrato_id uuid;
  v_moto_id uuid;
  v_abono_id uuid;
  v_fecha_ts timestamptz;
  v_semana_iso text;
  v_latest uuid;
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

  -- Staff de producción (responsable_id es NOT NULL).
  select u.id
    into v_actor
  from public.usuarios u
  where u.empresa_id = v_empresa
    and u.rol in ('administrador', 'asesor')
    and coalesce(u.activo, true) = true
  order by case when u.rol = 'administrador' then 0 else 1 end, u.created_at
  limit 1;

  -- Wbeimar: cédula Excel o nombre/apellido. Preferir el ligado a FSS51B.
  select u.id
    into v_wbeimar
  from public.usuarios u
  where u.empresa_id = v_empresa
    and (
      regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g') = '1148144996'
      or (
        (u.nombre ilike '%Wbeimar%' or u.apellido ilike '%Wbeimar%')
        and (u.nombre ilike '%Berrio%' or u.apellido ilike '%Berrio%')
      )
    )
  order by
    case when exists (
      select 1
      from public.contratos ct
      join public.motos m on m.id = ct.moto_id
      where ct.conductor_id = u.id
        and ct.empresa_id = v_empresa
        and regexp_replace(upper(coalesce(m.placa, '')), '[^A-Z0-9]', '', 'g') = 'FSS51B'
    ) then 0 else 1 end,
    u.created_at
  limit 1;

  select u.id
    into v_diego
  from public.usuarios u
  where u.empresa_id = v_empresa
    and (
      regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g') = '1150220006'
      or (
        (u.nombre ilike '%Diego%' or u.apellido ilike '%Diego%')
        and (u.nombre ilike '%Saavedra%' or u.apellido ilike '%Saavedra%')
      )
    )
  order by u.created_at
  limit 1;

  select u.id
    into v_miguel
  from public.usuarios u
  where u.empresa_id = v_empresa
    and (
      regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g') = '1033178568'
      or (
        (u.nombre ilike '%Miguel%' or u.apellido ilike '%Miguel%')
        and (
          (u.nombre ilike '%Rojas%' or u.apellido ilike '%Rojas%')
          and (u.nombre ilike '%Morales%' or u.apellido ilike '%Morales%')
        )
      )
      or exists (
        select 1
        from public.motos m
        where m.conductor_id = u.id
          and m.empresa_id = v_empresa
          and regexp_replace(upper(coalesce(m.placa, '')), '[^A-Z0-9]', '', 'g') = 'RIP44G'
      )
      or exists (
        select 1
        from public.contratos ct
        join public.motos m on m.id = ct.moto_id
        where ct.conductor_id = u.id
          and ct.empresa_id = v_empresa
          and regexp_replace(upper(coalesce(m.placa, '')), '[^A-Z0-9]', '', 'g') = 'RIP44G'
      )
    )
  order by u.created_at
  limit 1;

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

  if v_actor is null then
    v_actor := coalesce(v_wbeimar, v_diego, v_miguel);
  end if;

  raise notice 'empresa=% wbeimar=% diego=% miguel=% fss51b=% rip44g=% actor=%',
    v_empresa, v_wbeimar, v_diego, v_miguel, v_fss, v_rip, v_actor;

  -- -------------------------------------------------------------------------
  -- A) Wbeimar al día sin caja
  -- -------------------------------------------------------------------------
  if v_wbeimar is null then
    raise notice 'Wbeimar no matcheó en producción; se omite el alta de abonos';
  else
    if v_actor is null then
      raise exception 'No hay usuario responsable para insertar abonos de Wbeimar';
    end if;

    -- Por si un run anterior dejó el trigger apagado.
    if exists (
      select 1 from pg_trigger
      where tgname = 'trg_abonos_sync_pago_caja'
        and tgrelid = 'public.abonos'::regclass
        and not tgisinternal
    ) then
      execute 'alter table public.abonos enable trigger trg_abonos_sync_pago_caja';
      execute 'alter table public.abonos disable trigger trg_abonos_sync_pago_caja';
      v_caja_off := true;
      raise notice 'trg_abonos_sync_pago_caja DESACTIVADO (no se crea caja)';
    else
      raise notice 'trg_abonos_sync_pago_caja no existe; se insertan abonos sin sync de caja';
    end if;

    begin
      -- Gavela semana 1: no deuda. Anular cobro periodo 1 sin abonos registrados.
      update public.cobros c
        set estado = 'anulado',
            anulado_en = coalesce(c.anulado_en, now()),
            motivo_anulacion = coalesce(c.motivo_anulacion, v_tag || ' · gavela Excel semana 1'),
            updated_at = now()
      where c.conductor_id = v_wbeimar
        and c.empresa_id = v_empresa
        and c.numero_periodo = 1
        and c.estado is distinct from 'anulado'
        and not exists (
          select 1 from public.abonos a
          where a.cobro_id = c.id and a.estado = 'registrado'
        );

      -- Abonos Excel (monto > 0). Empareja numero_periodo ≈ semana; si no, más viejo primero.
      for r in
        select *
        from pg_temp.excel_fss51b e
        where e.monto > 0
        order by e.semana, e.fecha, e.seq
      loop
        v_cobro_id := null;
        v_contrato_id := null;
        v_moto_id := null;

        select c.id, c.contrato_id, c.moto_id
          into v_cobro_id, v_contrato_id, v_moto_id
        from public.cobros c
        where c.conductor_id = v_wbeimar
          and c.empresa_id = v_empresa
          and c.numero_periodo = r.semana
          and c.estado is distinct from 'anulado'
          and coalesce(c.saldo, 0) > 0
        order by c.fecha_vencimiento
        limit 1;

        if v_cobro_id is null then
          select c.id, c.contrato_id, c.moto_id
            into v_cobro_id, v_contrato_id, v_moto_id
          from public.cobros c
          where c.conductor_id = v_wbeimar
            and c.empresa_id = v_empresa
            and c.estado is distinct from 'anulado'
            and coalesce(c.saldo, 0) > 0
          order by c.numero_periodo, c.fecha_vencimiento
          limit 1;
        end if;

        if v_cobro_id is null then
          raise notice 'Excel semana % % %: no hay cobro con saldo; se omite',
            r.semana, r.fecha, r.monto;
          continue;
        end if;

        if exists (
          select 1 from public.abonos a
          where a.cobro_id = v_cobro_id
            and a.referencia = v_ref
            and a.monto = r.monto
            and (timezone('America/Bogota', a.fecha_pago))::date = r.fecha
            and a.estado is distinct from 'anulado'
        ) then
          continue;
        end if;

        v_fecha_ts := ((r.fecha::timestamp + time '12:00') at time zone 'America/Bogota');

        insert into public.abonos (
          cobro_id, contrato_id, conductor_id, monto, fecha_pago,
          metodo_pago, referencia, responsable_id, origen_abono, estado,
          observaciones, confirmado_por, confirmado_en, empresa_id
        ) values (
          v_cobro_id,
          v_contrato_id,
          v_wbeimar,
          r.monto,
          v_fecha_ts,
          r.metodo,
          v_ref,
          v_actor,
          'sistema',
          'registrado',
          v_tag || ' · ' || r.obs,
          v_actor,
          v_fecha_ts,
          v_empresa
        )
        returning id into v_abono_id;

        v_semana_iso := to_char(r.fecha, 'IYYY') || '-W' || to_char(r.fecha, 'IW');

        if not exists (select 1 from public.pagos p where p.abono_id = v_abono_id) then
          insert into public.pagos (
            conductor_id, moto_id, fecha_pago, monto, valor_pagado, gastos,
            metodo_pago, observaciones, semana, pagado, registrado_por,
            abono_id, estado, empresa_id
          ) values (
            v_wbeimar,
            v_moto_id,
            v_fecha_ts,
            r.monto,
            r.monto,
            0,
            r.metodo,
            v_tag || ' · ' || r.obs,
            v_semana_iso,
            true,
            v_actor,
            v_abono_id,
            'registrado',
            v_empresa
          );
        end if;
        -- SIN insert a movimientos_caja.
      end loop;

      -- Residual: cobros que siguen con saldo (Excel se acabó o no cubrió).
      -- La última cuota abierta usa 2026-08-31 (pago de ayer si el Excel atrasó).
      select c.id
        into v_latest
      from public.cobros c
      where c.conductor_id = v_wbeimar
        and c.empresa_id = v_empresa
        and c.estado is distinct from 'anulado'
        and coalesce(c.saldo, 0) > 0
      order by c.numero_periodo desc, c.fecha_vencimiento desc
      limit 1;

      for r in
        select
          c.id,
          c.contrato_id,
          c.moto_id,
          c.numero_periodo,
          c.fecha_vencimiento,
          c.saldo,
          case
            when c.id = v_latest then date '2026-08-31'
            else least(c.fecha_vencimiento, date '2026-08-31')
          end as fecha_abono
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
            and a.observaciones like v_tag || ' · saldo residual%'
            and a.estado is distinct from 'anulado'
        ) then
          continue;
        end if;

        v_fecha_ts := ((r.fecha_abono::timestamp + time '12:00') at time zone 'America/Bogota');

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
          v_tag || ' · saldo residual · periodo ' || r.numero_periodo
            || case
                 when r.id = v_latest then ' · fecha 2026-08-31 (última cuota)'
                 else ' · fecha_vencimiento'
               end,
          v_actor,
          v_fecha_ts,
          v_empresa
        )
        returning id into v_abono_id;

        v_semana_iso := to_char(r.fecha_abono, 'IYYY') || '-W' || to_char(r.fecha_abono, 'IW');

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
            v_tag || ' · saldo residual · periodo ' || r.numero_periodo,
            v_semana_iso,
            true,
            v_actor,
            v_abono_id,
            'registrado',
            v_empresa
          );
        end if;
      end loop;

      -- Abonos pendientes del conductor: no deben confirmarse después (crearían caja).
      update public.abonos a
        set estado = 'anulado',
            anulado_en = coalesce(a.anulado_en, now()),
            anulado_por = coalesce(a.anulado_por, v_actor),
            motivo_anulacion = coalesce(a.motivo_anulacion, v_tag || ' · pendiente sustituido'),
            updated_at = now()
      where a.conductor_id = v_wbeimar
        and a.empresa_id = v_empresa
        and a.estado = 'pendiente_confirmacion';

      -- Pagos huérfanos de esta limpieza (re-run).
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
  -- B) Diego / Miguel: baja lógica (trigger de caja YA activo → anula caja)
  -- -------------------------------------------------------------------------
  v_inactivos := array_remove(array[v_diego, v_miguel], null);
  if coalesce(cardinality(v_inactivos), 0) = 0 then
    raise notice 'Diego/Miguel no matchearon; se omite la baja';
  else
    -- Cobros primero (estado anulado se respeta al tocar abonos).
    update public.cobros c
      set estado = 'anulado',
          anulado_en = coalesce(c.anulado_en, now()),
          anulado_por = coalesce(c.anulado_por, v_actor),
          motivo_anulacion = coalesce(c.motivo_anulacion, 'Baja conductor inactivo 20260907'),
          updated_at = now()
    where c.empresa_id = v_empresa
      and c.conductor_id = any (v_inactivos)
      and c.estado is distinct from 'anulado';

    update public.abonos a
      set estado = 'anulado',
          anulado_en = coalesce(a.anulado_en, now()),
          anulado_por = coalesce(a.anulado_por, v_actor),
          motivo_anulacion = coalesce(a.motivo_anulacion, 'Baja conductor inactivo 20260907'),
          updated_at = now()
    where a.empresa_id = v_empresa
      and a.conductor_id = any (v_inactivos)
      and a.estado is distinct from 'anulado';

    update public.pagos p
      set estado = 'anulado',
          pagado = false
    where p.empresa_id = v_empresa
      and p.estado is distinct from 'anulado'
      and (
        p.conductor_id = any (v_inactivos)
        or p.abono_id in (
          select a.id from public.abonos a
          where a.conductor_id = any (v_inactivos)
        )
      );

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

    -- Liberar RIP-44G solo si ya no hay contrato activo sobre esa moto.
    -- No tocar FSS51B.
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
          or m.conductor_id is not distinct from v_miguel
          or m.conductor_id is not distinct from v_diego
        );
      raise notice 'RIP-44G liberada (disponible, sin conductor)';
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- C) Ajustes de caja 2026-09-02 → metas 652189 / 1116324
  --    (después de anular caja de Diego/Miguel). Idempotente por descripción.
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
  'FINAL · cobros Wbeimar (deben ser pagado o anulado; saldo 0 en no anulados)' as informe,
  c.numero_periodo,
  c.estado,
  c.monto_esperado,
  c.monto_pagado,
  c.saldo,
  c.fecha_vencimiento,
  public.cobro_en_mora(c.estado, c.saldo, c.fecha_vencimiento) as en_mora,
  (
    select coalesce(sum(a.monto), 0)
    from public.abonos a
    where a.cobro_id = c.id and a.estado = 'registrado'
  ) as abonos_registrados,
  (
    select count(*)
    from public.movimientos_caja mc
    join public.abonos a on a.id = mc.abono_id
    where a.cobro_id = c.id
      and a.referencia = 'limpieza-20260907-wbeimar'
      and mc.estado is distinct from 'anulado'
  ) as caja_de_esta_limpieza
from public.cobros c
join public.usuarios u on u.id = c.conductor_id
where c.empresa_id = public.empresa_id_produccion()
  and (
    regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g') = '1148144996'
    or (
      (u.nombre ilike '%Wbeimar%' or u.apellido ilike '%Wbeimar%')
      and (u.nombre ilike '%Berrio%' or u.apellido ilike '%Berrio%')
    )
  )
order by c.numero_periodo;

select
  'FINAL · Wbeimar no debe salir en mora/cartera' as informe,
  public.estado_cuenta_conductor(u.id) as estado_cuenta
from public.usuarios u
where u.empresa_id = public.empresa_id_produccion()
  and (
    regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g') = '1148144996'
    or (
      (u.nombre ilike '%Wbeimar%' or u.apellido ilike '%Wbeimar%')
      and (u.nombre ilike '%Berrio%' or u.apellido ilike '%Berrio%')
    )
  );

select
  'FINAL · usuarios inactivos (Diego/Miguel activo=false; Wbeimar intacto)' as informe,
  u.nombre,
  u.apellido,
  u.cedula,
  u.activo,
  u.rol
from public.usuarios u
where u.empresa_id = public.empresa_id_produccion()
  and (
    regexp_replace(coalesce(u.cedula::text, ''), '[^0-9]', '', 'g')
      in ('1148144996', '1150220006', '1033178568')
    or (
      (u.nombre ilike '%Wbeimar%' or u.apellido ilike '%Wbeimar%')
      and (u.nombre ilike '%Berrio%' or u.apellido ilike '%Berrio%')
    )
    or (
      (u.nombre ilike '%Diego%' or u.apellido ilike '%Diego%')
      and (u.nombre ilike '%Saavedra%' or u.apellido ilike '%Saavedra%')
    )
    or (
      (u.nombre ilike '%Miguel%' or u.apellido ilike '%Miguel%')
      and (u.nombre ilike '%Rojas%' or u.apellido ilike '%Rojas%')
    )
  )
order by u.apellido, u.nombre;

select
  'FINAL · contratos y motos (FSS51B intacta; RIP-44G libre si no hay activo)' as informe,
  ct.estado as contrato_estado,
  u.nombre || ' ' || u.apellido as conductor,
  u.activo as conductor_activo,
  m.placa,
  m.estado as moto_estado,
  m.conductor_id is not null as moto_asignada
from public.contratos ct
join public.usuarios u on u.id = ct.conductor_id
left join public.motos m on m.id = ct.moto_id
where ct.empresa_id = public.empresa_id_produccion()
  and (
    u.id in (
      select x.id from public.usuarios x
      where x.empresa_id = public.empresa_id_produccion()
        and (
          regexp_replace(coalesce(x.cedula::text, ''), '[^0-9]', '', 'g')
            in ('1148144996', '1150220006', '1033178568')
          or (x.nombre ilike '%Wbeimar%' and x.apellido ilike '%Berrio%')
          or (x.nombre ilike '%Diego%' and x.apellido ilike '%Saavedra%')
          or (x.nombre ilike '%Miguel%' and x.apellido ilike '%Rojas%')
        )
    )
    or regexp_replace(upper(coalesce(m.placa, '')), '[^A-Z0-9]', '', 'g')
         in ('FSS51B', 'RIP44G')
  )
order by m.placa, ct.created_at;

select
  'FINAL · caja producción (saldo_todas_las_filas = meta Excel)' as informe,
  mc.banco,
  coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else 0 end), 0) as ingresos,
  coalesce(sum(case when mc.tipo = 'egreso' then mc.monto else 0 end), 0) as egresos,
  coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end), 0) as saldo_todas_las_filas,
  case mc.banco
    when 'mdd' then 652189
    when 'ahorro_mdd' then 1116324
    else null
  end as meta_excel,
  (
    select count(*) from public.movimientos_caja x
    where x.empresa_id = public.empresa_id_produccion()
      and x.banco = mc.banco
      and x.descripcion in (
        'Ajuste post-limpieza conductores 2026-09-02 (MDD)',
        'Ajuste post-limpieza conductores 2026-09-02 (Ahorro MDD)'
      )
      and x.estado is distinct from 'anulado'
  ) as ajustes_2026_09_02
from public.movimientos_caja mc
where mc.empresa_id = public.empresa_id_produccion()
  and mc.estado is distinct from 'anulado'
group by mc.banco
order by mc.banco;

-- Si el script falla a mitad y el trigger queda apagado:
--   alter table public.abonos enable trigger trg_abonos_sync_pago_caja;
