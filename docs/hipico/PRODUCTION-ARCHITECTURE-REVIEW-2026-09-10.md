# Control Hípico — Production Architecture & Pilot Hardening Review

Fecha de revisión: 2026-09-10  
Ticket activo: #277  
PR activo: #278  
Objetivo inmediato: llevar el flujo real de WhatsApp a un grupo piloto sin convertir mensajes ambiguos en operaciones financieras automáticas, y dejar la PWA suficientemente rápida, offline-first, auditable y operable en un PC i5 de 6.ª generación con 16 GB de RAM.

## 1. Estado ejecutivo

Control Hípico ya tiene una base útil para un piloto serio: PWA offline-first, IndexedDB, service worker, outbox idempotente, snapshots, sincronización opcional, parser de WhatsApp, Bridge SOURCE→LAB, persistencia PostgreSQL del transporte, clasificador operacional y controles de handoff/seguridad. El problema principal ya no es ausencia total de piezas, sino que varias capas crecieron por acumulación y todavía no comparten un único modelo operacional canónico.

El riesgo más alto está en la frontera entre **texto observado** y **estado financiero autoritativo**. La aplicación debe poder leer “se abrió Churchill Downs 1ra”, “juego 3N del 1 con 30.000”, “consigo…”, “llegada 1.2.8.7”, cierres y planos; pero una observación del chat no puede por sí sola liquidar dinero. El chat es evidencia operacional y guía del flujo; la persistencia auditada sigue siendo la autoridad contable.

El PR #278 avanza esa separación: mensajes de operación precisos para LAB, centro manual de copiado, estados privados exportables, cálculo reutilizable de saldos/disponibles y nuevas regresiones. Aun así, **no debe declararse DONE** hasta cerrar los P0 de contexto de carrera, aislamiento multigrupo del flujo antiguo y evidencia de piloto.

## 2. Arquitectura actual verificada

### 2.1 Frontend/PWA

La PWA está en `frontend/public/hipico-control/`. `index.html` carga la aplicación imperativa principal, autenticación/accesos, recuperación y módulos auxiliares. El estado operativo principal vive en un workspace local normalizado y se persiste en IndexedDB.

`app.js` continúa siendo un archivo monolítico de aproximadamente 172 KB. Mezcla navegación, render HTML, captura de apuestas, saldos, liquidación, WhatsApp, configuración, sincronización, cierres, reportes y comandos de UI. Esto aumenta el coste de mantenimiento, dificulta las regresiones unitarias y hace que muchos eventos terminen re-renderizando grandes porciones de la interfaz.

La PWA ya dispone de una base offline sólida en `store-v2.js`: stores de workspaces/settings/outbox/snapshots/syncMeta, cola con clave de idempotencia única, snapshots y recuperación por cuota. El service worker mantiene un app shell explícito y evita cachear rutas sensibles/API.

### 2.2 Backend Hípico

El backend tiene un módulo dedicado `backend/src/modules/hipico-bot/`. La entrada del Bridge persiste primero el evento en PostgreSQL y falla con 503 cuando no existe persistencia autoritativa. `HipicoWebhookEvent.providerMessageId` se usa como deduplicación del transporte y el outbox mantiene un único registro shadow por evento.

El clasificador operacional extrae entidades de apertura/cierre de carrera, ofertas Juega/Consigue, monto, caballo, hipódromo, pizarra, balances y snapshots. Es deliberadamente observacional: `autoEligible=false` para intents operativos.

El motor conversacional decide ACK/clarificación/review/rechazo sin permitir efectos (`effectsAllowed=false`) y el Bridge conserva el grupo oficial en modo SOURCE/shadow. El texto propuesto se refleja en LAB; no se promueve todavía a envío autoritativo al grupo fuente.

### 2.3 WhatsApp Bridge

El Bridge de WhatsApp Web tiene su propio paquete Node 22 y scripts de preflight, captura de grupos, healthcheck, spool/replay, observabilidad y tests. Esto es una buena frontera de infraestructura porque permite que un fallo de red/backend no obligue a perder mensajes: el backend devuelve 503 y el Bridge puede reintentar desde spool.

