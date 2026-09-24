# Control Hípico · WhatsApp Web Bridge v1.5.0

Bridge de Control Hípico para observar y responder en el grupo oficial mediante WhatsApp Web. Por defecto continúa en solo lectura; cuando `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true`, únicamente entrega respuestas previamente autorizadas por el backend, sin conceder autoridad sobre dinero, jugadas, resultados, cierres, saldos ni otras mutaciones de dominio.

```text
CLUB HIPICO TRIPLE COWN/CROWN (fuente oficial)
        ↓
WhatsApp Web + Playwright
        ↓
spool durable local
        ↓
/api/v1/hipico-bot/bridge/events
        ↓
clasificación + Risk Policy + árbitro de respuesta
        ↓
comando source_reply persistido + journal local
        ↓
respuesta autónoma segura al mismo grupo
        └── LAB opcional durante QA
```

## Invariantes de seguridad

- El grupo oficial sólo puede ser destino de respuestas conversacionales cuando `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true` en backend y Bridge, el `@g.us` está pinneado, preflight está verde y el kill switch está inactivo.
- Backend mantiene `actions: []`: responder no concede autoridad de escritura de dominio.
- Jugadas, saldos, pagos, cierres, resultados, premios y liquidaciones no se aplican automáticamente.
- LAB send e input están deshabilitados por defecto.
- Producción exige backend HTTPS, token de 32+ caracteres, journal shadow y pinning de grupos.
- Los IDs reales de grupos y el token no se versionan.
- Si backend falla, el evento queda en spool para reintento; no se marca como entregado antes de persistir.
- Documentos/PDF, imágenes, audio y video no ejecutan acciones. El bot solicita primero que el dato relevante sea escrito en texto; la intervención humana aparece sólo tras agotar las aclaraciones automáticas.
- OCR/extracción automática de PDF no se habilita hasta disponer de una fuente y contrato verificables, fixtures y revisión explícita del operador.

## Binding de grupos v1.5.0

Los nombres visibles sirven solamente para descubrir chats. Antes de habilitar cualquier automatización LAB se deben capturar los IDs estables `@g.us` de fuente y laboratorio.

En Windows:

```powershell
.\INICIAR.ps1 -CaptureGroupIds
```

