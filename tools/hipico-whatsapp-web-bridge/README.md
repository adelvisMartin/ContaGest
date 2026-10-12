# Control Hípico · WhatsApp Web Bridge v1.6.0

Bridge de Control Hípico para observar el grupo oficial mediante WhatsApp Web y ejecutar automatización conversacional segura en LAB.

```text
SOURCE real (read-only)
  -> WhatsApp Web + Playwright adapter
  -> spool durable / dedupe / anti-loop
  -> backend Hípico
  -> clasificación + Risk Policy + response arbiter
  -> propuesta/auditoría
  -> LAB (auto-reply QA autorizado)
```

## Estado de política SOURCE

La Política de mensajes de WhatsApp Business revisada el **2026-09-29** incluye apuestas con dinero real entre los usos prohibidos de los Servicios de WhatsApp Business. El Bridge por tanto mantiene SOURCE automático en **NO-GO**.

- `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true` falla validación.
- `.env`, licencia, país o metadata de revisión no levantan el gate.
- `npm run source:policy` explica el estado sin imprimir secretos.
- LAB continúa disponible para pruebas autónomas seguras.

Referencia de política: `https://business.whatsapp.com/policy/`.

## Transport capability contract

v1.6 desacopla la capacidad técnica del permiso de negocio mediante `src/transport-capabilities.mjs`.

### `playwright-web`

- `implemented=true`
- `official=false`
- `sourceRead=true`
- `labSend=true`
- `groupSend=true` técnicamente
- media soportada como contexto

Es el adapter actual. La capacidad técnica de enviar **no** autoriza SOURCE.

### `cloud-api`

- `official=true`
- `implemented=false`

Está registrado únicamente como boundary futuro. Seleccionarlo hoy falla validación para evitar una falsa sensación de soporte. Aun implementándolo, el gate de apuestas con dinero real seguirá bloqueando este caso mientras la política oficial no cambie.

## Invariantes de seguridad

- SOURCE nunca recibe escritura automática mientras el snapshot de política sea NO-GO.
- LAB requiere SOURCE/LAB IDs `@g.us` pinneados y distintos.
- cambiar de chat antes de un envío cancela la acción por identity guard.
- mensajes propios (`message-out` / `fromMe`) se excluyen del ingest para evitar loops.
- backend/conversation reply no concede autoridad de escritura financiera.
- jugadas, saldos, pagos, cierres, resultados, premios y liquidaciones no se aplican automáticamente.
- producción exige backend HTTPS, token fuerte, journal shadow y pinning de grupos.
- si backend falla, el evento permanece en spool.
- una entrega incierta se marca `ambiguous`; no existe retry ciego.
- documentos/PDF/imágenes/audio/video no conceden autoridad financiera.
- kill switch local bloquea promoción/envío cuando corresponde.

## Binding de grupos

En Windows:

```powershell
.\INICIAR.ps1 -CaptureGroupIds
```

O desde la raíz:

```text
CONFIGURAR-GRUPOS-HIPICO.cmd
```