### 2.4 CI/CD

Existen tres capas relevantes:

- `hipico-operations.yml`: replay del parser/operación, checks de sintaxis, pruebas del Bridge y wording gate.
- `hipico-qa-foundation-v103.yml`: runner canónico, Chromium real, matriz visual/funcional, artifacts por SHA y paridad Android.
- `ci.yml`: schema Prisma, typecheck, tests, auditorías, build frontend/backend, bundle budget y dependency audit.

El workflow QA Foundation apunta a PRs contra `main`. Mientras #278 siga apilado sobre la rama de #276, esa condición puede impedir que sea la evidencia completa del candidato. La integración correcta es mergear primero #276 o retargetear #278 a `main` y exigir un nuevo SHA validado.

## 3. Flujo operacional objetivo

El flujo de producción debe ser explícito y auditable:

`WhatsApp SOURCE → Bridge local → spool/idempotencia → endpoint backend → persistencia raw → normalización/clasificación → resolución de contexto carrera/participante → decisión → propuesta LAB → revisión/reglas → evento de dominio → persistencia → proyección PWA → texto/copiar/enviar permitido`

No se permite saltar desde “clasificación” directamente a “saldo”. Para dinero, cada transición debe tener identificadores estables de mensaje, carrera, participante, contraparte y operación.

### 3.1 Apertura de carrera

Entrada esperada: “se aperturó Churchill Downs, 1ra Carrera”.

Comportamiento objetivo:

1. Normalizar alias del hipódromo.
2. Extraer hipódromo + número.
3. Resolver la carrera existente del día o crear una propuesta de carrera.
4. Si falta hipódromo o número: `NEEDS_CLARIFICATION`, sin cambio de estado.
5. Si ambos coinciden inequívocamente: permitir que el piloto LAB muestre “carrera detectada” y que la UI ofrezca **Aplicar carrera**.
6. El cambio de carrera activa debe quedar auditado con `sourceMessageId` y nunca modificar saldos.

### 3.2 Juega / Consigue

Una oferta individual no debe convertirse en apuesta liquidable por sí sola. El backend necesita una sesión/segmento operacional persistente por `groupKey + raceId` con ofertas pendientes y deduplicadas.

Estado sugerido:

- `OBSERVED_PLAYER_OFFER`
- `OBSERVED_RECEIVER_OFFER`
- `PAIRED_PENDING_REVIEW`
- `CONFIRMED`
- `CANCELLED`
- `SETTLED`

La pareja se crea únicamente cuando jugada, caballo/selección, monto compatible, carrera y lados Juega/Consigue son compatibles. Debe soportar emparejamiento parcial sin duplicar montos. Un reply corto como “30k”, “J”, “Sf” o “Se fue” requiere vínculo verificable con el mensaje citado o queda en revisión.

### 3.3 Cierre de carrera

El cierre debe bloquear nuevas ofertas del segmento actual. Los mensajes posteriores se asignan a una siguiente apertura inequívoca o quedan como `late_or_next_block`. El cierre no liquida dinero.

### 3.4 Llegada/pizarra

La pizarra debe tener contexto de carrera antes de aplicarse. Regla P0:

- si mensaje trae hipódromo/número y no coincide con la carrera activa: bloquear;
- si coincide: permitir aplicar la pizarra observada con auditoría;
- si no trae contexto suficiente: requerir confirmación explícita del operador;
- aplicar pizarra no equivale a liquidar apuestas;
- liquidar sigue siendo una operación de dominio separada y revisable.

### 3.5 Pozo / disponibles

`DISPONIBLE` debe ser una proyección, no un campo mutable independiente. En la PWA actual se deriva de saldo persistido + aval Bs + aval USD convertido a la tasa aplicable. El PR #278 ya introdujo un ledger reutilizable para esa lectura.

La semántica exacta de `POZO` debe cerrarse con datos reales del piloto. Hoy puede reconstruirse desde movimientos tipados `pozo/pool`, pero no debe asumirse que todo remate usa exactamente esa taxonomía sin confirmación de fixtures reales.

