-- =============================================================================
-- Hotfix: permission denied for function assert_misma_empresa
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- (después de 20260901_multi_tenant_empresas.sql — NO re-ejecutes 20260901)
--
-- Idempotente: se puede correr más de una vez.
--
-- Bug: el owner (authenticated) recibe
--   permission denied for function assert_misma_empresa
-- en cualquier INSERT/UPDATE de contrato, moto, usuario, taller, abono, etc.
--
-- Causa en 20260901:
--   - Trigger validar_refs_empresa era SECURITY INVOKER (corre como el rol
--     del JWT).
--   - El trigger hace perform public.assert_misma_empresa(...).
--   - 20260901 hizo
--       revoke all on function public.assert_misma_empresa(text, uuid, uuid)
--         from public, anon, authenticated;
--   - authenticated no puede EXECUTE el helper que el trigger necesita.
--
-- Qué hace este archivo:
--   1) Recrea assert_misma_empresa y validar_refs_empresa como SECURITY DEFINER
--      con search_path = public. El trigger ya no depende del EXECUTE del
--      cliente, y RLS no oculta la fila referenciada durante el chequeo.
--   2) GRANT EXECUTE de assert_misma_empresa a authenticated y service_role.
--      validar_refs_empresa y stamp_empresa_id siguen sin EXECUTE para
--      anon/authenticated (solo las dispara el trigger).
--   3) notify pgrst, 'reload schema'.
--
-- Desbloqueo inmediato (si aún no puedes pegar este archivo):
--   grant execute on function public.assert_misma_empresa(text, uuid, uuid)
--     to authenticated;
-- Ese one-liner ya desbloquea writes. Esta migración es el arreglo durable.
--
-- Qué NO hace:
--   - NO re-ejecuta 20260901 ni toca empresas / RLS / backfill.
--   - NO cambia Angular, mora, wizard, planes, talleres UX, ni cobros.
-- =============================================================================

create or replace function public.assert_misma_empresa(p_tabla text, p_id uuid, p_empresa uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  if p_id is null then
    return;
  end if;
  execute format('select empresa_id from public.%I where id = $1', p_tabla)
    into v
    using p_id;
  if v is null or v is distinct from p_empresa then
    raise exception 'Referencia de otra empresa no permitida (% %)', p_tabla, p_id
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_misma_empresa(text, uuid, uuid) is
  'Chequeo cross-tenant. SECURITY DEFINER: el trigger no depende de EXECUTE del cliente y RLS no oculta la fila referenciada.';

create or replace function public.validar_refs_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'contratos' then
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    if new.plan_id is not null then
      perform public.assert_misma_empresa('planes', new.plan_id, new.empresa_id);
    end if;
  elsif tg_table_name = 'cobros' then
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
  elsif tg_table_name = 'abonos' then
    perform public.assert_misma_empresa('cobros', new.cobro_id, new.empresa_id);
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
  elsif tg_table_name = 'pagos' then
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
    perform public.assert_misma_empresa('abonos', new.abono_id, new.empresa_id);
  elsif tg_table_name = 'movimientos_caja' then
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
    perform public.assert_misma_empresa('abonos', new.abono_id, new.empresa_id);
  elsif tg_table_name = 'motos' then
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
  elsif tg_table_name = 'depositos' then
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
  elsif tg_table_name = 'movimientos_deposito' then
    perform public.assert_misma_empresa('depositos', new.deposito_id, new.empresa_id);
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
  elsif tg_table_name = 'entregas' then
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
  elsif tg_table_name = 'devoluciones' then
    perform public.assert_misma_empresa('contratos', new.contrato_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
  elsif tg_table_name = 'novedades' then
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
  elsif tg_table_name = 'documentos' then
    perform public.assert_misma_empresa('usuarios', new.conductor_id, new.empresa_id);
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
  elsif tg_table_name = 'mantenimientos' then
    perform public.assert_misma_empresa('motos', new.moto_id, new.empresa_id);
  end if;
  return new;
end;
$$;

comment on function public.validar_refs_empresa() is
  'BEFORE INSERT/UPDATE: rechaza FKs de otra empresa. SECURITY DEFINER + search_path=public. Solo trigger.';

-- Helper invocado por el trigger: authenticated debe poder ejecutarlo
-- (un GRANT suelto ya desbloquea; el DEFINER es el arreglo durable).
revoke all on function public.assert_misma_empresa(text, uuid, uuid) from public, anon;
grant execute on function public.assert_misma_empresa(text, uuid, uuid) to authenticated, service_role;

-- Triggers only: el cliente no las llama por RPC.
revoke all on function public.stamp_empresa_id() from public, anon, authenticated;
revoke all on function public.validar_refs_empresa() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Verificación (opcional, otra query):
--   select p.proname, p.prosecdef,
--          pg_get_function_identity_arguments(p.oid) as args
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('assert_misma_empresa', 'validar_refs_empresa', 'stamp_empresa_id');
--   -- prosecdef = true para assert_misma_empresa y validar_refs_empresa
--
--   select grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_schema = 'public'
--     and routine_name = 'assert_misma_empresa';
--   -- authenticated y service_role: EXECUTE
--
--   -- Luego un INSERT/UPDATE de moto/contrato/usuario/taller/abono como owner
--   -- ya no debe devolver permission denied for function assert_misma_empresa.
