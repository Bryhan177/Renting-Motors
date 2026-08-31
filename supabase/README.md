# SQL pendiente (obligatorio)

Ejecuta en Supabase SQL Editor, en este orden si aún no lo hiciste:

1. `20260821_mvp_funcional.sql` (si no lo corriste)
2. `20260821_emergencia_motos_rls.sql` (si aún fallaba crear MDD)
3. `20260821_frecuencia_pago.sql`
4. **`20260821_mdd_completo.sql`** ← campos MDD, usuarios, pagos manual, caja, mantenimientos, documentos
5. **`20260822_novedades.sql`** ← reportes de novedad del conductor
6. **`20260822_motos_delete_cascade.sql`** ← permite eliminar MDD con historial (sin contrato activo)
7. **`20260826_cobros_finanzas_derivadas.sql`** ← mora, saldo y pagado se calculan en Postgres (Angular solo lee)
8. **`20260827_contratos_unicidad_activa.sql`** ← un conductor / una moto no pueden tener dos contratos activos (índice único parcial); duración mínima 3 meses; al activar se asigna la moto
9. **`20260828_planes_catalogo.sql`** ← catálogo `planes` + snapshot en contrato (`plan_id`, `plan_nombre`, `cuota_inicial`, `duracion_meses`); quita el DEFAULT 180000 de `cuota_semanal`. **No reescribe montos de contratos/cobros existentes. No toca mora.**
10. **`20260829_talleres_confianza.sql`** ← catálogo `talleres_confianza` (staff CRUD; conductor autenticado solo ve `activo = true`). **No siembra filas.** No toca planes, contratos, cobros, mora ni dashboard.
11. **`20260830_dashboard_staff.sql`** ← RPC `resumen_dashboard(semana|mes|anio)` para el panel staff. Agrega en Postgres (ingresos, contratos, flota, cartera, mora, planes). **No toca** talleres, planes, wizard, mora SQL, ni `cuota_semanal`.
12. **`20260831_abono_registrado_pagos_caja.sql`** ← al confirmar un abono (`estado = registrado`) crea fila en `pagos` + ingreso en `movimientos_caja` (banco MDD). No borra filas (anulado). Backfill de abonos ya aprobados. RLS de caja/pagos: escribe solo staff.
13. **`20260901_multi_tenant_empresas.sql`** ← aísla producción vs pruebas (`empresas` + `empresa_id` + RLS). **Obligatorio** si quieres un login de TEST que no vea plata real.
14. **`20260902_assert_misma_empresa_grant.sql`** ← hotfix si el owner ve `permission denied for function assert_misma_empresa` al INSERT/UPDATE. **No re-ejecutes 20260901.** Un `grant execute … to authenticated` ya desbloquea; este archivo es el arreglo durable.
15. **`20260903_dashboard_ingresos_egresos.sql`** ← `resumen_dashboard` suma **cuotas** (abonos registrados) **+ otros ingresos** (caja ingreso sin `abono_id`: alquiler puntual). Añade `egresos_periodo` / `egresos_mensuales` (`movimientos_caja.tipo = egreso`). **No duplica** caja ligada a un abono. No toca mora, talleres ni planes.

Luego cierra sesión y vuelve a entrar.

## Planes (20260828) — cómo aplicar y probar

1. Abre Supabase → **SQL Editor** → New query.
2. Pega el contenido de `supabase/migrations/20260828_planes_catalogo.sql` → **Run**.
3. Verifica:
   ```sql
   select nombre, valor_sugerido, periodicidades_permitidas, activo from public.planes order by nombre;
   -- Personal 115000, Trabajo 180000, Propietario 0 (a convenir)

   select column_name, column_default
   from information_schema.columns
   where table_schema = 'public' and table_name = 'contratos'
     and column_name in ('cuota_semanal', 'plan_id', 'plan_nombre', 'cuota_inicial', 'duracion_meses');
   -- cuota_semanal.column_default debe ser NULL (ya no 180000)
   ```
