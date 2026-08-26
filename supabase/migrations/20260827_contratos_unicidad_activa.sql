-- =============================================================================
-- Contratos: unicidad de activos + duración mínima + asignar moto al activar
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260826_cobros_finanzas_derivadas.sql si aún no lo corriste)
--
-- Idempotente: se puede correr más de una vez.
-- Los índices únicos parciales ya estaban en 20260821_mvp_funcional.sql /
-- 20260821_operacion_completa.sql; este archivo los garantiza si no se
-- aplicaron, y añade reglas que esas migraciones no cubren.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Diagnóstico: si hay duplicados activos, el índice único no se puede crear.
--    Cierra (finaliza/anula) los de más y vuelve a correr este SQL.
-- -----------------------------------------------------------------------------
do $$
declare
  n_cond int;
  n_moto int;
begin
  select count(*) into n_cond from (
    select conductor_id from public.contratos
    where estado = 'activo'
    group by conductor_id
    having count(*) > 1
  ) d;
  select count(*) into n_moto from (
    select moto_id from public.contratos
    where estado = 'activo'
    group by moto_id
    having count(*) > 1
  ) d;
  if n_cond > 0 or n_moto > 0 then
    raise exception
      'Hay contratos activos duplicados (conductores=%, motos=%). Finaliza o anula los de más y vuelve a ejecutar este SQL. Consulta: select conductor_id, count(*) from contratos where estado = ''activo'' group by 1 having count(*) > 1;',
      n_cond, n_moto;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1) Un conductor / una moto → como máximo un contrato activo
-- -----------------------------------------------------------------------------
create unique index if not exists contratos_un_activo_conductor
  on public.contratos (conductor_id)
  where (estado = 'activo');

create unique index if not exists contratos_un_activo_moto
  on public.contratos (moto_id)
  where (estado = 'activo');

comment on index public.contratos_un_activo_conductor is
  'Un conductor puede tener como máximo un contrato con estado = activo.';
comment on index public.contratos_un_activo_moto is
  'Una moto puede estar en como máximo un contrato con estado = activo.';

-- -----------------------------------------------------------------------------
-- 2) Duración mínima 3 meses (pactada). Finalizar antes no pisa fecha_fin.
--    Si fecha_fin viene vacía, se rellena a fecha_inicio + 3 meses.
--    Contratos ya finalizados/anulados no se validan (pueden haber cerrado antes).
-- -----------------------------------------------------------------------------
create or replace function public.contratos_antes_de_guardar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.fecha_fin is null then
    new.fecha_fin := (new.fecha_inicio + interval '3 months')::date;
  end if;

  if new.estado in ('borrador', 'activo')
     and new.fecha_fin < (new.fecha_inicio + interval '3 months')::date then
    raise exception
      'La duración mínima del contrato es 3 meses (fecha_fin >= fecha_inicio + 3 months)'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_contratos_antes_de_guardar on public.contratos;
create trigger trg_contratos_antes_de_guardar
  before insert or update on public.contratos
  for each row
  execute function public.contratos_antes_de_guardar();

comment on function public.contratos_antes_de_guardar() is
  'Rellena fecha_fin si falta y exige 3 meses mínimos mientras el contrato está en borrador o activo.';

-- -----------------------------------------------------------------------------
-- 3) Activar contrato → asigna la moto al conductor (en_uso)
--    Defensa en DB; Angular también lo hace por si este SQL aún no se aplicó.
-- -----------------------------------------------------------------------------
create or replace function public.contratos_al_activar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'activo' and (tg_op = 'INSERT' or old.estado is distinct from 'activo') then
    update public.motos
      set conductor_id = new.conductor_id,
          estado = 'en_uso',
          updated_at = now()
      where id = new.moto_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contratos_al_activar on public.contratos;
create trigger trg_contratos_al_activar
  after insert or update of estado on public.contratos
  for each row
  execute function public.contratos_al_activar();

comment on function public.contratos_al_activar() is
  'Al pasar un contrato a activo, asigna motos.conductor_id y estado = en_uso.';

revoke all on function public.contratos_antes_de_guardar() from public;
revoke all on function public.contratos_al_activar() from public;

-- Verificación (opcional, en otra query):
--   select indexname, indexdef
--   from pg_indexes
--   where schemaname = 'public' and indexname like 'contratos_un_activo%';
--
-- Intento de segundo activo (debe fallar con 23505):
--   insert into contratos (conductor_id, moto_id, fecha_inicio, estado)
--   select conductor_id, moto_id, current_date, 'activo'
--   from contratos where estado = 'activo' limit 1;
