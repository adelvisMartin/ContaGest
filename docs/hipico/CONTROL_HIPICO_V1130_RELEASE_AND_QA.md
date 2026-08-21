# Control Hípico v1.13.0 RC2 · release y QA

**Producto:** Control Hípico  
**Runtime/PWA canónico:** `frontend/public/hipico-control`  
**Wrapper Android:** `android/hipico-control-v1130`  
**Versión app:** `1.13.0-rc2`  
**Bridge WhatsApp Web:** `1.4.1`  
**Estado de código:** `RELEASE CANDIDATE / READY FOR MANUAL QA`

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
artifacts/Hipico-Control-v1.13.0-rc2-debug.apk
artifacts/SHA256SUMS.txt
artifacts/QA_APK_METADATA.json
artifacts/APK_BADGING.txt   # cuando aapt está disponible
```

`package-qa-apk.mjs` copia el APK debug construido, calcula SHA-256 y, cuando Android SDK está disponible, verifica la firma debug con `apksigner` y extrae badging con `aapt`.

No se versionan APK, keystores, `key.properties`, `local.properties` ni secretos de firma.

## Bridge WhatsApp Web v1.4.1

El grupo existente requiere temporalmente automatización de WhatsApp Web. El flujo protegido es:

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

- confirmar/crear apuestas reales;
- modificar saldos;
- escribir ledger;
- aplicar cierres/resultados/liquidaciones/premios;
- enviar al grupo fuente.

`actions: []` y `sourceSendPossible=false` son invariantes de este release candidate.

## Backend y migraciones

Las migraciones v1.13 se prueban y autorizan por separado. Seguir `HIPICO_V13_MIGRATION_RUNBOOK.md` para:

- backup/PITR;
- dry run;
- doble ejecución/idempotencia;
- usuario A/B para RLS;
- grants/RPC `SECURITY INVOKER`;
- rollback.

No aplicar una migración productiva como efecto lateral de build/deploy.

## Gate unificado local

Desde la raíz del repositorio en Windows:

```powershell
.\QA-PRODUCCION.ps1
```

O:

```bash
npm ci --no-audit --no-fund
npm run qa:production:full
```

El reporte queda en:

```text
artifacts/qa/production-readiness.md
artifacts/qa/production-readiness.json
```

Los resultados distinguen `PASS`, `FAIL`, `BLOCKED` y `NOT_EXECUTED`; un build o preview no reemplaza QA físico.

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

## Firma release

Después de pasar QA debug se puede preparar `bundleRelease`/`assembleRelease`. El keystore y contraseñas deben vivir fuera de Git (secrets del pipeline o custodia del propietario). Nunca reutilizar una clave debug como firma productiva.

## Rollback

Código/PWA/Android se revierten al SHA anterior conservando los datos. El Bridge se detiene y vuelve a la release anterior sin borrar perfil/colas. Migraciones que ya contengan datos requieren rollback/PITR específico; nunca se borran tablas como parte de un rollback visual.

## Criterio de salida

`PRODUCTION READY` requiere evidencia del SHA final, QA PWA/browser, APK físico, binding/soak del Bridge, RLS staged, backup/restore y firma/release autorizados. Hasta entonces, la denominación correcta es **RELEASE CANDIDATE / READY FOR MANUAL QA**.