4. Contratos viejos: `plan_id` y `plan_nombre` quedan NULL (la UI muestra **Sin plan**). `cuota_semanal` **no cambia**.
5. En la app (admin/asesor): menú **Planes**. Edita, crea, activa/desactiva. Los tres de semilla son editables.
6. **Contratos → Nuevo contrato**:
   - Sin plan no deja guardar.
   - Elige **Personal** → sugerido $115.000 semanal (editable).
   - Elige frecuencia de la lista del plan.
   - El valor que guardes se congela en `contratos.cuota_semanal`.
7. Prueba de no-reescribir: anota la `cuota_semanal` de un contrato viejo. En **Planes**, cambia el `valor_sugerido` de Trabajo o Personal. Recarga el contrato: la cuota pactada **sigue igual**. Los cobros nuevos de ese contrato siguen copiando `contrato.cuota_semanal` (no el plan).

El plan **sugiere**. No hay tarifa global $160.000 / $180.000 para contratos.

## Talleres de confianza (20260829) — cómo aplicar y probar

1. Abre Supabase → **SQL Editor** → New query.
2. Pega el contenido de `supabase/migrations/20260829_talleres_confianza.sql` → **Run**.
3. Verifica:
   ```sql
   select column_name, data_type
   from information_schema.columns
   where table_schema = 'public' and table_name = 'talleres_confianza'
   order by ordinal_position;
   -- nombre, direccion, telefono, latitud, longitud, horario, servicios, activo

   select * from public.talleres_confianza;
   -- vacío es correcto (no hay semilla)
   ```
4. En la app (admin/asesor): menú **Talleres**. Crea un taller con lat/lng (ej. Bogotá 4.7110, −74.0721). Activa/desactiva.
5. Cierra sesión. Entra como **empleado** (conductor) → `/empleados` → **Talleres**. Debe verse solo el activo, con dirección, teléfono, horario, servicios, pin OSM y **Cómo llegar** (Google Maps, sin API key de billing).
6. Desactiva el taller como staff. Recarga el panel del conductor: ya no aparece.
7. (Opcional) Clic derecho en OpenStreetMap para copiar lat/lng. Ejemplo comentado al final del SQL.

```sql
-- insert into public.talleres_confianza
--   (nombre, direccion, telefono, latitud, longitud, horario, servicios, activo)
-- values
--   (
--     'Taller Central GoRenting',
--     'Cra 7 #32-16, Bogotá',
--     '3001234567',
--     4.7110000,
--     -74.0721000,
--     'Lun–Sáb 8:00–18:00',
--     'Llantas, aceite, frenos, diagnóstico',
--     true
--   );
```

## Dashboard staff (20260830) — cómo aplicar y probar

1. Abre Supabase → **SQL Editor** → New query.
2. Pega el contenido de `supabase/migrations/20260830_dashboard_staff.sql` → **Run**.
3. Verifica el rango (America/Bogota; default mes calendario; semana ISO lun–dom):
   ```sql
   select * from public.rango_periodo_dashboard('mes');
   select public.resumen_dashboard('mes');
   -- ingresos_periodo, contratos_activos, contratos_nuevos, conductores_activos,
   -- motos_alquiladas (estado=en_uso), motos_disponibles, cartera, mora_cantidad,
   -- mora_monto, crecimiento (ingresos_mes_actual vs ingresos_mes_anterior), planes[]
   -- Vacío debe ser 0 / [] — nunca cifras de ejemplo.
   ```
4. Cruza una tarjeta con una fila conocida:
   ```sql
   -- Ingresos del mes = abonos registrados (no anulado, no pendiente_confirmacion)
   select coalesce(sum(monto), 0)
   from public.abonos
   where estado = 'registrado'
     and (timezone('America/Bogota', fecha_pago))::date
         between (select desde from public.rango_periodo_dashboard('mes'))
             and (select hasta from public.rango_periodo_dashboard('mes'));

   -- Contratos nuevos: fecha_inicio (inicio comercial), no created_at
   select id, fecha_inicio, created_at, estado, plan_nombre
   from public.contratos
   where estado is distinct from 'anulado'
     and fecha_inicio between (select desde from public.rango_periodo_dashboard('mes'))
                         and (select hasta from public.rango_periodo_dashboard('mes'));

   -- Cartera y mora (mora usa cobro_en_mora, no se recalcula en Angular)
   select
     coalesce(sum(saldo) filter (where estado is distinct from 'anulado'), 0) as cartera,
     count(*) filter (where public.cobro_en_mora(estado, saldo, fecha_vencimiento)) as mora_n,
     coalesce(sum(saldo) filter (where public.cobro_en_mora(estado, saldo, fecha_vencimiento)), 0) as mora_monto
   from public.cobros;
   ```
