# Control Hípico v1.13.0 RC3 · release y QA

**Producto:** Control Hípico  
**Runtime/PWA canónico:** `frontend/public/hipico-control`  
**Wrapper Android:** `android/hipico-control-v1130`  
**Versión app:** `1.13.0-rc3`  
**Bridge WhatsApp Web:** `1.4.2`  
**Estado de código:** `RELEASE CANDIDATE / PENDING EXACT-SHA REVERIFY`

Control Hípico es un producto independiente de ContaGest ERP aunque comparta temporalmente repositorio, backend y PostgreSQL. Mantiene ruta, PWA, almacenamiento, contratos, migraciones, wrapper Android y ciclo de release propios.

## Fuente canónica

Ya no se depende de un `runtime.zip.b64` para reconstruir la app. Ese mecanismo fue retirado porque el artefacto histórico no era una fuente fiable. La fuente que se versiona y revisa es directamente:

```text
frontend/public/hipico-control/
```

El wrapper Android usa `scripts/sync-web.mjs` para copiar únicamente esa fuente a `www/` y verificar rutas/hashes. Antes de compilar:

```bash
cd android/hipico-control-v1130
npm ci --no-audit --no-fund
npm run verify:web
```

Una divergencia entre PWA y Android debe bloquear el build.

## PWA

El gate manual debe cubrir:

- instalación PWA y actualización;
- arranque online/offline;
- service worker y rutas sensibles network-only;
- persistencia/reinicio;
- workspace y recuperación sin limpiar storage ajeno;
- participantes, carreras, POLLA/riesgo, adelantadas, llegada, cierre, liquidación, historial y exportación;
- feed shadow de WhatsApp;
- móvil/desktop, rotación y safe areas;
- ausencia de datos demo/bypass ficticios.

## Android

El build reproducible de QA se genera desde el mismo runtime:

```bash
cd android/hipico-control-v1130
npm ci --no-audit --no-fund
npm run android:qa
```

Salida esperada:

```text
artifacts/Hipico-Control-v1.13.0-rc3-debug.apk
artifacts/SHA256SUMS.txt
artifacts/QA_APK_METADATA.json
artifacts/APK_BADGING.txt   # cuando aapt está disponible
```

`package-qa-apk.mjs` copia el APK debug construido, calcula SHA-256 y, cuando Android SDK está disponible, verifica la firma debug con `apksigner` y extrae badging con `aapt`.

No se versionan APK, keystores, `key.properties`, `local.properties` ni secretos de firma.

## Bridge WhatsApp Web v1.4.2

El grupo existente usa WhatsApp normal mediante un dispositivo vinculado en WhatsApp Web. Este Bridge es la vía prevista para observar el grupo real; WhatsApp Cloud no sustituye ese flujo de grupo.

El flujo protegido es:

```text
FUENTE oficial read-only
  → captura/deduplicación
  → spool durable
  → backend/Supabase shadow
  → clasificación/sugerencia
  → LAB opcional durante QA
```

Antes de cualquier envío LAB se exige binding de IDs estables `@g.us`:

```text
CONFIGURAR-GRUPOS-HIPICO.cmd
```

El helper no envía mensajes. Captura fuente y LAB por separado, obliga IDs válidos/distintos y guarda los valores fuera de Git.

Prueba automatizada limitada al LAB:

```text
PROBAR-HIPICO-LAB.cmd
```

Antes de escribir/Enter y después del envío el runtime vuelve a validar el nombre y el ID real del LAB. Si cambia el destino, limpia el borrador y falla cerrado.

## Persistencia de adapters serverless

Las funciones bajo `frontend/api/hipico/*` no deben reutilizar implícitamente las credenciales generales del ERP. Su persistencia y autenticación interna se configuran explícitamente:

```text
HIPICO_OWNER_ID=<uuid-owner-autorizado>
HIPICO_SUPABASE_URL=<https-supabase-runtime>
HIPICO_SUPABASE_SERVICE_ROLE_KEY=<secreto-servidor>
HIPICO_INTERNAL_API_TOKEN=<secreto-aleatorio-32+-bytes>
```

