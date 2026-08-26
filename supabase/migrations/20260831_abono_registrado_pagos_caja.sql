-- =============================================================================
-- Abono registrado → pago + movimiento de caja (fuente de verdad en Postgres)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260830_dashboard_staff.sql)
--
-- Idempotente.
--
-- Bug: el conductor reporta un abono (pendiente_confirmacion). Staff confirma y
-- solo se actualizaba abonos.estado = 'registrado'. El trigger de cobros sí
-- recalcula monto_pagado/saldo, y el dashboard suma abonos registrados, pero:
--   - Pagos lee public.pagos (nunca se insertaba)
--   - Flujo de caja lee public.movimientos_caja (nunca se insertaba)
--
-- Qué hace:
--   1) abono_id + estado en pagos y movimientos_caja (no se borran filas).
--   2) Trigger: al pasar a registrado crea pago + ingreso caja MDD.
--      Al anular un abono ya registrado, marca esas filas anulado (no DELETE).
--   3) Backfill de abonos ya registrados sin pago/caja.
--   4) RLS: escrituras de pagos/caja solo staff (el trigger es SECURITY DEFINER).
--
-- Qué NO hace:
--   - NO borra filas financieras.
--   - NO reescribe cuota_semanal ni montos de cobros.
--   - NO toca cobro_en_mora, talleres, planes ni wizard.
-- =============================================================================

alter table public.pagos
  add column if not exists abono_id uuid references public.abonos(id) on delete set null;
alter table public.pagos
  add column if not exists estado text;
alter table public.pagos
  add column if not exists comprobante_imagen text;
alter table public.movimientos_caja
  add column if not exists abono_id uuid references public.abonos(id) on delete set null;
alter table public.movimientos_caja
  add column if not exists estado text;

update public.pagos
  set estado = 'registrado'
  where estado is null;
update public.movimientos_caja
  set estado = 'registrado'
  where estado is null;

alter table public.pagos
  alter column estado set default 'registrado';
alter table public.movimientos_caja
  alter column estado set default 'registrado';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pagos_estado_check' and conrelid = 'public.pagos'::regclass
  ) then
    alter table public.pagos
      add constraint pagos_estado_check
      check (estado in ('registrado', 'anulado'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'movimientos_caja_estado_check'
      and conrelid = 'public.movimientos_caja'::regclass
  ) then
    alter table public.movimientos_caja
      add constraint movimientos_caja_estado_check
      check (estado in ('registrado', 'anulado'));
  end if;
end $$;

create unique index if not exists pagos_abono_id_uidx
  on public.pagos (abono_id)
  where abono_id is not null;
create unique index if not exists movimientos_caja_abono_id_uidx
  on public.movimientos_caja (abono_id)
  where abono_id is not null;

comment on column public.pagos.abono_id is
  'Abono de cuota que originó este pago. Null = registro manual legacy.';
comment on column public.movimientos_caja.abono_id is
  'Abono de cuota que originó este ingreso. Null = movimiento manual o mantenimiento.';

-- -----------------------------------------------------------------------------
-- Sync: registrado → crear; anulado (si ya era registrado) → marcar anulado
-- -----------------------------------------------------------------------------
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
        comprobante_imagen, abono_id, estado
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
        'registrado'
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
        registrado_por, abono_id, estado
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
        'registrado'
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

drop trigger if exists trg_abonos_sync_pago_caja on public.abonos;
create trigger trg_abonos_sync_pago_caja
  after insert or update of estado, monto, fecha_pago on public.abonos
  for each row
  execute function public.abonos_sync_pago_caja();

-- Backfill: abonos ya aprobados antes de este SQL
insert into public.pagos (
  conductor_id, moto_id, fecha_pago, monto, valor_pagado, gastos,
  metodo_pago, observaciones, semana, pagado, registrado_por,
  comprobante_imagen, abono_id, estado
)
select
  a.conductor_id,
  c.moto_id,
  a.fecha_pago,
  a.monto,
  a.monto,
  0,
  coalesce(a.metodo_pago, 'TRANSFERENCIA'),
  coalesce(a.observaciones, 'Abono de cuota'),
  to_char((timezone('America/Bogota', a.fecha_pago))::date, 'IYYY')
    || '-W' || to_char((timezone('America/Bogota', a.fecha_pago))::date, 'IW'),
  true,
  coalesce(a.confirmado_por, a.responsable_id),
  a.comprobante,
  a.id,
  'registrado'
from public.abonos a
join public.cobros c on c.id = a.cobro_id
where a.estado = 'registrado'
  and not exists (select 1 from public.pagos p where p.abono_id = a.id);

insert into public.movimientos_caja (
  banco, tipo, monto, fecha, descripcion, moto_id, pago_id,
  registrado_por, abono_id, estado
)
select
  'mdd',
  'ingreso',
  a.monto,
  (timezone('America/Bogota', a.fecha_pago))::date,
  'Abono cuota'
    || coalesce(' · ' || m.placa, '')
    || coalesce(' · ' || a.metodo_pago, ''),
  c.moto_id,
  p.id,
  coalesce(a.confirmado_por, a.responsable_id),
  a.id,
  'registrado'
from public.abonos a
join public.cobros c on c.id = a.cobro_id
left join public.motos m on m.id = c.moto_id
left join public.pagos p on p.abono_id = a.id
where a.estado = 'registrado'
  and not exists (select 1 from public.movimientos_caja mc where mc.abono_id = a.id);

-- RLS: caja solo staff. Pagos: staff escribe; conductor solo lee lo suyo.
drop policy if exists movimientos_caja_activo_all on public.movimientos_caja;
drop policy if exists movimientos_caja_staff_all on public.movimientos_caja;
create policy movimientos_caja_staff_all on public.movimientos_caja
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

drop policy if exists "pagos_empleado_own" on public.pagos;
drop policy if exists "pagos_empleado_read_own" on public.pagos;
create policy "pagos_empleado_read_own" on public.pagos
  for select to authenticated
  using (conductor_id = auth.uid() or public.es_staff());

drop policy if exists "pagos_staff_all" on public.pagos;
create policy "pagos_staff_all" on public.pagos
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

revoke all on function public.abonos_sync_pago_caja() from public;

notify pgrst, 'reload schema';