5. En la app: entra como **administrador/asesor** → `/dashboard`. Cambia Semana / Mes / Año. Los números deben coincidir con las consultas de arriba.
6. Entra como **empleado** → `/empleados`. No debe ver el dashboard staff. El RPC responde `42501` si un conductor lo llama.

Definiciones:
- **Ingresos** = cuotas (`sum(abonos.monto)` con `estado = 'registrado'`) **+ otros** (`movimientos_caja` ingreso, `abono_id IS NULL`, no anulado). Fecha de cuota = `fecha_pago` en `America/Bogota`. Fecha de otros = `movimientos_caja.fecha`.
- **Egresos** = `movimientos_caja.tipo = 'egreso'` no anulado (mantenimientos, Flujo de caja). `pagos.gastos` no es este stream (el pago manual legacy lo resta del neto).
- **No duplicar:** la caja que crea el trigger 20260831 tiene `abono_id` y **no** se vuelve a sumar.
- **Contratos nuevos** = `fecha_inicio` en el periodo y `estado <> anulado`. Se eligió `fecha_inicio` porque es el inicio comercial del arriendo; `created_at` es el alta del borrador.
- **Motos alquiladas / disponibles** = `motos.estado` `en_uso` / `disponible` (no se inventan estados).
- **Planes** = snapshot `contratos.plan_nombre`; NULL o vacío → **Sin plan**. Solo cuotas de contrato (otros ingresos no tienen plan).

No toca talleres, catálogo de planes, wizard de contrato, SQL de mora, generación de cobros ni `cuota_semanal` histórica.

## Abono aprobado → Pagos y Flujo de caja (20260831)

El conductor reporta un abono (`pendiente_confirmacion`). Staff **Confirmar** en Pagos o Dashboard solo ponía `abonos.estado = 'registrado'`. Eso actualiza el cobro (trigger de saldo) y cuenta en ingresos del dashboard, pero **Pagos** lee `pagos` y **Flujo de caja** lee `movimientos_caja` — esas tablas no se escribían.

1. Supabase → **SQL Editor** → pega `supabase/migrations/20260831_abono_registrado_pagos_caja.sql` → **Run**.
2. Verifica:
   ```sql
   select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'pagos' and column_name in ('abono_id', 'estado');
   select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'movimientos_caja' and column_name in ('abono_id', 'estado');

   -- Backfill: abonos ya registrados deben tener pago + caja
   select a.id, a.monto, a.estado, p.id as pago_id, mc.id as caja_id
   from public.abonos a
   left join public.pagos p on p.abono_id = a.id
   left join public.movimientos_caja mc on mc.abono_id = a.id
   where a.estado = 'registrado';
   ```
3. Retest: conductor envía un abono → staff Confirmar.
   ```sql
   -- El abono confirmado
   select id, monto, estado from public.abonos where id = '<abono_id>';
   -- Debe existir el pago (lo lista /pagos)
   select id, monto, valor_pagado, estado, abono_id from public.pagos where abono_id = '<abono_id>';
   -- Debe existir el ingreso MDD (lo lista /flujo-caja)
   select id, banco, tipo, monto, estado, abono_id from public.movimientos_caja where abono_id = '<abono_id>';
   -- Cobro: monto_pagado/saldo vía trigger de 20260826 (no se reescribe cuota)
   select id, monto_esperado, monto_pagado, saldo, estado from public.cobros where id = '<cobro_id>';
   ```