Si cualquiera de esas fronteras obligatorias falta o es débil, las operaciones que la necesitan fallan cerradas. Estas variables nunca deben aparecer en PWA, APK, logs o artefactos de QA.

## Proveedor hípico externo opcional · enrichment solamente

El backend dispone de un registry de proveedores para enriquecer estado de carreras sin convertir el feed externo en autoridad financiera. El proveedor es **opcional** y por defecto permanece deshabilitado/fail-closed. Un fallo, timeout, circuito abierto o dato stale nunca autoriza apuestas, resultados, saldos ni liquidaciones.

Contrato mínimo para habilitar el adapter soportado:

```text
HIPICO_RACE_PROVIDER=sportradar-uof
HIPICO_RACE_PROVIDER_BASE_URL=https://<host-vendor-permitido>
HIPICO_SPORTRADAR_UOF_TOKEN=<secreto-servidor>
```

Controles operativos opcionales y acotados:

```text
HIPICO_RACE_PROVIDER_TIMEOUT_MS=<500..15000>
HIPICO_RACE_PROVIDER_CACHE_TTL_MS=<1000..300000>
HIPICO_RACE_PROVIDER_STALE_TTL_MS=<1000..300000>
HIPICO_RACE_PROVIDER_FAILURE_THRESHOLD=<1..10>
HIPICO_RACE_PROVIDER_BACKOFF_MS=<1000..300000>
```

La URL debe ser HTTPS, sin credenciales/query/hash, sobre un dominio vendor permitido y con resolución DNS pública. El runtime limita tamaño de respuesta, XML permitido, timeout, cache, circuito y stale fallback. La API normaliza el resultado y no expone el XML/raw del vendor.

Invariantes públicos del adapter:

```text
enrichmentOnly=true
financialAuthority=false
effectsAllowed=false
manualReviewRequired=true
```

No configurar estas variables es un estado soportado: el provider informa `NOT_CONFIGURED`/disabled y el resto de Control Hípico debe continuar sin depender de ese enrichment.

## WhatsApp Cloud individual · opcional y fail-closed

El transporte Cloud es adicional y actualmente sólo soporta destinatarios individuales. No habilita envío al grupo SOURCE. Para cualquier envío exige simultáneamente configuración de transporte, aprobación explícita, binding al SHA candidato y allowlist de destinos.

Backend y serverless comparten **un solo contrato canónico** para esta integración. Instalaciones nuevas usan únicamente los nombres siguientes; `HIPICO_META_*` queda soportado en serverless como fallback de compatibilidad para despliegues antiguos y nunca tiene precedencia sobre una variable canónica presente.

Configuración de transporte/webhook:

```text
WHATSAPP_VERIFY_TOKEN=<secreto-servidor>
WHATSAPP_APP_SECRET=<secreto-servidor>
WHATSAPP_CLOUD_TOKEN=<secreto-servidor>
WHATSAPP_PHONE_NUMBER_ID=<id-numérico>
WHATSAPP_GRAPH_API_VERSION=v23.0   # o versión explícita válida
```

Gate de salida productiva:

```text
HIPICO_CLOUD_SEND_ENABLED=true
HIPICO_WHATSAPP_COMPLIANCE_DECISION=GO
HIPICO_CLOUD_SEND_APPROVED_BY=<responsable>
HIPICO_CLOUD_SEND_CANDIDATE_SHA=<sha-40-exacto-del-runtime>
HIPICO_CLOUD_ALLOWED_DESTINATIONS=<e164-allowlist-separada-por-comas>
HIPICO_CLOUD_SEND_TIMEOUT_MS=12000
```

Si falta cualquiera de estas condiciones, el sender queda deshabilitado. Si la persistencia del outbox no está lista, no se reclama ni envía el mensaje. Un timeout/red incierto o una respuesta exitosa sin `message id` pasa a conciliación y **no se reenvía automáticamente**.

Los secretos anteriores viven sólo en runtime/secret store; nunca se copian a PWA, APK, logs, evidencias o Git.

## Alcance de automatización actual

Puede operar de manera autónoma en este corte para:

- observar nuevos mensajes de la fuente;
- deduplicar;
- almacenar spool cuando backend no responde;
- reintentar con backoff/rate limit;
- clasificar intención/entidades;
- persistir evidencia shadow;
- producir sugerencias;
- responder automáticamente **solo en LAB** durante una ventana QA explícita.

Permanece deliberadamente bloqueado para:

- confirmar/crear apuestas reales desde evidencia ambigua;
- modificar saldos por inferencia del chat;
- escribir ledger a partir de un feed externo;
- aplicar cierres/resultados/liquidaciones/premios sin confirmación canónica;
- enviar al grupo fuente.

`actions: []`, `sourceSendPossible=false`, `financialAuthority=false` y `effectsAllowed=false` son invariantes de este release candidate para superficies no canónicas/externas.

## Backend y migraciones

Las migraciones v1.13 se prueban y autorizan por separado. Seguir `HIPICO_V13_MIGRATION_RUNBOOK.md` para:

- backup/PITR;
- dry run;
- doble ejecución/idempotencia;
- usuario A/B para RLS;
- grants/RPC `SECURITY INVOKER`;
- rollback.

No aplicar una migración productiva como efecto lateral de build/deploy.

## Gate canónico local · Issue #103

Desde la raíz del repositorio, el único comando canónico para la suite automatizable de Control Hípico es:

```bash
npm run qa:hipico -- --mode=full
```

Para exigir compilación APK cuando JDK + Android SDK estén disponibles:

```bash
HIPICO_QA_ANDROID=build npm run qa:hipico -- --mode=full
```

En Windows/PowerShell:

```powershell
$env:HIPICO_QA_ANDROID='build'
npm run qa:hipico -- --mode=full
```

El runner #103:

- captura SHA, branch y dirty state sin reset/clean/stash;
- ejecuta backend + contratos PWA/API + Bridge + audit + paridad Android;
- diferencia `PASS`, `FAIL`, `BLOCKED`, `NOT_EXECUTED`;
- redacciona tokens, teléfonos e IDs completos de grupos;
- escribe Markdown + JSON + SHA256SUMS por candidate SHA.

Evidencia:

```text
artifacts/qa/hipico-v103/<candidate-sha>/<run-id>/qa-report.md
artifacts/qa/hipico-v103/<candidate-sha>/<run-id>/qa-report.json
artifacts/qa/hipico-v103/<candidate-sha>/<run-id>/SHA256SUMS.txt
```

Ver `docs/hipico/QA-RUNNER.md` para modos, exit codes y límites.

`QA-PRODUCCION.ps1` / `qa:production:full` siguen perteneciendo al readiness general de ContaGest y **no sustituyen** el gate de producto Hípico.

## QA físico Android obligatorio

Instalar el APK debug y comprobar:

1. arranque frío y reanudación;
2. navegación/back button;
3. teclado y campos;
4. orientación/safe areas;
5. offline/reconexión;
6. service worker/PWA parity;
7. Supabase autenticado;
8. recuperación y persistencia;
9. exportaciones/archivos;
10. feed WhatsApp shadow.

Build APK `PASS` no equivale a instalación física `PASS`.

## Firma release

Después de pasar QA debug se puede preparar `bundleRelease`/`assembleRelease`. El keystore y contraseñas deben vivir fuera de Git (secrets del pipeline o custodia del propietario). Nunca reutilizar una clave debug como firma productiva.

## Rollback

Código/PWA/Android se revierten al SHA anterior conservando los datos. El Bridge se detiene y vuelve a la release anterior sin borrar perfil/colas. Migraciones que ya contengan datos requieren rollback/PITR específico; nunca se borran tablas como parte de un rollback visual.

## Criterio de salida

`PRODUCTION READY` requiere evidencia del SHA final, QA PWA/browser, APK físico, binding/soak del Bridge, RLS staged, backup/restore y firma/release autorizados. Los providers/Cloud opcionales no convierten una build en productiva. Hasta que todas las barreras aplicables tengan evidencia exacta, la denominación correcta es **RELEASE CANDIDATE / PENDING EXACT-SHA REVERIFY**.
