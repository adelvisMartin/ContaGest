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


## Selección inequívoca de reunión en consultas LAB (#892)

Cuando Control Hípico tenga varias reuniones, el bot puede consultar **una específica** si la pregunta incluye una fecha de reunión válida y, si es necesario para desambiguar, el hipódromo registrado:

```text
¿Qué carrera sigue en la reunión del 2026-10-12?
¿Cuál es la próxima carrera en la reunión del 2026-10-12 en La Rinconada?
¿Cuál es la cartelera de la reunión del 2026-10-12 en el hipódromo La Rinconada?
```

La fecha debe ser `AAAA-MM-DD` real, no un día inexistente. El backend **extrae el selector del texto evaluado**, nunca de `ownerId`, `groupKey`, `meetingId` ni cabeceras proporcionadas por el participante. El repositorio PostgreSQL aplica simultáneamente propietario, grupo oficial, fecha y, cuando procede, hipódromo; consulta como máximo **dos coincidencias** para demostrar unicidad sin depender de cuántas reuniones históricas existan.

Si la fecha no corresponde a ninguna reunión, o existen dos reuniones que coinciden incluso con el hipódromo, se solicita aclaración sin leer carreras. Una expresión explícita inválida tampoco vuelve a la última reunión. Sin selector explícito se conserva la política anterior: solo se responde si existe una única reunión en el ámbito autorizado. Ninguna respuesta afirma resultados externos, revela datos de clientes/apuestas ni habilita envíos a SOURCE.

Esta es una mejora de código y pruebas; la verificación operacional con múltiples reuniones reales y WhatsApp LAB sigue pendiente.

## Referencias citadas LAB fuera del historial visible (#892)

El Bridge puede conservar una **pista no autoritativa** para preguntas citadas del mismo participante aunque el mensaje original haya salido de la ventana de WhatsApp Web o el proceso se haya reiniciado. El journal privado `HIPICO_DATA_DIR/lab-quoted-races-<hash>.json` está vinculado a IDs SOURCE y LAB pinneados y guarda un máximo de **300** referencias durante **20 minutos**.

Cada referencia usa una clave HMAC derivada del ID de mensaje y la identidad estable del remitente `@lid` / `@c.us`, junto a **número de carrera, hipódromo y fecha válidos**. No conserva mensaje original, JID de participante, cuerpo del chat, token, datos de sesión, saldos o apuestas. Directorio privado y fichero 0600.

La pista solo se escribe si se ha confirmado de forma durable el envío LAB correspondiente. Ante reinicio después del ACK durable pero antes del guardado auxiliar, se puede reconstruir la pista mientras el original vuelva a estar visible. Ante corrupción del fichero o cambio de grupos, la inicialización falla cerrada, sin reconstruirlo a ciegas.

Para responder una cita se exige remitente estable coincidente, IDs del mismo LAB, mensaje citado distinto del mensaje actual, TTL vigente y ausencia de conflicto con la carrera escrita en la nueva pregunta. La respuesta siempre requiere la consulta canónica del backend: el journal **no constituye evidencia de participantes, resultados ni oficialidad**. Si la referencia expira o no puede validarse, el bot solicita número, hipódromo y fecha de nuevo.

Esto no habilita SOURCE write, no sustituye la política del Conversation Engine y no equivale a QA real con WhatsApp.
## Consultas de programación hípica segura desde LAB (consolidación #898)

El mismo endpoint autenticado `POST /api/v1/hipico-bot/bridge/lab/query` también interpreta preguntas no monetarias como «¿Qué carrera sigue?», «¿Cuál es la carrera activa?» y «¿Cuál es la cartelera?». **No se habilita el PR anterior de ingestión LAB ni se crea una segunda autoridad conversacional.** Se reutiliza `RaceQueryService` con `RaceLifecycleStore` para lecturas bajo `ownerId` y grupo SOURCE configurados únicamente por el backend.