4. App: `/pagos` muestra la fila. `/flujo-caja` muestra ingreso MDD. Dashboard → ingresos del periodo sube (abonos registrados).
5. Rechazar un pendiente **no** crea pago/caja. Anular un abono ya registrado marca `pagos` y `movimientos_caja` como `anulado` (no DELETE).

## Multi-tenant: producción vs pruebas (20260901)

Hoy el app es un solo tenant: staff y conductores ven el mismo dataset. Este SQL crea dos empresas y aísla filas con RLS.

| Empresa | Qué hay |
|---|---|
| **GoRenting** | Operación real. Todas las filas actuales se backfillean aquí. |
| **GoRenting Pruebas** | Vacía (salvo semilla opcional). El admin de pruebas no suma ingresos de producción. |

No hay selector de tenant en Angular. El login decide la empresa (membresía en `usuarios.empresa_id`). `empresa_id` lo estampa un trigger desde `empresa_id_actual()` — el cliente no puede mandar el id de otra empresa.

**No hace:** signup público, billing, onboarding, borrar filas financieras, reescribir `cuota_semanal` / montos de cobros, cambiar wizard / talleres / mora.

### Cómo aplicar

1. Supabase → SQL Editor → pega `supabase/migrations/20260901_multi_tenant_empresas.sql` → **Run**.

Si un run falló con `42703 column u.empresa_id does not exist` **o** `42883 operator does not exist: name[] = text[]`: **no hagas DROP de `empresas`**. Baja este commit, pega de nuevo el archivo completo y Run. Las dos empresas y las columnas `empresa_id` ya aplicadas se conservan.

2. Verifica:
   ```sql
   select nombre, id, activa from public.empresas order by nombre;
   -- GoRenting y GoRenting Pruebas

   select
     (select count(*) from public.contratos where empresa_id = public.empresa_id_produccion()) as contratos_prod,
     (select count(*) from public.contratos where empresa_id = public.empresa_id_pruebas()) as contratos_pruebas,
     (select count(*) from public.cobros where empresa_id = public.empresa_id_produccion()) as cobros_prod,
     (select count(*) from public.cobros where empresa_id = public.empresa_id_pruebas()) as cobros_pruebas;
   -- pruebas debe ser 0

   select email, rol, empresa_id from public.usuarios order by created_at;
   -- los usuarios que ya existían quedan en producción
   ```

### Crear el login de TEST (esta VM no puede crear Auth users)

1. Supabase → **Authentication → Users → Add user** (email + password). Copia el UUID.
2. Abre `supabase/snippets/attach_usuario_pruebas.sql`.
3. Pega el UUID en el bloque **A** (administrador) o **B** (empleado/conductor) y corre **solo ese bloque**.

⚠️ **NUNCA** adjuntar un usuario de prueba a la empresa **GoRenting** (producción).  
⚠️ **NUNCA** pegar el UUID de un admin/asesor/conductor que ya opera en vivo. Si el UUID ya tiene perfil en producción, el SQL aborta.

### Semilla opcional (solo pruebas)

En `20260901_multi_tenant_empresas.sql` hay un `do $$` con `v_sembrar boolean := false`. Ponlo en `true` y vuelve a correr el archivo: crea 1 moto `TST-000` y 1 plan inactivo **Plan Pruebas**. Activa el plan en **Planes** para poder usar el wizard. **No copia** conductores/contratos/cobros reales.

### Cómo probar en local

```bash
git checkout <esta-rama>
npm install
ng serve
```

1. Aplica el SQL 20260901. Cierra sesión y entra de nuevo.
2. Login **producción** (cuentas de siempre) → dashboard/motos/contratos/pagos/caja/planes/talleres = datos reales (igual que antes).
3. Crea Auth user + adjúntalo a **GoRenting Pruebas** (snippet A).
4. Login pruebas admin → dashboard 0 (o solo la semilla). Motos/contratos/pagos/caja/talleres vacíos. Planes: vacío o Plan Pruebas.
5. Login pruebas conductor (snippet B) → `/empleados`: sin cobros de producción, sin talleres de producción.
6. Cruza el RPC (debe dar 0 para el JWT de pruebas):
   ```sql
   -- En SQL Editor (sin JWT) esto sigue siendo PRODUCCIÓN, a propósito:
   select public.resumen_dashboard('mes');

   -- Como el admin de pruebas, desde la app: /dashboard
   -- o en SQL Editor impersonando el JWT, ingresos_periodo debe ser 0.
   ```

