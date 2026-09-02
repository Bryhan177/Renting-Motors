-- =============================================================================
-- Import REGISTRO DE PAGOS (Excel CONTROL MAQUINA DE DINERO 2026)
-- Hoja: REGISTRO DE PAGOS · motos RIP44G / FSS51B / DAN78D
-- Ejecutar en: Supabase → SQL Editor → Run
-- Empresa: solo producción (empresa_id_produccion()). NO toca Pruebas.
--
-- Qué hace:
--   1) Soft-anula TODOS los pagos registrados de producción (historial inventado
--      ~51×$180k y lo demás). NO borra filas. NO toca abonos/cobros/contratos.
--   2) Soft-anula pagos de un import previo con el mismo tag (idempotente).
--   3) Inserta las filas reales del Excel (valor_pagado + gastos).
--   4) NO crea movimientos_caja (caja ya reconciliada: MDD 652189 / Ahorro 1116324).
--
-- Totales esperados tras el import (Total cobrado / Total gastos en /pagos):
--   valor_pagado  $6.280.000  (RIP 1.450.000 + FSS 4.770.000 + DAN 60.000)
--   gastos        $1.357.613  (RIP 1.083.613 + FSS 154.000 + DAN 120.000)
--   Neto FSS (valor−gastos) = $4.616.000  ← cifra del Excel que pediste
-- =============================================================================

do $$
declare
  v_empresa uuid := public.empresa_id_produccion();
  v_actor uuid;
  v_tag text := '[excel-import-20260908]';
  v_n_anulados int := 0;
  v_n_insert int := 0;
  v_sum_valor numeric := 0;
  v_sum_gastos numeric := 0;
