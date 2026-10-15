# Control Hípico · vínculos compartibles de consulta (implementación 2026-10-15)

## Hecho y límites de la referencia

Las URLs facilitadas por el usuario incluyen `?t=<valor opaco>`. El mismo valor aparece en historial y movimientos, mientras que la página personal tiene uno diferente. **Esta observación no demuestra que el valor sea el ID real del grupo ni autoriza inferir las tablas PHP ajenas.** Las tres consultas directas fueron rechazadas por la herramienta de navegación y el entorno no resuelve el DNS del dominio. REA no capturó HTML/DOM; esta es una implementación propia, no un clon validado.

## Arquitectura nueva

```text
Operador autorizado (HIPICO_OPERATOR_CONTROL_TOKEN)
    -> POST /api/v1/hipico/report-shares
       { groupKey, audience: participant|group, participantCode?, hours }
       -> Postgres HIPICO_OWNER_ID + group_key + SHA-256(token aleatorio 256 bits)
          token claro SOLO en la respuesta de emisión
    -> GET /api/v1/hipico/report-shares?groupKey=...
       -> lista id, scope, caducidad, revocación (SIN hashes/tokens)
    -> DELETE /api/v1/hipico/report-shares/:id -> revoca
Lector del vínculo
    -> GET /api/v1/hipico/report-shares/public?t=<token>&date=AAAA-MM-DD
       -> token SHA-256 y contexto owner+grupo desde BD
       -> vencimiento y revocación verificados ANTES del ledger
       -> estado histórico desde hipico_money_ledger_entries únicamente
       -> HTML sin terceros / JSON negociado, sin cookies ni cambios de estado
```

**Privilegios y tenancy:** la nueva tabla tiene RLS y deniega anon/authenticated; `contagest_runtime` únicamente consulta/modifica el owner vinculado por `set_config('hipico.report_owner_id', ..., true)` dentro de la transacción. El contexto `HIPICO_OWNER_ID` debe ser un UUID verificado; se falla cerrado si falta. La misma condición owner+grupo+participante se aplica en todas las lecturas. No se guardan tokens en claro, ni se consultan sin un token válido. La emisión exige que exista al menos un asiento real para ese grupo/participante; no crea saldos ficticios.

**Moneda y tiempo:** los importes vienen de `amount_minor NUMERIC(30,0)`, se transportan como string para preservar precisión y se presentan con dos decimales sin `Number`. No se mezclan USD, VES ni otras divisas. La fecha de operación se interpreta en `America/Caracas` (UTC-04) para capturar el día local correcto incluso durante la noche. Una fecha sin selección corresponde al día vigente de Caracas.

**Exposición de datos:** un enlace de grupo autoriza ver códigos de participante y movimientos financieros de ese grupo; NO debe emitirse al público abierto. Un enlace personal se limita a un código de participante. Los listados están limitados a 100 filas y declaran truncamiento. No hay fotografías, teléfonos, mensajes, notas internas, identificadores de evidencias, fuente WhatsApp, historial de otras cuentas, credenciales ni autoridad para operar dinero.

**Salvedad de consistencia:** el reporte web/PWA construido en PR #999 usa el workspace de IndexedDB/Supabase; esta API nueva usa exclusivamente el ledger canónico PostgreSQL. Es posible que su cobertura histórica difiera si la sincronización aún no ha confirmado movimientos. Se **declara** la fuente `canonical-postgresql-ledger` y `racesAvailable: false` en lugar de presentar imágenes de pizarra inventadas. La conciliación de ambos orígenes y el render completo de carreras reales requieren ticket e integración posterior.

## Despliegue con puertas explícitas

1. Revisar y desplegar la migración `backend/prisma/migrations/20261015035000_hipico_report_share_links/migration.sql` con el mecanismo de migración auditada existente, jamás mediante `db push` destructivo. Validar roles, RLS y sus grants.
2. Configurar `HIPICO_OWNER_ID` y `HIPICO_OPERATOR_CONTROL_TOKEN` **solo en backend**, nunca en frontend, scripts o enlace compartido.
3. En un canal administrativo seguro, ejecutar:

```bash
curl -X POST 'https://TU_BACKEND/api/v1/hipico/report-shares' \
  -H 'Content-Type: application/json' \
  -H 'x-hipico-operator-token: <SECRET_OPERADOR_EN_VARIABLE_PROTEGIDA>' \
  -d '{"groupKey":"grupo-autorizado","audience":"participant","participantCode":"codigo-autorizado","hours":24}'
```

El ejemplo de `curl` es ilustrativo: en producción usar entorno seguro que no almacene la credencial en historial de shell ni logs. La API devuelve un enlace relativo con `?t=` que debe compartirse **solo con destinatarios autorizados**. La respuesta que contiene el secreto no debe archivarse en sistemas de tickets ni pegarse en el chat.

4. Consultar los enlaces activos con `GET /api/v1/hipico/report-shares?groupKey=grupo-autorizado` y el mismo header de operador. Revocar por UUID de respuesta con `DELETE /api/v1/hipico/report-shares/:id`.

**Riesgo operativo inherente al query parameter:** `?t=` sigue siendo una credencial URL, susceptible a historial del navegador, registros del proxy/hosting o divulgación por reenvío. La respuesta deshabilita caché, robots, referrers, recursos externos y framing; los logs internos deben usar solo template de ruta sin query. En producción configurar el gateway/edge/CDN para REDACTAR el query `t` **antes de registrar solicitudes**. No distribuir el enlace vía servicios de analítica ni cargar píxeles. Revocar inmediatamente ante pérdida, y limitar aún más los TTL según el riesgo.

## Gestión sencilla desde la terminal del operador

Se añadió un comando opcional que **no solicita ni acepta el token de operador como parámetro**. Solo lee `HIPICO_OPERATOR_CONTROL_TOKEN` desde el entorno local y usa una URL HTTPS configurada, sin rutas, queries, credenciales incrustadas ni redirecciones HTTP. Permite crear, listar y revocar enlaces desde un canal administrativo supervisado:

```powershell
# Definir HIPICO_OPERATOR_CONTROL_TOKEN en un gestor de secretos local.
$env:HIPICO_REPORT_API_ORIGIN = 'https://BACKEND-DE-TU-CLUB'
npm run hipico:report-links -- create grupo-autorizado participant CLIENTE_AUTORIZADO 24
npm run hipico:report-links -- create grupo-autorizado group 4
npm run hipico:report-links -- list grupo-autorizado
npm run hipico:report-links -- revoke 00000000-0000-4000-8000-000000000000
```

El valor de ejemplo en `revoke` no corresponde a ningún enlace válido. El enlace creado solo se imprime en la terminal en el momento de la emisión: compártelo privadamente, nunca en GitHub/issue/chat público. La CLI no almacena esa URL. No se requiere configurar el token de operador en ningún frontend.

`GET /public` sin `date` usa el día calendario operativo de Caracas; el HTML compartido incluye un selector de fecha que mantiene el mismo ámbito ya autorizado por el token.

## QA y rollback

```bash
npm --workspace backend run typecheck
npm --workspace backend run test:hipico
npm --workspace backend run prisma:deploy   # migración autorizada, en entorno staging primero
```

Los tests HTTP de `report-share.routes.test.ts` son sintéticos con store simulado; no prueban la política RLS en un PostgreSQL real. Por ello se exige integración PostgreSQL, comprobación efectiva del rol runtime y E2E navegador antes de distribuir enlaces con datos reales.

**Estado:** no se ha desplegado la migración en producción, creado ningún enlace real, expuesto dinero de clientes ni activado WhatsApp. La interfaz pública es de lectura exclusiva. Para rollback deshabilitar el montaje del router; conservar registros de revocación en BD hasta el período de retención correspondiente. Ningún rollback borra el ledger.


## Consolidación por grupo sin inventar saldos (extensión 15/10/2026)

La tercera referencia observada en el documento del propietario describe un consolidador de 42 cuentas / 21 filas visibles, con saldo, apuestas y movimientos categorizados. En esta implementación **solo se usan campos realmente presentes en** `public.hipico_money_ledger_entries` (`bet, settlement, adjustment, reversal`). La PWA privada de PR #999 tiene columnas adicionales derivadas de su `workspace`, pero no se replican como si el ledger PostgreSQL pudiera certificarlas.

