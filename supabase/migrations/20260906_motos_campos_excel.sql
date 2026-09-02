-- =============================================================================
-- Motos: campos del Excel VEHICULOS + uso flota/personal
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260905_motos_imagen_drop_data.sql)
--
-- Idempotente: add column if not exists + update de placas personales.
--
-- Excel VEHICULOS → columnas:
--   cilindraje, color, anio, tiene_multas (MULTAS SI/NO),
--   uso: flota | personal
--     PERSONAL          → uso = personal (no salen en la landing)
--     ACTIVA / INACTIVA → uso = flota (estado operativa sigue en motos.estado)
--
-- Placas personales conocidas (nunca en /): QBQ-68D, PVT88H.
-- Filas sin uso quedan en 'flota' (default). Angular trata null como flota.
--
-- Qué NO hace:
--   - NO cambia cobros/abonos/caja.
--   - NO toca motos.estado (disponible / en_uso / ...).
-- =============================================================================

alter table public.motos add column if not exists cilindraje integer;
alter table public.motos add column if not exists color text;
alter table public.motos add column if not exists anio integer;
alter table public.motos add column if not exists tiene_multas boolean not null default false;
alter table public.motos add column if not exists uso text;

update public.motos
set uso = 'flota'
where uso is null;

alter table public.motos
  alter column uso set default 'flota';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'motos_uso_check'
      and conrelid = 'public.motos'::regclass
  ) then
    alter table public.motos
      add constraint motos_uso_check
      check (uso in ('flota', 'personal'));
  end if;
end $$;

comment on column public.motos.cilindraje is
  'Cilindraje (cc) del Excel VEHICULOS. Nullable.';
comment on column public.motos.color is
  'Color del Excel VEHICULOS. Nullable.';
comment on column public.motos.anio is
  'Año modelo del Excel VEHICULOS. Nullable.';
comment on column public.motos.tiene_multas is
  'Excel MULTAS SI/NO. Default false.';
comment on column public.motos.uso is
  'flota = catálogo de arriendo (ACTIVA/INACTIVA). personal = uso privado (PERSONAL). La landing solo muestra flota.';

-- Placas personales del dueño: no deben aparecer en la landing pública.
update public.motos
set uso = 'personal'
where regexp_replace(upper(trim(placa)), '[^A-Z0-9]', '', 'g') in ('QBQ68D', 'PVT88H');

-- Landing anónima: solo flota de producción. Staff sigue viendo personales (motos_staff_all).
drop policy if exists motos_public_select on public.motos;
drop policy if exists motos_anon_select_produccion on public.motos;
create policy motos_anon_select_produccion on public.motos
  for select to anon
  using (
    empresa_id = public.empresa_id_produccion()
    and coalesce(uso, 'flota') = 'flota'
  );

notify pgrst, 'reload schema';