### 3.6 Cierre diario privado

No debe enviarse automáticamente. El sistema debe generar, por participante:

- histórico de días de la semana;
- AVAL;
- POZO;
- SEMANA;
- DISPONIBLE;
- desglose del día por hipódromo/carrera;
- total del día.

El operador selecciona al participante, copia el texto y lo pega en su chat privado. También puede exportar un `.txt` diario con todos los bloques. Esto reduce riesgo de envío al destinatario equivocado y conserva el proceso manual que se quiere para el piloto.

## 4. Hallazgos críticos y plan de corrección

### P0-A — Contexto de pizarra antes de aplicar

**Estado: PENDIENTE.** La función histórica `applyLatestChatBoard()` aplica la última pizarra detectada sobre la carrera activa sin comprobar en esa misma transición que el contexto declarado pertenezca a la carrera correcta.

**Cambio requerido:** introducir `resolveBoardTarget()` como servicio puro; entrada = mensaje/board + activeRace + carreras del día; salida = `MATCH`, `MISMATCH`, `AMBIGUOUS`. Sólo `MATCH` puede aplicar directamente. `AMBIGUOUS` requiere confirmación manual. Añadir pruebas de carrera correcta, incorrecta, alias y pizarra sin contexto.

### P0-B — Aislamiento multigrupo en el flujo antiguo

**Estado: PENDIENTE.** El helper antiguo de `app.js` acepta elementos sin `groupId` para cualquier grupo. La normalización corrige buena parte de los registros heredados, pero existen rutas de creación antiguas que pueden volver a producir días sin `groupId`; el cierre semanal también debe limitar la actualización de `previousWeekBalance` al grupo activo.

**Cambio requerido:** hacer que toda creación de day/race/movement/closure escriba `groupId`; migrar helpers de lectura al ledger canónico; test de dos grupos con mismos días y carreras; snapshot de migración antes de modificar datos persistidos.

### P0-C — Estado conversacional persistente del grupo

**Estado: PENDIENTE.** El transporte y dedupe son persistentes, pero el matching Juega↔Consigue del flujo completo todavía debe consolidarse en backend como estado de carrera/segmento, no depender únicamente del replay local de un bloque pegado.

**Cambio requerido:** tabla/event stream de ofertas observadas o proyección durable por carrera; unique keys por source message; pairing determinista; idempotencia; cancel/correction audit; transaction boundary. Probar restart del backend, retry del mismo mensaje y llegada fuera de orden.

### P0-D — Piloto LAB antes de SOURCE

**Estado: EN PROGRESO.** El Bridge mantiene SOURCE read-only y muestra la propuesta del motor conversacional en LAB. Esta protección debe mantenerse durante el piloto.

**Gate para habilitar respuesta real:** allowlist explícita de grupo piloto, kill switch, credencial server-side, dedupe de envío, estado de handoff humano, evidencia de 0 dobles respuestas y 0 efectos monetarios no revisados en corpus piloto. Nunca habilitar SOURCE porque “los tests unitarios pasaron”.

## 5. Frontend y UX

### 5.1 Problema actual

La interfaz contiene varias generaciones de UI. `app.js`, estilos canónicos y capas de recuperación RC1 conviven. `rc1-recovery.js` mantiene un `MutationObserver` global sobre `document.documentElement` para volver a montar ayudas/estilos de recuperación. Esto es útil como salvavidas, pero no debe ser la estrategia normal de render de producción en una máquina modesta.

### 5.2 Dirección

Se propone una arquitectura frontend incremental sin reescribir todo de golpe:

`domain/` — cálculos puros, carrera, apuesta, saldo, pozo  
`application/` — comandos/casos de uso y validaciones  
`infra/` — IndexedDB, Supabase, Bridge client, exports  
`views/` — pantallas pequeñas por módulo  
`components/` — Button, Field, Card, MessageBox, DataRow, Dialog  
`app-shell/` — navegación y composición