**Acceso:** únicamente un token con `audience: "group"` permite `GET /api/v1/hipico/report-shares/public?t=<TOKEN>&view=consolidated`. Los enlaces personales retornan 404 indistinguible de una credencial inválida. La emisión de un enlace de grupo entrega `consolidatedRelativeUrl` además del enlace básico, una única vez y bajo autenticación del operador. La CLI presenta los dos enlaces y advierte expresamente que el consolidador puede exponer múltiples cuentas. Ninguna credencial se guarda en la lista de enlaces emitidos.

**Campos con autoridad verificada:**

| Dato mostrado | SQL realmente disponible |
|---|---|
| Participante | `participant_code` del owner+group autorizado, **no nombre ni teléfono** |
| Moneda | `currency` del asiento, sin sumar USD y VES |
| Saldo histórico | `SUM(amount_minor)` hasta el final de la fecha operativa Caracas |
| Liquidaciones día/semana | `settlement` más los `reversal` asociados a liquidaciones del mismo owner, grupo, código y moneda |
| Disponible con aval, devolución, depósitos, retiros, transferencias, aval | **NO DISPONIBLES** (no se interpretan `adjustment` ni `reversal` como esos tipos) |

**Consulta:** fecha ISO, búsqueda por código, paginación de **21 códigos únicos por página** (varias monedas por participante aparecen en filas separadas), tope de página 500, conteo de participantes del grupo y del conjunto buscado. Los totales del **grupo completo** y de la **búsqueda** se calculan por separado y siempre se etiquetan en su moneda, nunca como total global inventado. La fuente y la marca `balancesAsOf` figuran en JSON y la vista HTML incluye una nota de columnas no disponibles. No hay export ni envío automático desde la página compartida. La cabecera HTTP conserva `no-store`, `no-referrer`, CSP con nonce, `noindex` y ausencia de assets externos.

**Consistencia y revocación:** cada consulta se ejecuta en transacción PostgreSQL `RepeatableRead`, ajusta el owner local de RLS y bloquea `FOR SHARE` la fila del token antes de leer dinero; el revocado no puede atravesar el control, y las lecturas iniciadas antes del revocado terminan contra el snapshot anterior sin cruzarse con la actualización de revocación. No se altera dinero ni se emite un segundo token.

**Evidencia:**
```bash
npm --workspace backend run typecheck
npx --no-install tsx --test backend/src/modules/hipico/report-share.routes.test.ts
node --test tests/hipico_report_share_schema_contract.test.mjs
node --test tests/hipico_report_share_cli_contract.test.mjs
```
El workflow del PR corre estas pruebas sobre el SHA candidato. HTTP usa store falso: **no equivale a un test PostgreSQL/RLS ejecutado**. Antes de dar un enlace real se exige migración revisada en staging, RLS con rol `contagest_runtime`, validación de `FOR SHARE` y `RepeatableRead`, carga de 42+ cuentas y redacción de query strings del ingress/CDN. No poner token de clientes en issues o mensajes públicos.

**Integración de ramas (verificada):** PR #999 ya fusionado a `main` (15/10/2026). El PR #1000 fue reconciliado mediante merge commit `a96d260bcf770d88ba47e45ce5fa5f98194b1af9` con dos padres para preservar íntegros el consolidador/PWA r38 y las novedades de release v660. Su PR tiene base `main` y una comparación de solo 12 archivos propios. No hay migración aplicada ni habilitación de enlaces reales. Nuevas validaciones de RLS, HTTP, PostgreSQL y CI siguen pendientes antes del merge.


## Activación protegida, pruebas aisladas y coste CI (15/10/2026)

**Fail-closed:** todos los endpoints `/api/v1/hipico/report-shares`, incluidos GET públicos, creación, lista y revocación, retornan HTTP 503 `HIPICO_REPORT_SHARES_DISABLED` mientras `HIPICO_REPORT_SHARES_ENABLED` no sea exactamente `true`. El valor predeterminado es **desactivado**. Ni la migración ni el merge activan el acceso a reportes financieros. Para habilitarlo se requiere que el operador confirme el resultado real de RLS, el alcance de grupo, la observabilidad sin tokens `?t=`, los roles efectivos y la política de expedición de capacidades.

**Comandos de contrato sin red ni PostgreSQL:**