Para no cruzar reuniones, el backend exige **exactamente una reunión** en el alcance de lectura; si hay dos o más, solicita precisar la reunión. Para próxima carrera, el horario debe estar registrado y ser futuro; para carrera activa, muestra solo el estado **interno** registrado y no lo presenta como ejecución física en tiempo real. Para programación, entrega como máximo diez filas futuras ordenadas y con estados permitidos. Los JSON de carrera, cuotas, importes y datos de participantes de liquidaciones nunca forman parte de esta proyección.

Las consultas con resultado/llegada, participantes y carrera explícita conservan los controles de #900/#904. El token Bridge no concede privilegios de operador; las consultas monetarias o que sugieren cambiar carreras continúan en `REVIEW_REQUIRED`. La respuesta sigue pasando por `labTestReplyJournal` antes de enviarse únicamente a LAB.

**Límites y gates:** aun cuando el endpoint responda, no se afirma oficialidad externa ni se valida una reunión en producción. Falta habilitar selección explícita de reuniones cuando haya varias, confirmar fuente autorizada de caballos inscritos, completar #899 para planes dinámicos, y ejecutar QA Windows/WhatsApp, soak, respaldo y gates finales. Los tests de esta fase son unitarios y de contrato, no QA físico.

## Handoff de operador y silencio automático en LAB (#892)

### Integridad de registros de handoff

Antes de permitir una respuesta LAB, el backend no solo verifica si la
conversación está marcada como `bot`: compara el estado recuperado con
**la clave de conversación derivada** y con grupo, remitente estable y
ámbito global/carrera de la consulta. Una fila de BD inconsistente,
una clave de otro participante o un estado de titularidad desconocido
se trata como `LAB_HANDOFF_HELD` (bloqueo), nunca como permiso.
Ambos canales deben existir y ser diferentes **sin distinguir
mayúsculas/minúsculas**, porque el identificador canónico del handoff
normaliza el grupo. Una pausa humana vencida se libera mediante la
política ya existente sin escribir ni modificar la fila en esta ruta.

Pruebas unitarias: falsificación de `conversationKey`, cruce de grupo,
remitente o carrera, `clarificationCount` inválido, ownership no
reconocido y variaciones de mayúsculas; contrastar contra la consulta
válida y contra la expiración natural. El operador debe comprobar
también la pausa global cuando la referencia de carrera sea incompleta.



El backend ya dispone de la autoridad de operador `/bridge/handoff` y
persistencia `HipicoConversationHandoff`. Este incremento **no crea una
segunda autoridad**: el Bridge LAB verifica ese estado mediante
`POST /bridge/lab/eligibility` usando su mismo token y el grupo LAB
pinneado. La consulta es estrictamente de solo lectura; el operador
controla la pausa/reanudación mediante la ruta autenticada existente.

Para cada mensaje LAB candidato, se comprueba la titularidad **antes
y después** de la lectura canónica y **una tercera vez tras marcar el
journal como «en envío», inmediatamente antes de tocar el compositor**
de WhatsApp. Si el operador toma la conversación en esta última ventana,
el intento se devuelve duraderamente a «preparado» sin pulsar Enter,
sin marcar la entrega como confirmada y sin guardar memoria.
Se revisa la titularidad general del participante en
`HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY` y en el canal LAB configurado; cuando
hay una referencia completa de carrera, también se comprueba su ámbito
específico. No se acepta que el remitente seleccione dueño de datos,
grupo arbitrario, operador o credenciales.

Cuando la autoridad indica `LAB_HANDOFF_HELD`, se marca el mensaje
como atendido/suprimido **sin enviar respuesta** ni preparar un nuevo
journal, para impedir una respuesta atrasada tras reanudar al bot.
Si el backend está desconectado, la ruta no existe, la base de datos
falla o la respuesta no tiene autoridad explícita, el Bridge **no envía
nada** y mantiene el mensaje pendiente de revisión en una nueva
comprobación. Esto también significa que el LAB conversacional autónomo
requiere backend accesible: no hay fallback de envío offline inseguro.