begin
  if v_empresa is null then
    raise exception 'empresa_id_produccion() devolvió null';
  end if;

  select u.id into v_actor
  from public.usuarios u
  where u.empresa_id = v_empresa
    and coalesce(u.rol, '') in ('admin', 'administrador', 'superadmin', 'owner')
  order by u.created_at
  limit 1;

  if v_actor is null then
    select u.id into v_actor
    from public.usuarios u
    where u.empresa_id = v_empresa
    order by u.created_at
    limit 1;
  end if;

  if v_actor is null then
    raise exception 'No hay usuario actor en producción';
  end if;

  -- Conductores (mismo match que 20260907)
  drop table if exists pg_temp.excel_conductores;
  create temporary table pg_temp.excel_conductores (
    etiqueta text primary key,
    usuario_id uuid not null
  );

  insert into pg_temp.excel_conductores (etiqueta, usuario_id)
  select 'wbeimar', u.id
  from public.usuarios u
  where u.empresa_id = v_empresa
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

  insert into pg_temp.excel_conductores (etiqueta, usuario_id)
  select 'diego', u.id
  from public.usuarios u
  where u.empresa_id = v_empresa
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

  -- Motos flota por placa normalizada
  drop table if exists pg_temp.excel_motos;
  create temporary table pg_temp.excel_motos (
    placa_norm text primary key,
    moto_id uuid not null
  );

  insert into pg_temp.excel_motos (placa_norm, moto_id)
  select distinct on (regexp_replace(upper(coalesce(m.placa, '')), '[^A-Z0-9]', '', 'g'))
    regexp_replace(upper(coalesce(m.placa, '')), '[^A-Z0-9]', '', 'g'),
    m.id
  from public.motos m
  where m.empresa_id = v_empresa
    and regexp_replace(upper(coalesce(m.placa, '')), '[^A-Z0-9]', '', 'g')
      in ('RIP44G', 'FSS51B', 'DAN78D')
  order by
    regexp_replace(upper(coalesce(m.placa, '')), '[^A-Z0-9]', '', 'g'),
    m.created_at;

  if (select count(*) from pg_temp.excel_motos) < 3 then
    raise exception 'Faltan motos flota (RIP44G/FSS51B/DAN78D). Halladas: %',
      (select string_agg(placa_norm, ',') from pg_temp.excel_motos);
  end if;

  if not exists (select 1 from pg_temp.excel_conductores where etiqueta = 'wbeimar') then
    raise exception 'No se encontró conductor Wbeimar';
  end if;
  if not exists (select 1 from pg_temp.excel_conductores where etiqueta = 'diego') then
    raise exception 'No se encontró conductor Diego';
  end if;

  -- 1) Soft-anular pagos registrados de producción (inventado + import previo)
  update public.pagos p
  set estado = 'anulado',
      pagado = false
  where p.empresa_id = v_empresa
    and coalesce(p.estado, 'registrado') is distinct from 'anulado';

  get diagnostics v_n_anulados = row_count;
  raise notice 'Pagos anulados: %', v_n_anulados;

  -- Filas Excel (staging)
  drop table if exists pg_temp.excel_pagos;
  create temporary table pg_temp.excel_pagos (
    placa_norm text not null,
    etiqueta text,           -- wbeimar | diego | null
    fecha_pago date not null,
    semana text,
    valor_pagado numeric not null,
    gastos numeric not null default 0,
    descripcion_gasto text,
    metodo_pago text not null,
    observaciones text
  );
  insert into pg_temp.excel_pagos (
    placa_norm, etiqueta, fecha_pago, semana, valor_pagado, gastos,
    descripcion_gasto, metodo_pago, observaciones
  ) values
    ('RIP44G', 'diego', '2026-02-14'::date, '1', 170000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 1 · Consigno luego de 3 días, se acuerda pago para los días martes'),
    ('DAN78D', null, '2026-08-29'::date, '0', 0, 120000, 'Cambio de carenaje y comando de direccionales', 'TRANSFERENCIA', '[excel-import-20260908] · Excel DAN78D · semana 0 · El dinero se tomo de MDD'),
    ('RIP44G', 'diego', '2026-02-22'::date, '2', 70000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 2 · el cliente informa que queda restando 10.000 y el martes que seria su proximo pago los va incluir'),
    ('FSS51B', 'wbeimar', '2026-03-01'::date, '2', 50000, 0, 'N/A', 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 2 · Se pago en la fecha acordada'),
    ('DAN78D', null, '2026-08-18'::date, '1', 30000, 0, 'Alquiler Franklin', 'TRANSFERENCIA', '[excel-import-20260908] · Excel DAN78D · semana 1'),
    ('RIP44G', 'diego', '2026-02-22'::date, '2', 40000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 2 · el cliente informa que queda restando 10.000 y el martes que seria su proximo pago los va incluir'),
    ('FSS51B', 'wbeimar', '2026-03-01'::date, '2', 130000, 90000, 'Compra de neumatico (llanta) delantera', 'EFECTIVO', '[excel-import-20260908] · Excel FSS51B · semana 2 · Entregados a Bryhan en la noche'),
    ('DAN78D', null, '2026-08-26'::date, '2', 30000, 0, 'Alquiler Franklin', 'TRANSFERENCIA', '[excel-import-20260908] · Excel DAN78D · semana 2'),
    ('RIP44G', 'diego', '2026-02-24'::date, '3', 230000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 3 · Cancela semana 3 completa y 60.000 faltantes de la semana anterior (queda al día)'),
    ('FSS51B', 'wbeimar', '2026-03-08'::date, '3', 140000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 3 · Se pago en la fecha acordada'),
    ('RIP44G', 'diego', '2026-03-03'::date, null, 0, 50102, 'POLIZA DE SEGURO (3 marzo)', 'PSE', '[excel-import-20260908] · Excel RIP44G · Se pago el últimó día, no genero mora'),
    ('FSS51B', 'wbeimar', '2026-03-08'::date, '3', 40000, 0, null, 'EFECTIVO', '[excel-import-20260908] · Excel FSS51B · semana 3 · Se pago en la fecha acordada'),
    ('RIP44G', 'diego', '2026-03-03'::date, '4', 170000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 4 · Pagó en la fecha indicada'),
    ('FSS51B', 'wbeimar', '2026-03-16'::date, '4', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 4 · Se pago en la fecha acordada'),
    ('RIP44G', 'diego', '2026-03-10'::date, '5', 70000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 5 · El cliente informa que debido a que se varo no pudo hacer el pago completo pero a más tardar lo hace el jueves 12/03/2026 (se chuzo la llanta trasera)'),
    ('FSS51B', 'wbeimar', '2026-03-23'::date, '5', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 5 · Pago un dia despues'),
    ('FSS51B', 'wbeimar', '2026-03-30'::date, '6', 180000, 0, null, 'EFECTIVO', '[excel-import-20260908] · Excel FSS51B · semana 6 · Se pago en la fecha acordada'),
    ('RIP44G', 'diego', '2026-03-17'::date, '6', 170000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 6 · Pagó en la fecha indicada'),
    ('FSS51B', 'wbeimar', '2026-04-06'::date, '7', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 7 · Pago un dia despues'),
    ('RIP44G', 'diego', '2026-03-24'::date, '7', 170000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 7 · Pagó en la fecha indicada'),
    ('FSS51B', 'wbeimar', '2026-04-06'::date, null, 0, 64000, 'TRAMITE TRASPASOS', 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · Tramite extra en traspasos'),
    ('RIP44G', 'diego', '2026-04-03'::date, null, 0, 50102, 'POLIZA DE SEGURO (3 abril)', 'PSE', '[excel-import-20260908] · Excel RIP44G · Se pago el últimó día, no genero mora'),
    ('FSS51B', 'wbeimar', '2026-04-14'::date, '8', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 8 · Pago dos días despues'),
    ('FSS51B', 'wbeimar', '2026-04-21'::date, '9', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 9 · Pago dos días despues'),
    ('FSS51B', 'wbeimar', '2026-04-27'::date, '10', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 10 · Pago un días despues'),
    ('FSS51B', 'wbeimar', '2026-04-07'::date, '11', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 11 · Pago tres días despues, explico que se le presentó un inconveniente'),
    ('RIP44G', 'diego', '2026-05-13'::date, '11', 0, 165500, 'REPUESTOS Y REPARACIÓN', 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 11 · Se tuvo que cambiar el kit de arrastre'),
    ('FSS51B', 'wbeimar', '2026-05-13'::date, '12', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 12 · Pago tres días despues, se le va a entregar una carta de compromiso y advertencia'),
    ('FSS51B', 'wbeimar', '2026-05-18'::date, '13', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 13 · Pago un día despues'),
    ('RIP44G', 'diego', '2026-05-03'::date, null, 0, 50102, 'POLIZA DE SEGURO (3 de mayo)', 'PSE', '[excel-import-20260908] · Excel RIP44G · Se pago el último día, no genero mora'),
    ('FSS51B', 'wbeimar', '2026-06-03'::date, '15', 360000, 0, null, 'EFECTIVO', '[excel-import-20260908] · Excel FSS51B · semana 15 · Pago 2 semanas y queda al día'),
    ('RIP44G', 'diego', '2026-05-05'::date, '1', 180000, 0, null, 'CONSIGNACION', '[excel-import-20260908] · Excel RIP44G · semana 1 · Realizo el pago 2 días despues de la fecha acordada pero se mantuvo en contacto, se establecieron los días de pago para los martes de cada semana'),
    ('FSS51B', 'wbeimar', '2026-06-07'::date, '16', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 16 · Pago puntual'),
    ('RIP44G', 'diego', '2026-05-09'::date, '2', 0, 100000, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 2 · Se pago cambio de aceite y discos de closh'),
    ('FSS51B', 'wbeimar', '2026-06-15'::date, '17', 90000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 17 · pago un dia despues(50% descuento por el dia del padre)'),
    ('RIP44G', 'diego', '2026-05-13'::date, '3', 180000, 0, null, 'CONSIGNACION', '[excel-import-20260908] · Excel RIP44G · semana 3 · Pago un día despues'),
    ('FSS51B', 'wbeimar', '2026-06-25'::date, '18', 90000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 18 · Se retraso 4 días y se le amplio el tiempo para librar el vehiculo 1 mes mas'),
    ('FSS51B', 'wbeimar', '2026-06-25'::date, '19', 90000, 0, null, 'EFECTIVO', '[excel-import-20260908] · Excel FSS51B · semana 19 · Pago 4 días despues'),
    ('FSS51B', 'wbeimar', '2026-06-29'::date, '20', 180000, 0, null, 'EFECTIVO', '[excel-import-20260908] · Excel FSS51B · semana 20 · Pago 1 día despues'),
    ('FSS51B', 'wbeimar', '2026-07-06'::date, '21', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 21 · pago puntual'),
    ('FSS51B', 'wbeimar', '2026-07-13'::date, '22', 180000, 0, null, 'CONSIGNACION', '[excel-import-20260908] · Excel FSS51B · semana 22 · Pago 1 día despues'),
    ('RIP44G', 'diego', '2026-06-25'::date, '8', 0, 83500, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 8 · Pago reparacion, cambio de aceite,luz del stock, freno trasero y tornillos del kit de arrastre'),
    ('FSS51B', 'wbeimar', '2026-07-20'::date, '23', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 23 · Pago 1 día despues'),
    ('RIP44G', 'diego', '2026-06-29'::date, '9', 0, 350000, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 9 · PAGO DEL SOAT'),
    ('FSS51B', 'wbeimar', '2026-07-27'::date, '24', 180000, 0, null, 'TRANSFERENCIA', '[excel-import-20260908] · Excel FSS51B · semana 24 · Pago 1 día despues'),
    ('RIP44G', 'diego', '2026-06-03'::date, '10', 0, 50103, 'POLIZA DE SEGURO (3 de junio)', 'PSE', '[excel-import-20260908] · Excel RIP44G · semana 10 · pago seguro'),
    ('FSS51B', 'wbeimar', '2026-08-03'::date, '25', 180000, 0, null, 'CONSIGNACION', '[excel-import-20260908] · Excel FSS51B · semana 25 · Pago 1 día despues'),
    ('RIP44G', 'diego', '2026-07-06'::date, '11', 0, 50103, 'POLIZA DE SEGURO (3 de julio)', 'PSE', '[excel-import-20260908] · Excel RIP44G · semana 11 · se pago tarde'),
    ('FSS51B', 'wbeimar', '2026-08-10'::date, '26', 180000, 0, null, 'CONSIGNACION', '[excel-import-20260908] · Excel FSS51B · semana 26 · Pago 1 día despues'),
    ('RIP44G', 'diego', '2026-08-03'::date, '12', 0, 50101, 'POLIZA DE SEGURO (3 de agosto)', 'PSE', '[excel-import-20260908] · Excel RIP44G · semana 12 · Se pago a tiempo'),
    ('FSS51B', 'wbeimar', '2026-08-18'::date, '27', 180000, 0, null, 'CONSIGNACION', '[excel-import-20260908] · Excel FSS51B · semana 27 · Pago 2 días despues'),
    ('RIP44G', 'diego', '2026-08-10'::date, '13', 0, 84000, 'cambio de aceite y guarda barros', 'TRANSFERENCIA', '[excel-import-20260908] · Excel RIP44G · semana 13 · Se pago de contado'),
    ('FSS51B', 'wbeimar', '2026-08-26'::date, '28', 180000, 0, null, 'CONSIGNACION', '[excel-import-20260908] · Excel FSS51B · semana 28 · Pago 3 días despues'),
    ('FSS51B', 'wbeimar', '2026-09-01'::date, '29', 180000, 0, null, 'CONSIGNACION', '[excel-import-20260908] · Excel FSS51B · semana 29 · Pago 2 días despues');

  insert into public.pagos (
    conductor_id, moto_id, fecha_pago, monto, valor_pagado, gastos,
    descripcion_gasto, metodo_pago, observaciones, semana, pagado,
    registrado_por, abono_id, estado, empresa_id
  )
  select
    c.usuario_id,
    m.moto_id,
    (e.fecha_pago::timestamp + interval '12 hours') at time zone 'America/Bogota',
    case when e.valor_pagado > 0 then e.valor_pagado else e.gastos end,
    e.valor_pagado,
    e.gastos,
    e.descripcion_gasto,
    e.metodo_pago,
    e.observaciones,
    e.semana,
    true,
    v_actor,
    null,
    'registrado',
    v_empresa
  from pg_temp.excel_pagos e
  join pg_temp.excel_motos m on m.placa_norm = e.placa_norm
  left join pg_temp.excel_conductores c on c.etiqueta = e.etiqueta
  order by e.fecha_pago, e.placa_norm;

  get diagnostics v_n_insert = row_count;

  select coalesce(sum(valor_pagado),0), coalesce(sum(gastos),0)
    into v_sum_valor, v_sum_gastos
  from public.pagos
  where empresa_id = v_empresa
    and coalesce(estado, 'registrado') is distinct from 'anulado';

  raise notice 'Insertados: % | Total cobrado=% | Total gastos=%',
    v_n_insert, v_sum_valor, v_sum_gastos;

  if v_sum_valor is distinct from 6280000 then
    raise exception 'Total cobrado esperado 6280000, quedó %', v_sum_valor;
  end if;

  if v_sum_gastos is distinct from 1357613 then
    raise exception 'Total gastos esperado 1357613, quedó %', v_sum_gastos;
  end if;
end $$;