```bash
npm run test:hipico:share:offline
# Requiere dependencias npm ya instaladas:
npx --no-install tsx --test backend/src/modules/hipico/report-share.routes.test.ts
```

**Prueba adversarial PostgreSQL 17 de verdad, SOLO entorno descartable:**

```bash
# Prepara manualmente PostgreSQL 17 LOCAL con base RECIÉN CREADA,
# nombre hipico_share_test_*, usuario postgres superusuario.
# NUNCA usar Supabase remoto, base real, staging compartida ni datos de usuarios.
export HIPICO_SHARE_RLS_DATABASE_URL='postgresql://postgres:***@127.0.0.1:5432/hipico_share_test_v1000'
export HIPICO_SHARE_RLS_CONSENT='ephemeral-local-postgres17-hipico-share-rls'
npm run test:hipico:share:postgres
```

El guard prohíbe nombres de base que no empiecen por `hipico_share_test_`, hosts fuera de loopback, usuarios distintos de `postgres`, consultas y fragmentos URL, versiones de PostgreSQL distintas a 17, esquemas con tablas existentes y ausencia de consentimiento. El script prepara migraciones reales en la base **efímera** y comprueba `FORCE RLS`, propietario A/B, ausencia de contexto, escritura cruzada, revocación cruzada, ámbito grupo y eliminación de GUC al cerrar la transacción. **Nunca se ha ejecutado aquí contra PostgreSQL real**, por lo que no está marcado PASS hasta ver su salida.

**GitHub Actions con cuota Free:** el workflow especializado `.github/workflows/hipico-report-share-links.yml` ya NO usa eventos `pull_request` ni `push`; queda `workflow_dispatch` para ejecución expresa en una referencia donde el workflow esté disponible. Emplea una base PostgreSQL 17 efímera y ejecuta typecheck/API/RLS. **No se ha desactivado el CI general ni se han eludido reglas de protección de rama**, que continúan siendo responsabilidad del repositorio. Las pruebas locales siguen disponibles sin gastar minutos de Actions.

**Criterio de salida:** que `git` y GitHub indiquen PR integrable no reemplaza test PostgreSQL, revisión de cambios y prueba de proxy que elimine `t` de logs. El QA físico del sistema completo puede posponerse, pero no deben distribuirse enlaces financieros mientras los gates de seguridad no tengan evidencia.



## Extensión de seguridad #1018 — concurrencia de revocación y caducidad

El test aislado `backend/scripts/hipico-report-share-rls-v1000.mjs` ahora incluye cinco aserciones adversariales adicionales, sin escribir en ninguna tabla de negocio ni conectarse al servidor real:

1. Enlaces caducados y ya revocados permanecen **inactivos** para el filtro de autorización.
2. El conteo de capacidades del grupo omite los enlaces inactivos, incluso cuando sus filas siguen presentes para auditoría.
3. Una lectura `SELECT ... FOR SHARE` adquiere el bloqueo sobre la fila de la capacidad.
4. Una sesión distinta intenta revocar esa misma fila con `lock_timeout='300ms'` y debe obtener SQLSTATE `55P03` antes de que termine la lectura.
5. Después del `ROLLBACK` del lector, la revocación se persiste y la siguiente transacción ve `revoked_at` de forma inequívoca.

Estos controles son **pruebas PostgreSQL ejecutables**, no evidencia de que se hayan corrido aún. El test estático `tests/hipico_report_share_rls_guard_v1000.test.mjs` exige que dichas aserciones no desaparezcan accidentalmente.

**Importante:** `FOR SHARE` solo garantiza el orden transaccional; no convierte por sí solo un token en autorización para conocer otros grupos. `owner_id`, `group_key`, audiencia y plazo siguen siendo filtros obligatorios en el store. El propio ledger de dinero no adquiere RLS nuevo como efecto de este test. Antes de desplegar debe confirmarse el privilegio real del rol runtime, sin tomar el `GRANT SELECT` exclusivo de la fixture como autorización productiva.

**Coste CI:** el workflow especializado de este módulo sigue manual (`workflow_dispatch`). No se desactivan validaciones del repositorio ni se ejecutan acciones sobre bases reales. `HIPICO_REPORT_SHARES_ENABLED` continúa desactivado por defecto; #1018 permanece abierto hasta la ejecución aislada y las verificaciones en staging.