La ruta `/bridge/lab/query` conserva un segundo control de handoff:
antes y después de consultas canónicas; no emite datos de un operador.
No existe autorización para escritura automática en SOURCE, ni un
transporte alternativo. Una pausa por carrera se limita a esa referencia;
para silenciar todo el participante utilizar una **pausa global**
(`raceId: null`) y el identificador normalizado de remitente usado por
el backend. No usar nombres visibles de WhatsApp como identidad.

**Prueba LAB para hoy:** activar `LAB` y registrar una pausa global
autenticada desde la interfaz/flujo de operador; enviar una pregunta
desde ese participante, verificar que **no hay mensaje saliente**.
Repetir con otro participante (sin contaminación), reiniciar el Bridge,
repetir pausa/reanudación y comprobar que el mensaje suprimido no se
reproduce. Repetir con corte de backend, con lectura canónica demorada
y con una carrera específica. `npm run qa` incluye los tests
`lab-handoff-eligibility.test.mjs`; los de backend cubren el gate
`hipico-lab-handoff-gate.test.ts`.

**Límite de carrera:** existe una ventana inevitable entre la última
comprobación remota y el envío de WhatsApp; cerrar esa ventana por
completo requeriría un protocolo transaccional de permisos de envío.
Las tres comprobaciones reducen esa ventana, pero no constituyen una
garantía atómica de tiempo real. Es imprescindible probar el caso de takeover
concurrente antes de una promoción a producción.

## Asistente conversacional LAB · respuesta natural y memoria acotada

El LAB deja de imprimir diagnósticos tipo `Lectura/riesgo/propuesta` en las respuestas
interactivas: ahora utiliza `lab-assistant-replies.mjs` para contestar de forma breve,
cordial y transparente como **asistente virtual**. Conserva el marcador visible
`[LABTEST:...]` necesario para confirmar entregas e impedir duplicados; solo aplica
a LAB, no a SOURCE.

Personalización opcional en `.env`:

```dotenv
HIPICO_LAB_ASSISTANT_NAME=Asistente Hípico
```

El nombre admite letras, números, espacios, puntos, guiones y guion bajo, hasta
32 caracteres; cualquier valor inválido se sustituye por el nombre predeterminado.
No permite alterar instrucciones ni permisos.

**Skills disponibles de este incremento:** saludo y ayuda, aclaración de referencia,
consulta de **estado y resultado interno confirmado** a través del backend, seguimiento de
referencia por remitente y resumen breve de esa referencia. Son respuestas
deterministas: **no hay un LLM generativo activado por este cambio**, ni búsqueda
externa, ni ejecución de operaciones monetarias. El Agent/Shadow y sus métricas
continúan en su autoridad existente.

El contexto LAB recuerda exclusivamente carrera, hipódromo y fecha *aportados
explícitamente* por ese remitente. Guarda referencias limitadas en el mismo
archivo privado de memoria con HMAC, caducidad máxima de 20 minutos, límite
de 300 remitentes y sin texto completo del chat. Solo se escribe después de
confirmar la entrega. Los archivos previos, que recordaban únicamente el
número de carrera, siguen siendo legibles. Una carrera diferente invalida la
reutilización del contexto anterior. Sin identificador de remitente estable no
se reutiliza contexto.

El endpoint LAB canónico ahora puede consultar **estados de carrera y llegadas
confirmadas por operador en los registros internos**, además de informar con
honestidad cuando faltan listas de ejemplares verificadas. No certifica
resultados oficiales externos, datos monetarios ni horarios no registrados.
Las respuestas canónicas siguen pasando por `selectLabAnswer`; esta nueva
presentación no redefine la autoridad de consulta ni la de entrega.

El resumen es **solo de referencias disponibles**, no una reconstrucción de
todo el historial del grupo.

### Referencias citadas verificadas (seguimiento #892)

El journal privado de referencias para mensajes citados es **una pista
no autoritativa**, no una confirmación de estado, resultado ni operación.
`confirmedLabQuoteHint` autoriza almacenar solo una referencia
explícita y coherente (número + hipódromo + fecha) proveniente de un
mensaje no monetario. Rechaza «carrera 5 o carrera 6», «quinta o sexta»,
una fecha inválida o mensajes sin remitente estable. Esta misma regla
se aplica **después del ACK normal** y cuando el Bridge reinicia tras
haber confirmado una respuesta antes de guardar la pista auxiliar.

