-- Permite eliminar MDD aunque tenga historial (cascada controlada).
-- Ejecutar en Supabase SQL Editor si prefieres cascada a nivel BD.
-- La app también elimina en orden; este SQL refuerza el comportamiento.

do $$
declare
  r record;
begin
  -- contratos.moto_id
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'contratos' and con.contype = 'f'
      and pg_get_constraintdef(con.oid) ilike '%moto_id%motos%'
  loop
    execute format('alter table public.contratos drop constraint %I', r.conname);
  end loop;
  alter table public.contratos
    add constraint contratos_moto_id_fkey
    foreign key (moto_id) references public.motos(id) on delete cascade;

  -- cobros.moto_id
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'cobros' and con.contype = 'f'
      and pg_get_constraintdef(con.oid) ilike '%moto_id%motos%'
  loop
    execute format('alter table public.cobros drop constraint %I', r.conname);
  end loop;
  alter table public.cobros
    add constraint cobros_moto_id_fkey
    foreign key (moto_id) references public.motos(id) on delete cascade;

  -- depositos.moto_id
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'depositos' and con.contype = 'f'
      and pg_get_constraintdef(con.oid) ilike '%moto_id%motos%'
  loop
    execute format('alter table public.depositos drop constraint %I', r.conname);
  end loop;
  alter table public.depositos
    add constraint depositos_moto_id_fkey
    foreign key (moto_id) references public.motos(id) on delete cascade;

  -- entregas.moto_id
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'entregas' and con.contype = 'f'
      and pg_get_constraintdef(con.oid) ilike '%moto_id%motos%'
  loop
    execute format('alter table public.entregas drop constraint %I', r.conname);
  end loop;
  alter table public.entregas
    add constraint entregas_moto_id_fkey
    foreign key (moto_id) references public.motos(id) on delete cascade;

  -- devoluciones.moto_id
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'devoluciones' and con.contype = 'f'
      and pg_get_constraintdef(con.oid) ilike '%moto_id%motos%'
  loop
    execute format('alter table public.devoluciones drop constraint %I', r.conname);
  end loop;
  alter table public.devoluciones
    add constraint devoluciones_moto_id_fkey
    foreign key (moto_id) references public.motos(id) on delete cascade;
end $$;

-- Tablas MDD satélite
alter table public.pagos drop constraint if exists pagos_moto_id_fkey;
alter table public.pagos
  add constraint pagos_moto_id_fkey
  foreign key (moto_id) references public.motos(id) on delete set null;

do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'mantenimientos') then
    alter table public.mantenimientos drop constraint if exists mantenimientos_moto_id_fkey;
    alter table public.mantenimientos
      add constraint mantenimientos_moto_id_fkey
      foreign key (moto_id) references public.motos(id) on delete cascade;
  end if;
  if exists (select 1 from information_schema.tables where table_name = 'movimientos_caja') then
    begin
      alter table public.movimientos_caja drop constraint if exists movimientos_caja_moto_id_fkey;
    exception when others then null;
    end;
    -- moto_id puede ser nullable
    begin
      alter table public.movimientos_caja
        add constraint movimientos_caja_moto_id_fkey
        foreign key (moto_id) references public.motos(id) on delete set null;
    exception when others then null;
    end;
  end if;
  if exists (select 1 from information_schema.tables where table_name = 'documentos') then
    begin
      alter table public.documentos drop constraint if exists documentos_moto_id_fkey;
      alter table public.documentos
        add constraint documentos_moto_id_fkey
        foreign key (moto_id) references public.motos(id) on delete set null;
    exception when others then null;
    end;
  end if;
end $$;