El nuevo `operational-ledger.js` y `operational-copy-center.js` son el primer corte en esa dirección: lógica de lectura separada de `app.js` y UI operacional aislada, sin polling ni MutationObserver.

### 5.3 Contrato visual

Desktop puede ser compacto, pero mobile conserva targets táctiles de al menos 44 px. Todos los componentes deben cubrir foco visible, teclado, disabled, loading, empty, error, success, claro/oscuro y reduced motion.

El centro de mensajes debe convertirse en patrón reusable: encabezado corto, textarea readonly, un único CTA “Copiar texto”, sin botones gigantes ni paneles redundantes. Las vistas de captura deben priorizar densidad y velocidad sobre decoración.

## 6. Rendimiento para i5 6.ª generación / 16 GB

No existe todavía una medición de ese hardware real, por lo que los siguientes números son **objetivos propuestos, no resultados verificados**.

Objetivos de trabajo:

- interacción inicial PWA utilizable en ≤ 2,5 s con caché caliente;
- apertura del centro de mensajes ≤ 150 ms con jornada típica;
- captura de una jugada sin bloquear el main thread > 100 ms;
- historial virtualizado/paginado cuando crezca a cientos/miles de filas;
- cero polling cuando la vista no está visible;
- cero observers globales para funcionalidades normales;
- módulos no críticos cargados bajo demanda;
- no recalcular todo el workspace cuando cambia una sola carrera.

Plan de medición: Playwright con CPU throttling o benchmark de navegador equivalente, fixtures de 100/500/2.000 apuestas y trace. Luego repetir en el PC real del piloto. Sólo después fijar SLO de rendimiento definitivo.

## 7. Persistencia y base de datos

### Fortalezas verificadas

- dedupe de `providerMessageId` en transporte;
- outbox shadow único por evento;
- persistencia fail-closed: sin PostgreSQL el Bridge recibe 503;
- IndexedDB con outbox idempotente y snapshots;
- separación SOURCE/LAB.

### Pendientes

1. Canonicalizar identificadores `groupKey`, `raceId`, `participantId`, `sourceMessageId` en todo el dominio.
2. Estado conversacional durable para pairing Juega/Consigue.
3. Transaction boundary para pasar de observación confirmada a apuesta persistida.
4. Correcciones/reversos auditables; no borrar operaciones monetarias históricas.
5. Tests DB reales con PostgreSQL efímero y aislado para transporte, dedupe, pairing, cierre y concurrencia.
6. Verificar índices por consultas de jornada/grupo/carrera antes de pilotar volúmenes mayores.

El `ci.yml` define `DATABASE_URL` localhost pero no declara un servicio PostgreSQL en ese workflow. Por lo tanto, no debe tomarse ese archivo como evidencia de pruebas DB reales. Los tests reales deben levantar PostgreSQL aislado o usar el runner canónico que lo haga explícitamente.

## 8. Infraestructura del piloto

En el PC operador conviene tratar el Bridge como un proceso local administrado, no como una terminal que el usuario tenga que recordar cómo iniciar cada día.

Objetivo Windows:

1. Un launcher `Control Hípico` ejecuta preflight.
2. Comprueba Node/Chromium/configuración sin imprimir secretos.
3. Arranca Bridge como proceso controlado con log rotativo y healthcheck.
4. Si backend no responde, conserva spool local y reintenta con backoff.
5. Expone un comando corto de diagnóstico que devuelve: Bridge, sesión WhatsApp, grupo SOURCE, grupo LAB, backend, spool pendiente y última entrega.
6. Shutdown limpio y replay al reiniciar.

No debe instalar dependencias en cada arranque. `npm ci` pertenece a instalación/actualización, no al ciclo diario de operación.

## 9. CI/CD de producción

### Gate de PR

Para cambios Hípico:

- install con lockfile;
- syntax/lint/typecheck;
- parser + conversation + ledger + message regressions;
- Chromium como browser gate;
- PostgreSQL real efímero para pruebas que toquen persistencia;
- build PWA/backend;
- bundle/performance budget;
- artifacts con SHA;
- Bridge tests + spool/retry/idempotencia.

