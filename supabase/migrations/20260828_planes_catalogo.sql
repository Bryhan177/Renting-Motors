-- =============================================================================
-- Planes (catálogo) + snapshot económico en Contrato
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260827_contratos_unicidad_activa.sql si aún no lo corriste)
--
-- Idempotente: se puede correr más de una vez.
--
-- Qué hace:
--   1) Crea tabla public.planes (sugerencias, no precio final).
--   2) Siembra 3 planes editables: Personal, Trabajo, Propietario.
--   3) Añade a contratos: plan_id, plan_nombre, cuota_inicial, duracion_meses.
--   4) Quita el DEFAULT 180000 de contratos.cuota_semanal (el insert debe
--      mandar el valor PACTADO). NO reescribe cuotas ni cobros existentes.
--
-- Qué NO hace (a propósito):
--   - NO actualiza contratos.cuota_semanal de filas ya guardadas.
--   - NO toca cobros ni abonos.
--   - NO toca triggers/SQL de mora (20260826).
--   - NO hay trigger que copie planes.valor_sugerido → contratos.
--     Editar un plan NO cambia contratos viejos.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) Catálogo de planes
-- -----------------------------------------------------------------------------
create table if not exists public.planes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text not null default '',
  condiciones_uso text not null default '',
  periodicidades_permitidas text[] not null default array['semanal']::text[],
  valor_sugerido numeric(12,0) not null default 0,
  permite_negociacion boolean not null default true,
  duracion_minima_meses int not null default 3,
  requiere_cuota_inicial boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planes_nombre_key unique (nombre),
  constraint planes_valor_sugerido_no_negativo check (valor_sugerido >= 0),
  constraint planes_duracion_minima_positiva check (duracion_minima_meses >= 1),
  constraint planes_periodicidades_validas check (
    cardinality(periodicidades_permitidas) >= 1
    and periodicidades_permitidas <@ array['semanal', 'quincenal', 'mensual']::text[]
  )
);

comment on table public.planes is
  'Catálogo de planes. Sugiere condiciones; no fija el precio del contrato. El valor pactado se congela en contratos.';
comment on column public.planes.valor_sugerido is
  'Sugerencia de cuota para frecuencia semanal. El contrato guarda su propio cuota_semanal pactado.';
comment on column public.planes.permite_negociacion is
  'Si es true, el staff puede pactar un valor distinto al sugerido al crear el contrato.';
comment on column public.planes.periodicidades_permitidas is
  'Frecuencias que el plan permite ofrecer: semanal, quincenal, mensual.';

create index if not exists planes_activo_idx on public.planes (activo);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_planes_updated on public.planes;
create trigger trg_planes_updated
  before update on public.planes
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Semilla: tres planes editables (ON CONFLICT no pisa ediciones del staff)
-- -----------------------------------------------------------------------------
insert into public.planes (
  nombre,
  descripcion,
  condiciones_uso,
  periodicidades_permitidas,
  valor_sugerido,
  permite_negociacion,
  duracion_minima_meses,
  requiere_cuota_inicial,
  activo
) values
  (
    'Personal',
    'Uso personal. Ejemplo de cuota semanal sugerida: $115.000.',
    'Uso particular. No incluye delivery ni apps de domicilio.',
    array['semanal', 'quincenal']::text[],
    115000,
    true,
    3,
    false,
    true
  ),
  (
    'Trabajo',
    'Uso laboral / delivery. Ejemplo de cuota semanal sugerida: $180.000.',
    'Pensada para trabajo o domicilio. Gasolina y daños según lo pactado en el contrato.',
    array['semanal', 'quincenal', 'mensual']::text[],
    180000,
    true,
    3,
    false,
    true
  ),
  (
    'Propietario',
    'Ex Liquidación. Cuota inicial opcional y cuotas a convenir (sin tarifa global).',
    'Permite pactar una cuota inicial (puede ser $0) y un valor de cuota personalizado.',
    array['semanal', 'quincenal', 'mensual']::text[],
    0,
    true,
    3,
    true,
    true
  )
on conflict (nombre) do nothing;

-- -----------------------------------------------------------------------------
-- 3) Snapshot en contratos (nullable para los contratos ya existentes)
-- -----------------------------------------------------------------------------
alter table public.contratos
  add column if not exists plan_id uuid references public.planes(id) on delete set null;

alter table public.contratos
  add column if not exists plan_nombre text;

alter table public.contratos
  add column if not exists cuota_inicial numeric(12,0) not null default 0;

alter table public.contratos
  add column if not exists duracion_meses int;

comment on column public.contratos.plan_id is
  'FK al plan vigente en el catálogo. ON DELETE SET NULL: borrar el plan no borra el contrato ni reescribe la cuota.';
comment on column public.contratos.plan_nombre is
  'Nombre del plan congelado al crear el contrato. Contratos viejos quedan NULL (UI: Sin plan).';
comment on column public.contratos.cuota_semanal is
  'Valor PACTADO por periodo (no se llama semanal solo por el nombre). Lo copia cobros.monto_esperado. No se actualiza al editar el plan.';
comment on column public.contratos.cuota_inicial is
  'Cuota inicial pactada (0 si no aplica). Independiente de planes.valor_sugerido.';
comment on column public.contratos.duracion_meses is
  'Duración pactada en meses al crear. Los contratos anteriores pueden quedar NULL.';

create index if not exists contratos_plan_id_idx on public.contratos (plan_id);

-- Backfill explícito: no se toca cuota_semanal. plan_id / plan_nombre quedan NULL.
-- (equivalente a 'Sin plan' en la UI). No hay UPDATE de montos.

-- -----------------------------------------------------------------------------
-- 4) Quitar DEFAULT 180000: el insert debe enviar el valor pactado
-- -----------------------------------------------------------------------------
alter table public.contratos
  alter column cuota_semanal drop default;

-- -----------------------------------------------------------------------------
-- 5) RLS: staff escribe; autenticados leen planes activos
-- -----------------------------------------------------------------------------
alter table public.planes enable row level security;

grant select, insert, update, delete on table public.planes to authenticated;

drop policy if exists "planes_staff_all" on public.planes;
create policy "planes_staff_all" on public.planes
  for all to authenticated
  using (public.es_staff())
  with check (public.es_staff());

drop policy if exists "planes_auth_select_activos" on public.planes;
create policy "planes_auth_select_activos" on public.planes
  for select to authenticated
  using (activo = true);

notify pgrst, 'reload schema';

-- Verificación (opcional, en otra query):
--   select nombre, valor_sugerido, periodicidades_permitidas, activo from public.planes order by nombre;
--   select column_name, column_default
--     from information_schema.columns
--     where table_schema = 'public' and table_name = 'contratos'
--       and column_name in ('cuota_semanal', 'plan_id', 'plan_nombre', 'cuota_inicial', 'duracion_meses');
--   -- column_default de cuota_semanal debe ser NULL.
--   -- Editar planes.valor_sugerido y volver a leer un contrato viejo: cuota_semanal igual.