Helpers: `empresa_id_actual()`, `empresa_id_produccion()`, `empresa_id_pruebas()`, `misma_empresa(uuid)`.

## Hotfix: permission denied for `assert_misma_empresa` (20260902)

Después de 20260901, INSERT/UPDATE autenticados (contrato, moto, usuario, taller, abono, …) fallan con `permission denied for function assert_misma_empresa`. El trigger `validar_refs_empresa` corría como el JWT (`SECURITY INVOKER`) y llamaba un helper al que se le había hecho `REVOKE` de `authenticated`.

**Aplica ya (SQL Editor):** pega `supabase/migrations/20260902_assert_misma_empresa_grant.sql` → **Run**. No re-ejecutes 20260901.

Desbloqueo de una línea (si aún no puedes pegar el archivo):

```sql
grant execute on function public.assert_misma_empresa(text, uuid, uuid) to authenticated;
```

Ese GRANT ya deja escribir. El archivo 20260902 es el arreglo durable: recrea `assert_misma_empresa` y `validar_refs_empresa` como `SECURITY DEFINER` (`search_path = public`), concede `EXECUTE` a `authenticated` y `service_role`, y deja `validar_refs_empresa` / `stamp_empresa_id` sin `EXECUTE` para anon/authenticated (solo trigger).

```sql
select p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('assert_misma_empresa', 'validar_refs_empresa');
-- prosecdef = true en ambos
```

No toca Angular, mora, wizard, planes, talleres UX ni cobros.

## Dashboard: otros ingresos + egresos (20260903)

El alquiler puntual (ej. 30.000 COP × 2) que la asesora registraba con “pago manual” por moto **nunca era un abono**. `resumen_dashboard` solo sumaba `abonos.estado = 'registrado'`, así que no salía en KPIs ni en la gráfica.

1. Supabase → **SQL Editor** → pega `supabase/migrations/20260903_dashboard_ingresos_egresos.sql` → **Run**.
2. En la app, **Pagos → Otros ingresos**: concepto (Alquiler puntual), valor, MDD opcional. Eso escribe `pagos` + `movimientos_caja` ingreso **sin** `abono_id`.
3. Verificar:
   ```sql
   -- Otros ingresos del mes (no cuotas)
   select id, monto, fecha, descripcion, abono_id, tipo, estado
   from public.movimientos_caja
   where tipo = 'ingreso' and abono_id is null
     and estado is distinct from 'anulado'
     and fecha between (select desde from public.rango_periodo_dashboard('mes'))
                   and (select hasta from public.rango_periodo_dashboard('mes'));

   -- El RPC (staff JWT). ingresos_periodo = cuotas + otros
   select public.resumen_dashboard('mes') -> 'ingresos_periodo';
   select public.resumen_dashboard('mes') -> 'ingresos_otros';
   select public.resumen_dashboard('mes') -> 'egresos_periodo';
   ```
4. Dashboard: gráfica **Ingresos** (cuotas + otros) y gráfica **Egresos** (solo caja `tipo = egreso`). Un egreso no sube ingresos.

No borra filas, no reescribe `cuota_semanal`, no cambia talleres / planes / mora.

## Si en producción no ves usuarios / pagos / caja / documentos

Suele ser **sesión expirada**: el menú te deja entrar (token viejo en localStorage) pero Supabase RLS no recibe JWT y las listas salen vacías.

1. Cierra sesión y vuelve a entrar en prod.
2. Confirma que tu usuario en tabla `usuarios` tiene `rol = administrador` o `asesor` y `activo = true`.
3. Confirma que el deploy usa el mismo `supabaseUrl` / `supabaseKey` que local (`src/environments/environment.ts`).
4. Ejecuta los SQL de arriba en **el mismo** proyecto Supabase de prod.
