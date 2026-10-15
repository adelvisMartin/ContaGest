# EMPIEZA AQUÍ — Contexto maestro, auditoría y protocolo progresivo

> **Lectura inicial para cualquier chat, agente o colaborador nuevo.** Esta guía es una puerta de entrada, **no** una segunda fuente de autoridad. Mandan las instrucciones explícitas del propietario, `AGENTS.md`, los contratos del repositorio, el issue asignado, el código real y las pruebas ejecutadas en el SHA actual. No reemplaces el estado vivo de GitHub por este documento histórico.

**Repositorio:** [adelvisMartin/ContaGest](https://github.com/adelvisMartin/ContaGest) · **Productos:** ContaGest y Control Hípico (mismo monorepo, dominios independientes).  
**Auditoría fuente preservada íntegra:** [Auditoría Staff+/Principal 2026-10-15](audits/AUDITORIA_STAFF_CONTAGEST_CONTROL_HIPICO_2026-10-15.md) (274 líneas; incluye hallazgos, matriz de riesgos, comparativos, planificación y límites de verificación).  
**Fecha/SHA de esa auditoría:** 2026-10-14/15; `main@01060d9938e282c133e7da18615fd8d9ea3ab195`. **Es una fotografía, no el HEAD que debe asumirse en el siguiente chat.**

## 1. Secuencia de lectura obligatoria para un nuevo chat

1. Leer [`AGENTS.md`](../AGENTS.md) **completo**; es la regla principal. Después, [`.agents/TICKET_EXECUTION_POLICY.md`](../.agents/TICKET_EXECUTION_POLICY.md), [Agent System v3](../.agents/context/AGENT_SYSTEM_V3.md) y [perfiles de agentes](../.agents/agents/).
2. Leer esta guía y la [auditoría técnica íntegra](audits/AUDITORIA_STAFF_CONTAGEST_CONTROL_HIPICO_2026-10-15.md), **sin reinterpretar sus estados `NOT_VERIFIED` como `PASS`**.
3. Leer [índice técnico](README.md), [arquitectura de los dos productos](architecture/PRODUCT_BOUNDARIES_CONTAGEST_HIPICO.md) y las reglas específicas de [Control Hípico](hipico/AGENTS.md) si el ticket toca ese dominio.
4. Obtener **en vivo** `main` y su SHA, issues, PR abiertos/merged/draft, comentarios, owner/claim, ramas y cambios concurrentes. Reconstruir el mapa de dependencias; no actuar desde una lista guardada.
5. Abrir el ticket exacto y sus criterios de aceptación. Si el usuario pide "continúa" sin número, seleccionar el próximo trabajo **libre y sin dueño exclusivo**, no el primero de una lista antigua.
6. Leer la skill del orquestador y solo las 2–4 skills de dominio/riesgo que el router asigne; capacidades de ejecución no consumen esas plazas. Las skills y agentes son guías/perfiles, **no trabajadores persistentes activos por sí mismos**.
7. Identificar arquitectura, contratos públicos, migraciones, permisos, pruebas y pipelines afectados **antes de editar**. Sólo entonces declarar alcance, riesgos, plan de regresión y archivos.

Puntos de referencia adicionales: [META general #841](https://github.com/adelvisMartin/ContaGest/issues/841), [ContaGest #624](https://github.com/adelvisMartin/ContaGest/issues/624), [expansión #835](https://github.com/adelvisMartin/ContaGest/issues/835), [gates transversales #836](https://github.com/adelvisMartin/ContaGest/issues/836), [Control Hípico #837](https://github.com/adelvisMartin/ContaGest/issues/837), [reconciliación #661](https://github.com/adelvisMartin/ContaGest/issues/661).

## 2. Misión y jerarquía técnica

**ContaGest:** ERP multi-tenant venezolano, núcleo financiero/comercial, operaciones, verticales de salud, odontología, veterinaria, psicología, fitness y comida. El núcleo decide auth/tenant/contabilidad/monedas; las verticales lo consumen, sin crear autoridades paralelas.

**Control Hípico:** plataforma especializada de jornadas/carreras, PWA/APK, dominio canónico, PostgreSQL, integraciones y Bridge WhatsApp. Los canales proponen eventos; **no** son la autoridad del ledger, saldo, participante, resultado o cierre.

Jerarquía al decidir: petición autorizada + issue/aceptación → `AGENTS.md` y política de tickets → código/contratos/BD efectiva → pruebas y evidencia SHA → documentación vigente → benchmarking como inspiración. Si documentos anteriores describen un defecto ya corregido, **validar regresión, no reabrir automáticamente**. Ejemplo: #698 aparece como hallazgo histórico, pero está cerrado; su antigua sobrescritura no aparece en `frontend/src/app.js` de la auditoría.

## 3. Prioridades progresivas: empezar por lo que bloquea valor real

| Secuencia | Responsabilidad | Owner/issue existente | Terminado sólo cuando… |
|---|---|---|---|
| 0 | Reconciliar cambios concurrentes, claims, SHA, merges dependientes | #661 y PR vivos | No hay ticket duplicado ni branch pisado |
| 1 | Chatbot LAB consulta hechos canónicos con contexto y aislamiento | [#892](https://github.com/adelvisMartin/ContaGest/issues/892) | Se demuestra LAB→API→lectura real→respuesta segura, sin inventar resultados |
| 2 | Consulta pendiente cifrada, ACK durable y recuperación sin doble envío | [#907](https://github.com/adelvisMartin/ContaGest/issues/907) / #899 | Caídas, reinicio, mensajes fuera de DOM e idempotencia probados |
| 3 | QA físico Android/PWA/WhatsApp con SOURCE y LAB separados | [#119](https://github.com/adelvisMartin/ContaGest/issues/119) | Evidencia sanitizada en dispositivos/sesiones reales |
| 4 | Soak 24–72 horas, memoria, sesiones, reconexión y alertas | [#120](https://github.com/adelvisMartin/ContaGest/issues/120) | Métricas y umbrales aceptados con run real |
| 5 | Backup, rol mínimo y restauración PostgreSQL 17 | [#842](https://github.com/adelvisMartin/ContaGest/issues/842) | 25/25 tablas, constraints y conteos reconciliados |
| 6 | Hallazgos de seguridad, tenant/RLS, sesiones y release | [#651](https://github.com/adelvisMartin/ContaGest/issues/651), #839, #841 | Sin HIGH/CRITICAL abierto y evidencia exact-SHA |
| 7 | ERP funcional: botones, formularios, APIs, persistencia y UX | [#659](https://github.com/adelvisMartin/ContaGest/issues/659), #663, #664 | Flujos UI→API→DB→UI verdaderos con Chromium/PG efímero |
| 8 | Venezuela: fiscal/contable, reglas legales versionadas, multimoneda | [#717](https://github.com/adelvisMartin/ContaGest/issues/717), #708 | Fuente oficial, vigencia, fixtures y posting correcto |
| 9 | Arquitectura, Clean Code, componentes, SEO, REA y mejora competitiva | #653, #654, #707, #997 y owners vigentes | Sin duplicar contratos, licencias respetadas, UX comprobada |

**Estos son frentes de trabajo, no la afirmación de que todos los tickets siguen abiertos.** Algunos pueden estar en desarrollo en otra ventana: reevaluar en cada sesión. Las fases de revisión/QA manual del propietario pueden organizarse al final; **la verificación automatizada proporcional al riesgo, tests de regresión y prevención de corrupción siguen siendo obligatorias por ticket**.

## 4. P0 Control Hípico — hechos establecidos y límites

El repositorio ya define motor conversacional, consultas de sólo lectura, contextos por remitente, journal de salida, inbox cifrado AES-256-GCM y recuperación posterior a fallos. Inspeccionar antes de cambiar:
- `tools/hipico-whatsapp-web-bridge/src/index.mjs`
- `tools/hipico-whatsapp-web-bridge/src/lab-canonical-query.mjs`
- `tools/hipico-whatsapp-web-bridge/src/lab-pending-query-inbox.mjs`
- `tools/hipico-whatsapp-web-bridge/src/lab-test-reply-journal.mjs`
- `backend/src/modules/hipico-bot/hipico-conversation-engine.ts`
- `backend/src/modules/hipico-bot/hipico-lab-readonly-query.ts`
- [runbook WhatsApp](hipico/WHATSAPP_READINESS_2026-09-29.md), [inbox #907](hipico/LAB_PENDING_QUERY_INBOX_907.md), [threat model](hipico/SECURITY_THREAT_MODEL.md).

**No introducir un segundo motor, otra cola, un parser paralelo o persistencia ficticia.** La entrada `processLabTestInput()` ya utiliza controles de consulta canónica, identidad/handoff y journal; cada criterio #892/#907 debe reconciliarse con el HEAD y probarse, no marcarse ausente por estar abierto el issue. El bloqueo ante fallo de un mensaje, entrega `ambiguous`, corrupción de clave/inbox, cambio de destinatario o contexto cruzado es obligatorio.

**Límite de política:** `SOURCE` (grupo real) permanece **sólo lectura** y su auto-envío está expresamente en estado `NO_GO` por [#154](https://github.com/adelvisMartin/ContaGest/issues/154), [#728](https://github.com/adelvisMartin/ContaGest/issues/728) y [política de plataforma](hipico/WHATSAPP_PRODUCTION_COMPLIANCE.md). **No habilitar envíos monetarios a SOURCE con flags, Playwright, Cloud API, Baileys ni vías alternativas como bypass**. Las pruebas de envío deben permanecer en LAB sintético/autorizado; la operativa comercial debe usar sus propias APIs/console con revisión legal aplicable.

E2E esperado: input válido → identidad/tenant/sender/race/hilo → consulta read-only actual → política/handoff → salida LAB autorizada → receipt visible → journaling/observabilidad → recuperación sin un segundo Enter. AI/LLM puede clasificar o proponer; nunca realiza apuestas, saldo o liquidaciones.

## 5. REA y benchmarking sin copiar software propietario

[PR REA #997](https://github.com/adelvisMartin/ContaGest/pull/997) se encontraba **abierto** en la auditoría: comprobar si está merged antes de invocar `contagest-rea-benchmark`. La investigación comercial venezolana es un ejercicio de comportamiento observable y autorizado: a2, Saint, Valery, Profit Plus, Gálac y herramientas ERP OSS (licencia revisada). Para Control Hípico observar, con acceso legítimo, filtros por grupo/participante/carrera/fecha, reportes, decisiones UX y vínculos privados de referencias, sin recolectar secretos ni copiar interfaces/activos/código protegidos.

Registrar por capacidad: fuente/permiso → URL/captura redactada/fecha → comportamiento probado → límites de conocimiento → diferencia con código propio → issue dueño → aceptación y tests → autorización/licencia. `SOURCE_REUSE=NONE` por defecto. Los [PR #999](https://github.com/adelvisMartin/ContaGest/pull/999) y [#1000](https://github.com/adelvisMartin/ContaGest/pull/1000) estaban abiertos y apilados; **no recrear el mismo trabajo**.

## 6. Bucle de implementación por ticket (obligatorio)

1. **Baseline:** obtener SHA de `main` y branch local; leer issue, criterio, comments, dependencia, PR, claim y diff previo. Reportar `BASE_SHA`.
2. **Claim único:** verificar que no exista owner exclusivo activo. En ventanas paralelas asignar un ticket distinto por ventana; registrar `issue ↔ PR ↔ branch ↔ ventana/owner`. Ningún ChatGPT ve todas las otras ventanas en tiempo real sin consultar GitHub.
3. **Plan:** usar `node scripts/agent-ticket-router.mjs gates --base main --type <tipo>`; seleccionar 2–4 skills, agentes apropiados, arquitectura, archivos mínimos y riesgos.
4. **Caracterizar:** capturar comportamiento before/failing test. Especialmente autorización, monetario, migraciones y regresiones de UX.
5. **Implementar:** cambio mínimo integrado UI/evento → cliente/estado → API → servicio → PostgreSQL → respuesta → UI; respetar permisos y contracts. Migraciones aditivas si procede. Nunca usar mocks como solución productiva.
6. **Validar:** comandos reales proporcionales al riesgo, con PG17 efímero y Playwright/browser cuando corresponda. Mantener negativos cross-tenant, error/loading/empty/offline y operaciones financieras.
7. **Auditar diff:** revisar seguridad, secretos, performance, accesibilidad, schema/rollback, dependencia y falsos positivos; no modificar pruebas para maquillar verde.
8. **Publicar:** commit(s) coherentes → push → PR (base main salvo stack justificado) con SHA, alcance, archivos, evidencia, riesgos, dependencias y condiciones de merge.
9. **Integrar:** merge serial sólo si gates materiales están satisfechos y ownership no colisiona; un error de infraestructura remota se anota separadamente, nunca `PASS`. Si bloqueado, dejar PR abierto y no cerrar issue como completado.
10. **Reconciliar:** verificar el merge real, cerrar/retirar issue sólo con evidencia, actualizar `main`, invalidar pruebas de SHAs anteriores y elegir el siguiente ticket sin solapamientos.

No hay obligación de cerrar todos los issues en un solo chat: la unidad de progreso es **un criterio de aceptación verificado con evidencia**, no la cantidad de tickets marcados completed.

## 7. Matriz mínima de pruebas y comandos de partida

**Gestor real de este repositorio:** Node 22.x con **npm workspaces** y `package-lock.json`. Usar `npm ci`; no sustituir por pnpm sin migración aprobada.

Comandos del repositorio a seleccionar **según riesgo, nunca marcar como ejecutados por aparecer aquí**:

- Base: `npm ci`, `npm run skills:check`, `npm run agent:system:verify`, `npm run agent:system:test`, `npm run lint`, `npm test`, `npm run build`.
- Seguridad/arquitectura: `npm run audit:architecture`, `npm run audit:prod`, tests de RLS/tenant/DB reales.
- UI: `npm run audit:visual:strict`, `npm run audit:functions:strict`, `npm run qa:browser:routes:full`, `npm run qa:a11y`.
- Hípico: `npm run test:hipico`, `npm run qa:hipico`, `npm run release:hipico:v290`; Bridge en `tools/hipico-whatsapp-web-bridge/`: `npm ci`, `npm run qa`, `npm run test:lab:recovery`, `npm run test:lab:tcp`, `npm run source:policy`.

Los comandos sensibles requieren variables/entorno de pruebas autorizados y se ejecutan sólo después de leer su implementación. No usar BD de desarrollo/producción compartida, ni `db reset/push --force` sobre producción. La matriz física Windows/Android, soak y recuperación real son evidencias **distintas** del CI. Si el usuario decide hacer QA manual al final, registrar ese gate como `NOT_EXECUTED` hasta que ocurra.

Estados canónicos por dimensión: `PASS | FAIL | BLOCKED | NOT_EXECUTED | NOT_APPLICABLE`. Dimensiones: SOURCE_REVIEW, LOCAL_STATIC, LOCAL_UNIT, LOCAL_INTEGRATION, LOCAL_POSTGRES, LOCAL_BUILD, LOCAL_BROWSER_E2E, REMOTE_CI, REMOTE_DEPLOY, PHYSICAL_EXTERNAL. La evidencia debe identificar comando, entorno, SHA, fecha, resultado/log o artifact y limitaciones. `MERGED` no equivale a `PASS`.

## 8. Cómo responder al usuario al finalizar cada ticket

Reportar siempre: ticket/criterios, owner/claim, SHA baseline y candidato/final, causa raíz, solución, recorrido real, archivos, migraciones/rollback, pruebas **ejecutadas y sus resultados**, pruebas NO ejecutadas, estado de CI/CD/PR/merge, seguridad, regresiones, riesgos, follow-ups y veredicto `DONE | PARTIAL | BLOCKED | FAILED`. No declarar `DONE` sin evidencia material; no inventar vínculos, SHA, permisos, capacidades ni ejecuciones.

## 9. Resumen ejecutivo preservado de la auditoría anterior

El análisis del 14–15/10 concluyó **PARTIAL / NOT_RELEASE_READY**, no porque faltara construir todo, sino porque había capacidades en código sin certificación operacional. Identificó **25 directorios de skills, 11 perfiles especializados y 5 skills de ejecución** en `main`; el [PR #998](https://github.com/adelvisMartin/ContaGest/pull/998) estaba merged. Reconoció el motor de conversación, inbox cifrado y registro durable LAB como implementaciones existentes. Priorizó #892, #907, #119, #120 y #842, y después #651/#659/#717. Recomendó conservar dominios separados, tratar pruebas locales/CI/QA físico como dimensiones distintas, cerrar capacidades de extremo a extremo y evitar refactors/reconstrucciones innecesarias.

En diseño observó reglas CSS de ContaGest y Hípico por separado, con necesidad de verificar estado visual, teclado, contraste, responsive y botones reales; en arquitectura marcó el gran Bridge `index.mjs` como candidato a extracción **incremental**, no rewrite; en seguridad priorizó aislamiento tenant/roles, replay, integridad financiera, secretos, RLS y restores; en marketing mantuvo indexables solo las landing públicas `/soluciones/`, nunca reportes privados; en REA pidió acceso legítimo, evidencia de funcionalidades y código propio. Se verificó que el hallazgo antiguo #698 ya había sido cerrado; no repetirlo.

**Lee la [auditoría íntegra](audits/AUDITORIA_STAFF_CONTAGEST_CONTROL_HIPICO_2026-10-15.md) para las matrices de 18 casos LAB, 14 controles de seguridad, backlog ERP, fuentes venezolanas y registro completo de riesgos.** Esta síntesis incorpora la respuesta previa sin convertirla en prueba de tests o despliegue.

## 10. Checklist de apertura para cada chat

- [ ] Leí AGENTS.md, esta guía y la auditoría; entiendo qué es histórico.
- [ ] Obtuve `main`/HEAD actual y revisé PR/issues/claims vivos.
- [ ] Tengo un ticket exclusivo no reclamado por otra ventana, o trabajo advisory delimitado.
- [ ] Identifiqué archivos/contratos/skill/agent y dependencias sin duplicar owners.
- [ ] Tengo matriz verificable de aceptación y riesgos antes de escribir.
- [ ] Preservé SOURCE read-only y no envié datos/secretos externos.
- [ ] Ejecuté y registré todos los gates posibles, sin falsear los restantes.
- [ ] Revisé diff/rollback y publiqué evidencia por SHA.
- [ ] Sólo cerré issue tras merge y pruebas materiales; si no, dejé estado PARTIAL/BLOCKED.
- [ ] Actualicé estado en GitHub y refresqué main antes de asumir el próximo ticket.