Se guardan localmente:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.json
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.env
```

Los nombres son sólo discovery hints; el envío LAB valida el ID real.

## Contexto conversacional seguro del LAB (#892)

El modo interactivo **LAB**, opcional y con grupos pinneados, aplica un filtro anti-eco antes de preparar un envío: ignora mensajes propios, adjuntos sin texto, tags [SHADOW:]/[LABTEST:] y charla casual no dirigida. Las consultas de carrera y sus seguimientos únicamente reutilizan una referencia **numérica de carrera**, nunca un saldo, apuesta, resultado ni hecho no verificado.

La pista se almacena por grupo y remitente reconocido durante **20 minutos**, con máximo **300 entradas**. Cada clave de participante se deriva con HMAC en un archivo local privado; no guarda nombres, números ni cuerpos de mensajes en texto claro. La memoria requiere un identificador estable de remitente (`@lid` o `@c.us`) presente de forma inequívoca en el identificador del mensaje; **no usa el nombre visible** (que puede repetirse entre participantes). Si WhatsApp no expone ese identificador, el bot conserva la respuesta segura sin reutilizar memoria. Identidades ausentes o ambiguas no heredan contexto. Un grupo diferente tampoco puede leer el mismo archivo. Las referencias de carrera se obtienen de mensajes explícitos, y una consulta sobre participantes/resultados remite a datos verificados, sin inventarlos.

**Secuencia relevante:** filtrar → leer confirmación del journal → plan LAB → prepare/sending durable → navegador LAB → confirm visible → ACK durable → seen → guardar pista. El archivo de memoria **no es autoridad de entrega ni autorización financiera**. Si su escritura falla, se registra el fallo sin intentar una segunda respuesta.

El motor conversacional backend y los datos canónicos siguen siendo la autoridad para consultas de carreras; esta mejora es el filtro/contexto local previo. La integración completa de dichos datos continúa como seguimiento del issue #892. SOURCE permanece read-only bajo el gate de política actual.

Pruebas de contrato: `npm --prefix tools/hipico-whatsapp-web-bridge run qa`. No equivale a QA de WhatsApp real, Windows ni soak prolongado.

## Consultas canónicas de carrera desde LAB (incremento #892)

El Bridge envía una consulta **de lectura** al backend Hípico existente solamente cuando: el grupo LAB está pinneado, el remitente dispone de identidad estable, el clasificador local la califica como segura, el backend está online y se dispone del token del Bridge. Usa el endpoint derivado de `HIPICO_INGEST_URL` de la misma autoridad:

```text
POST /api/v1/hipico-bot/bridge/lab/query
x-hipico-bridge-token: [secreto del servidor]
```

No necesita credenciales de operador, no expone el dominio financiero y no autoriza SOURCE. El endpoint valida el grupo LAB y la política del Conversation Engine antes de leer el estado desde el agregador de carreras bajo el dueño y grupo SOURCE configurados en el backend.

Ejemplo de consulta expresamente contextualizada:

> Estado de carrera 5 en hipódromo La Rinconada el 2026-10-12

Para consultar un estado se exige **número de carrera, hipódromo y fecha válida AAAA-MM-DD**. Preguntar solo «¿cómo va la carrera 5?» no identifica inequívocamente un agregado canónico: el bot solicita esos datos, sin deducir hipódromo ni fecha. La consulta de **estado** devuelve el estado interno validado. Una consulta de **resultado** devuelve únicamente la pizarra numérica de llegada si existe un evento `RESULT_RECORDED` aplicado y confirmado por operador, vinculado a la fecha/hipódromo/carrera exactos y sin una corrección o reversión posterior; nunca equivale a un resultado oficial externo. Una consulta de **participantes/ejemplares inscritos** reconoce que aún falta un catálogo canónico validado y no confunde nombres de personas de las liquidaciones con caballos. Ninguna consulta devuelve importes ni confirma jugadas.

Si el backend falla, rechaza el grupo, no dispone de propietario canónico, no reconoce el agregado o devuelve un cuerpo incompatible, el adaptador desactiva la respuesta canónica y responde con la guía local de falta de información. Nunca adjunta credenciales, errores raw o contenido de la API a mensajes/logs. Las consultas de riesgo monetario se quedan fuera de esta ruta. La secuencia de envío `prepare → sending → confirm → seen` no cambia.


**Quoted replies en LAB:** cuando un participante responde a **su propio mensaje anterior** y ese mensaje está visible en el grupo LAB con ID de remitente estable y el mismo ID de referencia citado, el Bridge puede reutilizar los datos explícitos de hipódromo/carrera/fecha de esa cita como *pista para una lectura*. No confía en el texto citado no verificable ni en una cita de otra persona, tampoco reutiliza el contexto de carrera diferente. Si el original ya no está visible, solicita los datos de nuevo; no inventa contexto. La decisión del backend sigue siendo de solo lectura y sin efectos.

**Evidencia pendiente:** tests de contrato y transporte local versionados; despliegue real y sesiones WhatsApp LAB requieren QA físico posterior. Aún no se considera completo #892: faltan el catálogo verificado de ejemplares y la conciliación persistente de threads/citas no visibles, además del E2E real.

## Resumen canónico de una carrera (incremento #892)

El Bridge interpreta **resumen de carrera** como una consulta `purpose=summary`
al endpoint existente `/bridge/lab/query`. La petición necesita un alcance
explícito de carrera, hipódromo y fecha, procedente del mensaje actual o de una
referencia citada que cumpla las restricciones de identidad; las referencias
de memoria contextual siguen siendo solo pistas y no prueban el dato.

La lectura backend utiliza **una sola versión del agregado** para construir:
- carrera/hipódromo/fecha solicitados y estado interno validado;
- llegada numérica **únicamente** si el evento `RESULT_RECORDED` está
  confirmado por operador, corresponde a esa carrera y no hay corrección/reversión
  posterior que invalide su publicación;
- aviso explícito de falta de resultado cuando no existe evidencia suficiente;
- recordatorio de que el registro interno **no certifica oficialidad externa**.

No expone nombres, terceros, importes, apuestas, saldos, eventos originales,
porcentajes, datos del chat, resúmenes de conversaciones ni acciones de terceros.
`resumen de jugadas/saldo` se rechaza. La política SOURCE y los journals de
entrega LAB no cambian. `CANONICAL_RACE_SUMMARY` es solo una proyección
informativa; no es un permiso nuevo para responder con IA generativa ni un
estado monetario.

Caso de QA LAB:

```text
Dame un resumen de la carrera 5 en hipódromo La Rinconada el 2026-10-12
hazme un resumen de lo que hablamos
resumen de saldo de carrera 5 en hipódromo La Rinconada el 2026-10-12
```

El primero responde únicamente con datos presentes y validados, o indica
que el agregado no existe. Los demás **no** deben obtener un resumen
canónico de carreras. Repetir con datos inexistentes, evento corregido,
otro grupo, otro remitente, backend desconectado y reconexión. No interpretar
los tests unitarios como prueba física de Windows/WhatsApp.

## Prueba autónoma LAB

Desde la raíz:

```text
PROBAR-HIPICO-LAB.cmd
```

O:

```text
INICIAR-HIPICO-AUTONOMO.cmd
```

Directamente desde el bridge:

```powershell
.\INICIAR.ps1 -EnableLabSend -EnableLabInput
```

Antes de comenzar puedes comprobar capacidades/política:

```powershell
npm run source:policy
```

## Comandos

```text
npm ci --no-audit --no-fund
npm run qa
npm run production:check
npm run source:policy
npm run capture:groups
npm start
npm run healthcheck
npm run diagnostic:status
npm run spool:replay
npm run report
npm run support:bundle
```

`spool:replay` reintenta únicamente trabajo permitido por la política de replay/idempotencia; no fabrica eventos ni convierte `ambiguous` en un envío seguro.

## Persistencia durable

Bajo el data directory local:

- `chrome-profile/`: sesión vinculada;
- `spool-v2/`: journal durable;
- `spool-events/`: compatibilidad de pendientes;
- `spool-lab-mirror/`: mirrors LAB;
- `source-replies/`: estados `prepared`, `sending`, `sent`, `ambiguous`;
- `seen-source-message-ids.json`: dedupe SOURCE;
- `seen-lab-test-message-ids.json`: dedupe LAB;
- `training/`: journal shadow pseudonimizado;
- `health.json`: readiness/counters;
- `retry-state.json`: backoff backend.

No borrar `data/` durante update/rollback.

## Observabilidad

`health.json` y `npm run diagnostic:status` exponen estado operativo sin token ni texto completo del chat. v1.6 añade:

- adapter actual;
- capacidades técnicas relevantes;
- estado `DISABLED/NO_GO` de SOURCE;
- snapshot y reasons de política;
- disponibilidad técnica LAB.

Para SOURCE el resultado esperado es `sourceSendPossible=false`.

## Recuperación

El launcher supervisa cierres inesperados del browser y reinicia con backoff limitado conservando spool/journals. Un perfil dañado se aísla, no se destruyen las colas.

## Hosted worker

Existen plantillas bajo `deploy/linux/` y `deploy/docker/`. Cada host necesita una sesión vinculada propia, almacenamiento persistente y secretos externos al repo. No copiar una sesión de laptop ciegamente a otro host.

## QA local

```bash
npm ci --no-audit --no-fund
npm run qa
npm audit --omit=dev --audit-level=high
npm run selftest
npm run source:policy
```

Runbook completo: `docs/hipico/QA_DOWNLOAD_AND_BOT_TEST.md`.

Revisión técnica/mercado: `docs/hipico/WHATSAPP_READINESS_2026-09-29.md`.

## Riesgo residual

El adapter Playwright automatiza WhatsApp Web y no es una API oficial. Cambios DOM, cierre de sesión o cambios de proveedor pueden requerir adaptación/revinculación. Por eso se mantienen spool, health, identity guard, anti-loop, journal ambiguo y physical QA.

No se adopta Baileys/WebSocket como cambio de último minuto: sigue siendo una integración no oficial y migrar transportes antes de una jornada física añade riesgo sin resolver la política SOURCE.
