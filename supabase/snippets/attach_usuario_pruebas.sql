-- =============================================================================
-- Adjuntar un usuario de Authentication a GoRenting Pruebas
-- =============================================================================
-- Esta VM / el panel de Angular NO pueden crear usuarios de Auth. El dueño
-- crea el login en: Supabase → Authentication → Users → Add user
-- (email + password), copia el UUID, y corre UNO de los bloques de abajo.
--
-- ⚠️ NUNCA adjuntar un usuario de prueba a la empresa "GoRenting" (producción).
-- ⚠️ NUNCA pegar aquí el UUID de un admin/asesor/conductor que ya opera en vivo.
--    Si el UUID ya tiene perfil en producción, el bloque ABORTA a propósito.
--
-- Prerrequisito: ya corriste 20260901_multi_tenant_empresas.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Administrador de pruebas
--    1) Authentication → Add user (ej. pruebas@gorenting.local)
--    2) Copia el UUID
--    3) Pégalo en v_auth y corre este bloque
-- -----------------------------------------------------------------------------
do $$
declare
  v_auth uuid := '00000000-0000-0000-0000-000000000000'; -- ← PEGA el UUID de Auth
  v_pruebas uuid;
  v_prod uuid;
  v_email text;
begin
  if v_auth = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Pega el UUID real del usuario creado en Authentication';
  end if;

  v_pruebas := public.empresa_id_pruebas();
  v_prod := public.empresa_id_produccion();
  if v_pruebas is null or v_prod is null then
    raise exception 'Faltan empresas. Corre 20260901_multi_tenant_empresas.sql primero.';
  end if;

  if exists (
    select 1 from public.usuarios u
    where u.id = v_auth and u.empresa_id = v_prod
  ) then
    raise exception
      'Este UUID ya pertenece a GoRenting (producción). NO lo muevas. Crea OTRO usuario en Authentication.';
  end if;

  select au.email into v_email from auth.users au where au.id = v_auth;
  if v_email is null then
    raise exception 'No existe auth.users id=% — créalo en Authentication primero', v_auth;
  end if;

  insert into public.usuarios (
    id, nombre, apellido, email, cedula, telefono, rol, activo, empresa_id
  ) values (
    v_auth,
    'Admin',
    'Pruebas',
    v_email,
    900000001 + (abs(hashtext(v_auth::text)) % 80000),
    '3000000001',
    'administrador',
    true,
    v_pruebas
  )
  on conflict (id) do update
    set empresa_id = excluded.empresa_id,
        rol = 'administrador',
        activo = true,
        email = excluded.email
    where public.usuarios.empresa_id is distinct from v_prod;

  raise notice 'OK: % es administrador de GoRenting Pruebas', v_email;
end $$;

-- -----------------------------------------------------------------------------
-- B) Conductor (empleado) de pruebas — mismo procedimiento, otro UUID
-- -----------------------------------------------------------------------------
do $$
declare
  v_auth uuid := '00000000-0000-0000-0000-000000000000'; -- ← PEGA el UUID de Auth
  v_pruebas uuid;
  v_prod uuid;
  v_email text;
begin
  if v_auth = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Pega el UUID real del conductor creado en Authentication';
  end if;

  v_pruebas := public.empresa_id_pruebas();
  v_prod := public.empresa_id_produccion();
  if v_pruebas is null or v_prod is null then
    raise exception 'Faltan empresas. Corre 20260901_multi_tenant_empresas.sql primero.';
  end if;

  if exists (
    select 1 from public.usuarios u
    where u.id = v_auth and u.empresa_id = v_prod
  ) then
    raise exception
      'Este UUID ya pertenece a GoRenting (producción). NO lo muevas. Crea OTRO usuario en Authentication.';
  end if;

  select au.email into v_email from auth.users au where au.id = v_auth;
  if v_email is null then
    raise exception 'No existe auth.users id=% — créalo en Authentication primero', v_auth;
  end if;

  insert into public.usuarios (
    id, nombre, apellido, email, cedula, telefono, rol, activo, empresa_id
  ) values (
    v_auth,
    'Conductor',
    'Pruebas',
    v_email,
    900100001 + (abs(hashtext(v_auth::text)) % 80000),
    '3000000002',
    'empleado',
    true,
    v_pruebas
  )
  on conflict (id) do update
    set empresa_id = excluded.empresa_id,
        rol = 'empleado',
        activo = true,
        email = excluded.email
    where public.usuarios.empresa_id is distinct from v_prod;

  raise notice 'OK: % es empleado de GoRenting Pruebas', v_email;
end $$;
