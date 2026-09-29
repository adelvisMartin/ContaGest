# Control Hípico · WhatsApp Web Bridge v1.5.0

Bridge de Control Hípico para observar el grupo oficial mediante WhatsApp Web y ejecutar automatización conversacional segura en LAB. El SOURCE real permanece **solo lectura** mientras el gate de política/compliance esté `NO-GO` para este flujo de apuestas con dinero real.

```text
CLUB HIPICO TRIPLE COWN/CROWN (SOURCE, read-only)
        ↓
WhatsApp Web + Playwright
        ↓
spool durable local
        ↓
/api/v1/hipico-bot/bridge/events
        ↓
clasificación + Risk Policy + árbitro de respuesta
        ├── propuesta/auditoría
        └── Control hípico lab (auto-reply QA autorizado)
```

## Invariantes de seguridad

- SOURCE no recibe mensajes automáticos del Bridge mientras `SOURCE_AUTO_REPLY_POLICY_NO_GO` esté vigente.
- `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true` falla validación; un booleano local no puede levantar el gate de plataforma.
- Backend mantiene `actions: []` para respuestas conversacionales: responder no concede autoridad de escritura de dominio.
- Jugadas, saldos, pagos, cierres, resultados, premios y liquidaciones no se aplican automáticamente.
- LAB send/input están deshabilitados por defecto y requieren IDs pinneados diferentes del SOURCE.
- Producción de ingest exige backend HTTPS, token de 32+ caracteres, journal shadow y pinning de grupos.
- Los IDs reales de grupos y el token no se versionan.
- Si backend falla, el evento queda en spool para reintento; no se marca como entregado antes de persistir.
- Mensajes propios (`message-out`) se detectan y excluyen del ingest para evitar loops.
- Documentos/PDF, imágenes, audio y video no ejecutan acciones financieras por sí solos.

## Binding de grupos

Los nombres visibles sirven sólo como discovery hints. Para QA LAB se capturan los IDs estables `@g.us` de SOURCE y laboratorio.

En Windows:

```powershell
.\INICIAR.ps1 -CaptureGroupIds
```

O desde la raíz:

```text
CONFIGURAR-GRUPOS-HIPICO.cmd
```

El asistente abre el perfil dedicado, no envía mensajes y guarda localmente:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.json
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.env
```

SOURCE y LAB deben resolver a IDs válidos y distintos. `HIPICO_REQUIRE_PINNED_GROUP_IDS=true` es obligatorio en `production`.

## Modos Windows

### Observación segura

Doble clic en `INICIAR-CONTROL-HIPICO-WHATSAPP.cmd` o:

```powershell
.\INICIAR.ps1
```

El launcher:

1. instala una copia runtime bajo `%LOCALAPPDATA%\ControlHipicoBridge\runtime-v1.5.0`;
2. preserva perfil y colas bajo `data/`;
3. exige Node 22;
4. ejecuta `npm ci`, sintaxis y tests del Bridge;
5. prueba Chrome/Edge;
6. valida backend/token/persistencia;
7. abre WhatsApp Web y observa SOURCE sin escribir en él.

### Autonomía segura LAB

Después de capturar IDs:

```text
PROBAR-HIPICO-LAB.cmd
```

o:

```text
INICIAR-HIPICO-AUTONOMO.cmd
```

Ambos caminos mantienen SOURCE solo lectura y habilitan el flujo de QA LAB. Directamente desde el bridge:

```powershell
.\INICIAR.ps1 -EnableLabSend -EnableLabInput
```

Antes de cada envío se valida la identidad del LAB. Cambiar de chat debe cancelar la acción.

### SOURCE auto reply

El código conserva journal/receipt primitives históricas para reconciliación y futura evolución, pero el runtime **no permite** activar escritura SOURCE hoy. `-EnableSourceAutoReply`/`HIPICO_SOURCE_AUTO_REPLY_ENABLED=true` termina en preflight inválido con `SOURCE_AUTO_REPLY_POLICY_NO_GO`.

Habilitarlo en el futuro requiere un PR específico que actualice evidencia oficial de plataforma/compliance a GO; no se habilita editando `.env`.

## Comandos de operación y soporte

Desde `tools/hipico-whatsapp-web-bridge`:

```text
npm ci --no-audit --no-fund
npm run qa
npm run production:check
npm run capture:groups
npm start
npm run healthcheck
npm run diagnostic:status
npm run spool:replay
npm run report
npm run support:bundle
```

`spool:replay` reintenta trabajo persistido y no fabrica eventos nuevos ni salta idempotencia. Reports/support bundles deben permanecer sin tokens ni texto completo de chats salvo diagnóstico explícito.

## Persistencia y delivery safety

Datos sensibles/mutables viven fuera del código:

- `chrome-profile/`: sesión vinculada;
- `spool-v2/`: journal durable actual;
- `spool-events/`: compatibilidad de eventos pendientes;
- `spool-lab-mirror/`: mirrors LAB pendientes;
- `source-replies/`: journal de respuestas con estados `prepared`, `sending`, `sent`, `ambiguous`;
- `seen-source-message-ids.json`: deduplicación SOURCE;
- `seen-lab-test-message-ids.json`: deduplicación LAB;
- `training/`: journal shadow pseudonimizado;
- `health.json`: readiness/counters;
- `retry-state.json`: backoff backend.

Un crash durante `sending` se recupera como `ambiguous`, no como retry ciego. Sólo errores explícitamente `safeToRetry` vuelven a `prepared`. No borrar `data/` durante update/rollback.

## Hosted worker

Existen opciones preparadas bajo:

- `deploy/linux/`: systemd/health/non-root;
- `deploy/docker/`: Node 22 + Chrome, usuario no-root, filesystem endurecido y volumen persistente.

Cada host necesita vinculación controlada propia. Una sesión de laptop no se copia ciegamente a otro host.

## Health / observabilidad

`health.json` publica sin secretos:

- versión y timestamp;
- backend online/degraded;
- grupo SOURCE activo;
- capacidad de envío efectiva;
- counters de capturados/mirrors;
- spool/dead letters;
- readiness y razones de degradación.

En el estado actual de compliance, el resultado esperado para SOURCE es:

```text
sourceSendPossible = false
```

Logs y reportes no imprimen texto completo de chats por defecto. Screenshots de diagnóstico permanecen apagados salvo habilitación explícita.

## QA local

```bash
npm ci --no-audit --no-fund
npm run qa
npm audit --omit=dev --audit-level=high
npm run selftest
```

El procedimiento de jornada está en `docs/hipico/QA_DOWNLOAD_AND_BOT_TEST.md`. El análisis de capacidad/mercado está en `docs/hipico/WHATSAPP_READINESS_2026-09-29.md`.

## Android / PWA

El Bridge es independiente del wrapper Android. La PWA canónica está en `frontend/public/hipico-control`; cualquier APK/PWA comparado debe venir del mismo SHA.

## Riesgo residual

WhatsApp Web automatizado no es una API oficial de grupos. Cambios DOM, cierre de sesión o políticas del proveedor pueden requerir revinculación/adaptación. Por eso se mantienen spool, health, kill switch, pinning exacto, anti-loop y journal de entrega ambigua.

La promoción a acciones reales nunca se decide porque “el bot parece funcionar”. Requiere corpus medido, physical QA, soak, seguridad, gates de dominio y —para SOURCE writing— autorización de plataforma. Si el canal/política no permite una acción, el sistema permanece read-only/LAB/assisted en vez de intentar evadir restricciones.