### Matriz ampliada

Firefox/WebKit pueden correr en matriz programada o release gate para no hacer el PR innecesariamente lento. Chromium sigue siendo el gate de feedback rápido.

### Regla de evidencia

Cada PASS debe corresponder al HEAD/SHA actual. Un Vercel READY de un SHA anterior no valida el HEAD nuevo. Un workflow que no obtuvo runner no es FAIL de código ni PASS: es `BLOCKED / INFRA`.

## 10. Seguridad operacional

- tokens del Bridge y operador sólo en entorno server/local seguro;
- nunca incrustar credenciales en PWA;
- SOURCE read-only durante el piloto hasta promoción explícita;
- kill switch inmediato para respuestas automáticas;
- handoff humano evita doble respuesta;
- dedupe de input y output;
- ningún resultado externo cambia dinero directamente;
- sanitización de texto y límites de longitud/rate;
- logs sin texto sensible completo cuando no sea necesario;
- exports privados sólo bajo acción explícita del operador.

## 11. Proveedor de carreras/resultados

Debe implementarse detrás de un contrato, por ejemplo:

```ts
interface RaceFeedProvider {
  listActiveRaces(date: string): Promise<RaceCard[]>;
  getRaceResult(track: string, raceNumber: number, date: string): Promise<RaceResult | null>;
}
```

Reglas:

- timeout corto;
- cache de racecards/resultados;
- circuit breaker/backoff;
- normalización de nombres de hipódromo;
- guardar fuente/timestamp de evidencia;
- fallback a chat/operador;
- nunca liquidar sólo porque un proveedor respondió.

La selección de proveedor requiere investigación separada de endpoints, licencia, cobertura de hipódromos y límites actuales; no se debe inventar un API.

## 12. Orden de ejecución recomendado

**P0 / antes del piloto con respuestas reales:** guard de pizarra por carrera; aislamiento multigrupo; estado persistente de ofertas/segmentos; prueba de dedupe/restart; kill switch/allowlist LAB; corpus piloto replay.

**P1 / durante piloto controlado:** migrar pantallas al ledger/domain service; consolidar componentes compactos; extraer módulos de `app.js`; launcher Windows/healthcheck; benchmark low-spec; proveedor de racecards como enrichment.

**P2 / hardening antes de producción amplia:** retirar recuperación RC1 del camino normal, matriz browser programada, pruebas de carga/soak, índices DB, disaster recovery y runbook operativo.

## 13. Criterio de DONE para #277

#277 sólo puede cerrarse cuando:

- formatos solicitados generan datos reales del workspace;
- privado diario es manual/copiable/exportable;
- apertura y pizarra resuelven carrera correctamente;
- pozo/disponible usa una fórmula canónica y fixtures reales;
- Bridge piloto no duplica respuestas;
- SOURCE no recibe efectos automáticos no autorizados;
- regresiones, typecheck/build y browser gate del SHA candidato están verdes o cualquier bloqueo externo está claramente separado;
- diff revisado sin secretos;
- preview/runtime `/hipico-control/` del SHA candidato fue comprobado.

## 14. Estado de esta revisión

**VERIFIED:** estructura PWA, IndexedDB/outbox/snapshots, service worker, monolito `app.js`, Bridge persistente fail-closed, dedupe de transporte, SOURCE/LAB, workflows existentes y nuevo centro manual de mensajes/ledger en #278.

**INFERRED / requiere piloto:** semántica definitiva de POZO y nombres exactos de algunos mensajes operativos según variantes reales del remate.

**NOT VERIFIED todavía en el HEAD posterior a esta revisión:** build final, Chromium final, runtime visual del nuevo centro, PostgreSQL real, comportamiento en el PC i5 objetivo.

**BLOCKED si GitHub no asigna runner:** checks de Actions sin `runner_name`/steps no pueden convertirse en evidencia de código.

**OUT OF SCOPE de #277:** liquidación financiera totalmente automática desde un proveedor externo o desde texto ambiguo, y envío privado masivo automático a participantes.