El asistente abre el perfil dedicado, no envía mensajes y guarda localmente:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.json
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.env
```

El archivo no se copia a Git. Fuente y LAB deben resolver a IDs válidos y distintos. `HIPICO_REQUIRE_PINNED_GROUP_IDS=true` es obligatorio en `production`.

## Modos Windows

### Observación segura

Doble clic en `INICIAR-CONTROL-HIPICO-WHATSAPP.cmd` o:

```powershell
.\INICIAR.ps1
```

El launcher:

1. instala una copia runtime bajo `%LOCALAPPDATA%\ControlHipicoBridge\runtime-v1.5.0`;
2. preserva perfil y colas bajo `data/`;
3. exige Node 22, que es la versión declarada por este paquete;
4. ejecuta `npm ci`, sintaxis y tests del Bridge;
5. prueba Chrome/Edge;
6. valida backend/token/persistencia;
7. abre WhatsApp Web y observa la fuente; si auto-reply está habilitado y el backend confirma `sourceSendPossible=true`, entrega únicamente comandos `source_reply` autorizados.

### Respuesta autónoma SOURCE

Después de capturar los IDs y configurar el mismo switch en el backend autorizado, puede iniciarse desde la raíz con:

```text
INICIAR-HIPICO-AUTONOMO.cmd
```

o directamente:

```powershell
.\INICIAR.ps1 -EnableSourceAutoReply
```

El preflight se niega a iniciar si backend y Bridge no coinciden, falta el `@g.us` pinneado, el schema durable no está listo o el kill switch está activo. El modo estándar `INICIAR-HIPICO-WHATSAPP.cmd` continúa en solo lectura.

### QA LAB explícito

Primero ejecuta el binding. Después, únicamente dentro de una ventana QA:

```powershell
.\INICIAR.ps1 -EnableLabSend -EnableLabInput
```

Al terminar vuelve al modo normal sin flags. El kill switch local `.hipico-kill-switch` bloquea también el auto-reply SOURCE aunque la variable de entorno permanezca activada.

## Comandos de operación y soporte

Desde PowerShell, CMD o una terminal ubicada en `tools/hipico-whatsapp-web-bridge`:

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

`production:check` debe ejecutarse antes de operación sostenida. `spool:replay` reintenta trabajo persistido y no debe usarse para fabricar eventos nuevos ni saltar idempotencia. `support:bundle` y los reportes deben permanecer sin tokens ni texto completo de chats salvo una habilitación de diagnóstico explícita.

## Persistencia

Datos sensibles/mutables viven fuera del código:

- `chrome-profile/`: sesión vinculada;
- `spool-v2/`: journal durable actual con estados y reintentos;
- `spool-events/`: compatibilidad de eventos pendientes antiguos;
- `spool-lab-mirror/`: mirrors LAB pendientes;
- `source-replies/`: journal durable de respuestas al SOURCE (`prepared`, `sending`, `sent`, `ambiguous`);
- `seen-source-message-ids.json`: deduplicación fuente;
- `seen-lab-test-message-ids.json`: deduplicación LAB QA;
- `training/`: journal shadow pseudonimizado;
- `health.json`: readiness/counters;
- `retry-state.json`: backoff de backend.

No borrar `data/` durante una actualización o rollback.

## Hosted worker

Existen dos opciones preparadas:

- `deploy/linux/`: `systemd`, health timer, usuario no-root y filesystem endurecido.
- `deploy/docker/`: imagen Node 22 + Chrome, usuario 10001, root filesystem read-only, capabilities vacías, límites de CPU/RAM/PIDs y volumen persistente.

El perfil de Windows no se copia ciegamente a un servidor. Cada host debe tener una vinculación controlada y un backup cifrado del estado.

## Health / observabilidad

`health.json` publica sin secretos:

- versión y timestamp;
- backend online/degraded;
- grupo fuente activo por título;
- `sourceSendPossible`: `true` únicamente si backend y Bridge coinciden en modo seguro, el schema durable está listo y no hay kill switch;
- counters de capturados/entregados/mirrors;
- spool/dead letters;
- readiness y razones de degradación.

Comandos mínimos:

```bash
npm run healthcheck
npm run report
```

Logs y reportes no imprimen texto de chats por defecto. Screenshots de diagnóstico están apagados salvo habilitación explícita.

## QA local

```bash
npm ci --no-audit --no-fund
npm run qa
npm audit --omit=dev --audit-level=high
npm run selftest
```

`npm run capture:groups` ejecuta el asistente de binding. `npm run production:check` valida el backend antes de iniciar operación sostenida.

## Android / PWA

El Bridge es independiente del wrapper Android. La PWA canónica de Control Hípico está en `frontend/public/hipico-control`; el wrapper `android/hipico-control-v1130` sincroniza esa misma fuente y verifica hashes antes de compilar.

## Riesgo residual

WhatsApp Web automatizado no es la API oficial de grupos. Cambios del DOM, cierre de sesión o políticas del proveedor pueden requerir revinculación/adaptación. Por eso el sistema conserva spool, health, kill switch, pinning exacto y un journal que convierte un crash durante el envío en estado `ambiguous` en vez de reenviar a ciegas.

La promoción a acciones reales nunca se decide por “el bot parece funcionar”: requiere corpus medido, revisión humana, pruebas negativas y gates separados por tipo de operación. Si la política/canal autorizado no permite una acción, el sistema permanece en `SHADOW`, `ASSISTED` o envío manual en vez de intentar evadir restricciones del proveedor.