Las citas de mensajes todavía visibles también pasan por la validación
de ambigüedad del planner, incluso si no hay entrada en el journal.
Si la cita o la nueva pregunta contienen referencias contradictorias,
el asistente debe pedir aclaración; no puede usar la primera carrera
encontrada por una expresión regular como autoridad de lectura.
La verificación canónica por backend sigue siendo obligatoria para
presentar hechos de carrera. No se guarda el texto completo ni se
habilita SOURCE.

Pruebas de regresión:
`lab-confirmed-quote-hint.test.mjs` (memoria, ACK y reinicio) y
`lab-canonical-query.test.mjs` (cita visible normal, conflicto de
números/ordinales y operaciones monetarias).

### Conversaciones por pasos (follow-up #892)

Además de frases explícitas como `carrera 5 en hipódromo La Rinconada el
2026-10-12`, el planner acepta referencias informales `la quinta` o
`la 5ta` **solo como número de carrera**, nunca como datos verificables.
Si una pregunta previa dejó guardada la carrera 5 sin hipódromo/fecha, el
mismo remitente puede responder `La Rinconada el 2026-10-12` o
`Hipódromo La Rinconada fecha 2026-10-12`: el sistema completa la
referencia y pregunta qué consulta desea realizar. No llama al backend
con una pregunta inventada en nombre del usuario.

La aclaración requiere JID estable, mismo grupo LAB pinneado, memoria
no vencida y formato estricto `nombre de hipódromo + fecha ISO`; no
acepta fechas relativas (`hoy`), nombre visible, importes, comandos,
referencias a otra carrera ni payloads de chat con instrucciones. Solo
el `labTestReplyJournal` confirmado permite guardar la referencia.
Si la memoria expiró, el participante debe aportar otra vez el
contexto completo.

El asistente también permite completar los campos **uno por uno**.
Por ejemplo: `¿Estado de carrera 5?` → `La Rinconada` →
`2026-10-12`, o primero la fecha y luego `en La Rinconada`.
Hasta disponer de ambos campos, solo conserva una **pista parcial**;
no consulta resultados ni da una confirmación de carrera.
Los campos parciales siguen ligados al mismo remitente HMAC, al grupo
LAB pinneado y al vencimiento de veinte minutos; la escritura ocurre
solo después del ACK durable de salida. No se persiste el texto completo.
Si otro participante responde, si expira la pista o si hay una fecha
incorrecta, no se hereda información.

Corpus adicional en LAB, enviar por separado desde la misma identidad:

```text
¿Estado de la quinta?
La Rinconada el 2026-10-12
¿estado de esa?
```

Repetir el segundo mensaje desde otro participante y después de caducar
la memoria: ambos casos deben **rechazar la herencia de contexto**.
El backend solo responde si posee el dato verificado; un resultado interno
nunca se presenta como oficialidad externa.

### Corpus mínimo para la prueba física de hoy (solo LAB)

Enviar como mensajes separados desde un remitente con JID estable:

```text
hola
ayuda
estado de carrera 5 en hipódromo La Rinconada el 2026-10-12
¿y el estado de esa?
hazme un resumen de lo que hablamos
¿quiénes corren en esa?
Juega PP del 3 con 20
```

Esperado: identificación virtual, ayuda breve, lectura canónica **si existe en
backend**, referencia contextual, resumen limitado, negativa honesta para datos
no disponibles y revisión para el mensaje monetario. Repetir con otro remitente,
reinicio, backend fuera de línea, pregunta sobre otra carrera y salida/retorno
a WhatsApp. La confirmación de envío LAB sigue dependiendo de journal + tag,
no de la respuesta del backend ni del contexto.

**Gate:** `npm run qa` en este directorio, seguido de QA físico en Windows,
dos sesiones, recuperación y soak #119/#120. El QA unitario no certifica
WhatsApp real. SOURCE permanece NO-GO por el gate #728/#154.

## Continuidad de la conversación tras una confirmación LAB

Cuando un mensaje de respuesta LAB ya tiene un **ACK durable confirmado**,
un cierre del Bridge antes de guardar el contexto puede dejar la carrera
sin memoria auxiliar. Al reiniciar, el Bridge recupera **solo** la referencia
completa de carrera (número, hipódromo y fecha ISO) explícita en el mensaje
de origen, de ese mismo remitente y con un acuse de entrega confirmado.
Esto no crea un nuevo envío WhatsApp, no intenta reabrir la cola ni altera
la autoridad del resultado canónico.

La recuperación utiliza la fecha original del ACK y no alarga el límite
de 20 minutos. Si existe una referencia más nueva del mismo remitente,
si el ACK venció, si la identidad es ambigua o si la fecha no es válida,
el sistema no restaura nada. La memoria permanece limitada al grupo
LAB pinneado y a las claves HMAC; nunca almacena el JID, contenido completo,
números de saldo o credenciales. El Bridge conserva el orden de
`prepare → begin → send → confirm → remember`; este caso solamente
rehidrata una pista después de un ACK **ya confirmado**.

Una prueba de regresión de `lab-integrated-orchestration.test.mjs`
comprueba además que la referencia completada en varios mensajes sea
la enviada al backend, y no solo a la comprobación de handoff. Las
pruebas de `lab-conversation-context.test.mjs` cubren reinicio,
caducidad original, aislamiento y ausencia de reenvío.

## Recuperación inmutable de resúmenes de carrera LAB

El propósito `summary` utiliza ahora el mismo recibo durable de
`/bridge/lab/query` que `status`, `result` y `next/active/schedule`.
El backend valida **estado, versión, fecha de actualización, tipo de
respuesta y hash del texto** antes de entregar un resumen confirmado.
No se crea otra tabla ni otra fuente de datos, y el recibo solo contiene
huellas e identidad acotada: no guarda el texto ni datos financieros.

Si el HTTP termina después de persistir el recibo pero antes de llegar
al Bridge, el segundo intento con **el mismo ID de mensaje** recupera
`LAB_CANONICAL_RECOVERED` solo si la proyección sigue siendo idéntica.
El asistente puede presentar ese texto recuperado de forma natural.
Si aparece una corrección de carrera, cambia la versión, el texto o el
tipo de consulta, la respuesta queda bloqueada con
`LAB_CANONICAL_REVISION_CHANGED`; se requiere un mensaje nuevo.
Un takeover humano y una consulta vencida también bloquean la entrega.

Regresiones nuevas: unidad de recibos + renderizado en Bridge +
PostgreSQL aislado (pérdida de HTTP, replay idéntico, revisión posterior
y solicitud con nueva identidad). La prueba aislada no reemplaza la QA
física de WhatsApp/Windows. SOURCE conserva NO-GO.

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

En Windows (PowerShell), ejecuta las regresiones del Bridge **antes** de
vincular una sesión real. El comando LAB de recuperación incluye fallos de
socket TCP sobre loopback, entradas cifradas, journal de envíos, pruebas de
handoff, deduplicación y memoria recuperada tras ACK:

```powershell
npm ci --no-audit --no-fund
npm run check
npm run test:lab:recovery
npm run qa
npm run production:check
npm run source:policy
```

`test:lab:recovery` ejecuta las 13 suites requeridas explícitamente y una
regresión protege la lista para que no se omitan accidentalmente los tests
TCP o los guards del ACK. El script `test:lab:tcp` sigue disponible para
ejecuciones más focalizadas. Estos tests emplean sockets locales y disco
temporal, **no envían mensajes reales a WhatsApp**, y no sustituyen las
pruebas físicas con dos sesiones LAB/SOURCE, PostgreSQL 17, ni el soak
#119/#120. Un `FAIL` deja el release en NO-GO; estados `queued` de
GitHub Actions no equivalen a PASS. SOURCE sigue en lectura.

Para el QA general:

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
