# Auditoría técnica integral · ContaGest y Control Hípico

**Tipo:** auditoría Staff+/Principal orientada a producción  
**Corte:** 2026-10-14 / 2026-10-15 (hora Lima/Caracas)  
**Repositorio:** https://github.com/adelvisMartin/ContaGest  
**Autoridad de la rama:** `main`  
**SHA observado:** `01060d9938e282c133e7da18615fd8d9ea3ab195`  
**Estado de entrega:** `PARTIAL` (auditoría de fuentes y planificación; no certificación de ejecución local o de despliegue).  
**Productos:** ContaGest ERP multi-tenant y sus verticales; Control Hípico PWA/APK/Bridge/WhatsApp. Mismo repositorio, bounded contexts distintos.

## 1. Disciplina de evidencia y alcance

Esta auditoría examinó el árbol de `main`, `AGENTS.md`, políticas de tickets, metadatos de repositorio, issues/PR, scripts, fuentes y archivos de contratos; consultó páginas públicas oficiales de competidores y política de WhatsApp. También contrastó ramas abiertas, de las que **no** se infiere incorporación a `main`.

- `VERIFIED_SOURCE`: comprobado leyendo código, manifiestos o documentación correspondiente en GitHub. No significa ejecución exitosa.
- `VERIFIED_REMOTE`: corroborado mediante estado actual de GitHub (p. ej., PR fusionado, estado de SHA).
- `INFERRED`: riesgo o recomendación que debe validarse antes de afirmar defecto.
- `NOT_VERIFIED`: no se ejecutó prueba material, o no se recibió evidencia comprobable vinculada al SHA.
- `BLOCKED`: impide conclusión sobre calidad o puesta en producción; no se etiqueta PASS.
- `OUT_OF_SCOPE`: no autorizado por esta auditoría.

**Gates NO ejecutados en esta sesión:** `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, PostgreSQL 17 efímero, Playwright, Android/APK, WhatsApp físico Windows, prueba soak 24–72h, security scan vivo, restauración de respaldo y pruebas de despliegue. No se afirma PASS, FAIL ni corrección de estos procesos. Los archivos estáticos, por sí solos, tampoco certifican disponibilidad real. La conexión del contenedor a `github.com` por Git no tuvo DNS, de modo que la inspección se hizo con el conector de GitHub; tampoco se ejecutó REA localmente.

**Estado remoto puntual:** `main` SHA citado muestra un contexto de estado `Vercel=failure` consultado mediante GitHub. No demuestra por sí solo el motivo ni autoriza afirmar que los tests de código fallaron. El listado de ejecuciones de Actions vinculado mediante la consulta filtrada a PR para ese SHA fue vacío, no concluyente.

**Prioridad operativa:** Hípico LAB seguro > seguridad, datos y respaldo > recorridos funcionales > visual y UX > benchmarking/crecimiento. Ningún requisito nuevo debe sustituir a su autoridad existente.

## 2. Gobierno de agentes y skills

**Reglas verificadas:** `AGENTS.md` v16.7, `.agents/TICKET_EXECUTION_POLICY.md`, `.agents/context/AGENT_SYSTEM_V3.md`, `config/agent-skill-contracts-v3.json`, `config/agent-execution-capabilities-v1.json`, `agent-skills.lock.json`. Política: 2–4 skills ACTIVAS según riesgo y dominio; perfiles no son agentes residentes; claims exclusivos, exact SHA, worktrees aislados, minimización de permisos, evidencia separada por dimensión. Nunca ejecutar automáticamente hooks/scripts descargados de terceros. La automatización por lotes requiere al menos 5 unidades independientes, máximo 30, sin escrituras concurrentes sobre la misma autoridad.

**Inventario de `main` a este corte:** 25 directorios bajo `.agents/skills/`:

`contagest-accounting-integrity`, `contagest-api-contract-design`, `contagest-apple-design`, `contagest-appsec-review`, `contagest-archify`, `contagest-bcp-dr`, `contagest-ci-triage`, `contagest-cloudflare-security-audit`, `contagest-code-review-quality`, `contagest-copywriting`, `contagest-db-migration-safety`, `contagest-erp-orchestrator`, `contagest-functional-module-audit`, `contagest-hipico-lab-operations`, `contagest-impeccable`, `contagest-motion`, `contagest-release-evidence`, `contagest-secure-verification`, `contagest-simplicity-review`, `contagest-systematic-debugging`, `contagest-tenant-isolation-rbac`, `contagest-ui-audit`, `contagest-ui-ux-pro-max`, `graphify`, `react-doctor`.

**Cinco skills de ejecución:** `contagest-batch`, `contagest-fewer-permission-prompts`, `contagest-loop`, `contagest-run-skill-generator`, `contagest-skill-doctor`. **Once agentes/perfiles:** `accounting`, `appsec-iam`, `backend-api`, `ci-triage`, `dbre`, `frontend-pwa-ux`, `hipico-lab-operations`, `hipico-reliability`, `integration-contracts`, `orchestrator`, `qa-release`.

**Cambios recientes:** [PR #998](https://github.com/adelvisMartin/ContaGest/pull/998) merged, cinco skills y tres perfiles añadidos. [PR #975](https://github.com/adelvisMartin/ContaGest/pull/975) aún abierto y potencialmente solapado; **no** duplicar su trabajo. [PR #997](https://github.com/adelvisMartin/ContaGest/pull/997) REA 6.5.0 aún abierto y no mergeable según lectura; `contagest-rea-benchmark` **no** forma parte de `main` por ahora. OmniRoute gateway no está instalado: router determinista interno cubre el encaminamiento de skills, sin crear dependencia paga.

**Hallazgos:** la gobernanza de agentes está bien documentada, pero no se ejecutaron `npm run skills:check`, `npm run agent:system:verify`, `npm run agent:system:test` ni el router en esta sesión. Deben verificarse las dependencias, pins, instrucciones potencialmente no confiables, referencias obsoletas, colisiones de agentes, ausencia de secretos y riesgo de que fuentes externas reemplacen reglas propias. REA en una rama no puede usarse como prueba de investigación efectuada.

## 3. Chatbot de Control Hípico — P0

### 3.1 Recorrido descubierto

```text
Mensaje entrante autorizado / SOURCE solo lectura
  -> Bridge Playwright Web con IDs de grupo fijados
  -> normalización / dedupe / clasificación
  -> persistencia de evidencia, spool / inbox LAB si corresponde
  -> backend autenticado / APIs de consulta canónica
  -> Conversation Engine + contexto de emisor/carrera/hilo
  -> datos canónicos PostgreSQL / servicios Hípico
  -> política, handoff y decisión tipada (sin efecto financiero de IA)
  -> intent y journal durable de respuesta LAB
  -> validación de identidad de grupo / envío controlado
  -> comprobación de mensaje real de salida / receipt
  -> reconciliación / auditoría / observabilidad
```

**Fuentes:** `tools/hipico-whatsapp-web-bridge/src/index.mjs` (2006 líneas observadas), `lab-canonical-query.mjs`, `lab-pending-query-inbox.mjs`, `lab-test-reply-journal.mjs`, `lab-handoff-eligibility.mjs`, `lab-outgoing-evidence.mjs`, `lab-conversation-context.mjs`, `lab-answer-policy.mjs`, `backend/src/modules/hipico-bot/hipico-conversation-engine.ts` (332 líneas), `hipico-lab-readonly-query.ts`, `hipico-webhook.routes.ts`, `hipico-outbound-runner.ts`, `hipico-outbox.store.ts`.

**Presencia en código verificada:** LAB lee preguntas visibles, filtra ecos y mensajes propios, identifica remitentes, contextualiza citas verificadas, consulta `/bridge/lab/query` a través de un origen fijo, comprueba handoff antes y después de una consulta, guarda entradas cifradas antes de HTTP, reanuda preguntas pendientes fuera del DOM, escribe `prepared/sending/confirmed/ambiguous` y exige evidencia visible de salida. El motor clasifica y planifica respuestas; no debe ejecutar dinero. Meta webhook dispone de comprobación de firma e identidad/replay, pero el Bridge vigente no opera como Cloud API oficial implementada.

**Brecha de verdad:** #892 y #907 aún OPEN y la evidencia de Windows real/cross-machine/2 sesiones/soak no está certificada. No reconstruir motor, RPC, base conversacional ni cola por el solo hecho de que queden tickets abiertos: auditar aceptación ítem por ítem contra este código y contra el HEAD candidato.

### 3.2 Contratos de aceptación obligatorios

| ID | Prioridad | Comportamiento verificable | Evidencia esperada | Estado |
|---|---|---|---|---|
| HIP-01 | P0 | SOURCE nunca recibe emisión automática; kill switch realmente corta emisión | prueba de identidad negativa + logs redacted | código guard identificado; físico NOT_VERIFIED |
| HIP-02 | P0 | Grupo LAB `@g.us` inequívoco; falla si identidad cambia | Windows dos perfiles, cambio rápido de chat | NOT_VERIFIED |
| HIP-03 | P0 | Pregunta `¿cuál es el resultado de la carrera 3?` consulta hechos de carrera/contexto real | HTTP request/response + aserción DB | NOT_VERIFIED |
| HIP-04 | P0 | Consulta sin resultados explica ausencia; no inventa ganador/horario | test casos vacíos y desactualizados | NOT_VERIFIED |
| HIP-05 | P0 | Respuesta a mensaje citado sólo usa cita confiable mismo emisor | pruebas A/B, quote mutada, reinicio | código guard; E2E NOT_VERIFIED |
| HIP-06 | P0 | Handoff humano retiene respuestas incluso en carrera de concurrencia | fault injection antes de prepare y antes de send | NOT_VERIFIED |
| HIP-07 | P0 | Consulta cifrada persiste antes de HTTP y revive sin DOM | matar Bridge/reiniciar Windows/retomar | código persistencia; físico NOT_VERIFIED |
| HIP-08 | P0 | ACK ambiguo no provoca segundo Enter | fallos antes y después de tecla, comparación LAB | NOT_VERIFIED |
| HIP-09 | P0 | `confirmed` + fallo de journal auxiliar no reenvía | kill proceso en checkpoints de escritura | código guard; físico NOT_VERIFIED |
| HIP-10 | P0 | Offline provoca pendiente/NO-GO, nunca hechos caducos | pruebas de corte backend y recuperación | NOT_VERIFIED |
| HIP-11 | P0 | Entradas corruptas y clave no válida fallan cerradas | Node/NTFS/backup/key restore | código cifrado; físico NOT_VERIFIED |
| HIP-12 | P0 | Dos Bridge compitiendo por la misma cuenta/grupo no envían doble | carrera host único / hosts distintos | cross-host NO-GO sin exclusión central |
| HIP-13 | P0 | Riesgo monetario/estado/resultado nunca se liquida desde salida de LLM | corpus adversarial y negativos PG | código policy; dinámico NOT_VERIFIED |
| HIP-14 | P1 | Proveedor IA caído, lento, inválido o abusivo degrada seguro | contract tests, límites de coste, métricas | NOT_VERIFIED |
| HIP-15 | P1 | Latencia, pendientes, reintentos, DLQ y sesión observables sin PII | panel operador + alerta simulada | NOT_VERIFIED |
| HIP-16 | P0 | 24–72 h funcionamiento continuo | soak #120 con métricas/budgets | NOT_VERIFIED |
| HIP-17 | P0 | Android/PWA/APK, 2 jornadas, offline, reinicio | QA físico #119 y artefactos | NOT_VERIFIED |
| HIP-18 | P0 | Backup/restauración 25/25 tablas aisladas | #842 PG17 restore reproducible | NOT_VERIFIED |

**Riesgos tecnológicos específicos:** `index.mjs` tiene 2006 líneas y mezcla composición de navegador, fuente, envío, contextos y reconciliación: candidato de extracción gradual caracterizada, no de rewrite. El lock de inbox local protege un directorio, **no equivale a exclusión distribuida fiable** entre máquinas/instalaciones. Las ACL de NTFS y cifrado de dispositivo requieren validación física; `chmod` 0600 en Windows no sustituye ACL. Fuente externa/DOM/quoted text es input no confiable, no permiso. La IA debe mantener salida estructurada, límites de tokens/tiempo, ruta alternativa determinista, redacción, versionado de prompts, inyección adversarial y prohibición expresa de acciones financieras.

### 3.3 Seguridad/política de WhatsApp

La política oficial https://whatsappbusiness.com/policy/ actualizada el 23/09/2026 restringe real-money gambling y contiene excepciones geográficas limitadas para ciertos casos de apuestas online: Australia, Japón, Colombia, México y Perú; **Venezuela no figura**. La excepción exige condiciones y autorización de Meta cuando aplique. Documentación: `docs/hipico/WHATSAPP_PRODUCTION_COMPLIANCE.md`, `source-policy-gate.mjs`, #154 y #728. **Mantener SOURCE en NO-GO**; una implementación técnica vía Playwright, WebSocket o Cloud API no es autorización. LAB debe ser de pruebas sintéticas/permitidas y no usado como bypass para apuestas reales. Para operación productiva de negocio, privilegiar la consola propia/aplicación, con interfaces humanas sujetas a legislación y política aplicable.

## 4. ContaGest ERP — cobertura funcional y Venezuela

| Dominio | Autoridad/flujo que debe quedar probado | Riesgo prioritario | Owner/backlog | Estado auditoría |
|---|---|---|---|---|
| Identidad/RBAC | login -> JWT/sesión -> tenant -> claims server-derived -> operación -> logout/revocación | IDOR/BOLA, role spoofing | #651 #851 #844 | NOT_VERIFIED dinámico |
| Multiempresa | usuario A nunca lee ni escribe empresa B, incluso jobs/reportes | fuga transversal | #641 #739 #845 #846 | NOT_VERIFIED dinámico |
| Clientes/proveedores | CRUD validado, historial, búsqueda, dedupe, aislamiento | pérdida de datos | #659 #836 | NOT_VERIFIED |
| Venta completa | cotización -> pedido -> entrega -> factura -> cobro -> asiento -> UI | estados falsos, doble registro | #708 #637 | NOT_VERIFIED |
| Compra completa | solicitud -> orden -> recepción -> CxP -> pago -> asiento | inventario y pasivo desalineados | #708 #235 | NOT_VERIFIED |
| Inventario | reservas, lotes, múltiples almacenes, conteos, valorización, correcciones | stock negativo/doble descuento | #708 #94 | NOT_VERIFIED |
| Contabilidad | partida doble, reversos, períodos, cierre, conciliación | corrupción ledger | #91 #643 #637 | NOT_VERIFIED |
| Bancos | conciliación real, monedas/fecha tipo FX, anulaciones | conciliación incorrecta | #237 #560 | NOT_VERIFIED |
| IVA/ISLR/IGTF | perfil fiscal tenant, fechas vigencia, base imponible, retenciones, libro | error tributario | #717 #629 | GAP explícito #717 |
| Moneda VES/USD | tasa BCV fecha efectiva, conversión, redondeo decimal, no mezclar monedas | error monetario | #560 #717 | NOT_VERIFIED |
| SENIAT documentos | consecutivos, trazabilidad, notas crédito/débito, modelos autorizados | incumplimiento fiscal | #717 #762 | NO CERTIFICADO |
| Nómina/contribuciones | cálculo versionado, empleado, recibos, deducciones, posting | legal/financiero | #717 | NOT_VERIFIED |
| Servicios/beneficios | un catálogo único vs producto, pricing y acceso | autoridad duplicada | #849 #852 #856 | GAP definido |
| Agendas/capacidad | sedes, recursos, conflicto atómico, lista espera | doble reserva | #848 | GAP definido |
| Trabajos asíncronos | transacción -> outbox -> job lease -> retry -> DLQ -> receipt | pérdida/doble entrega | #853 | GAP definido |
| Notificaciones | consentimiento, plantillas, quiet hours, delivery evidence | spam/privacidad | #854 #772 | GAP definido |
| Verticales | Gym/Dental/Vet/Care consumen core sin forks de roles, citas, cobros | inconsistencias y privacidad | #709–#712 #836 | NOT_VERIFIED |
| Reportes/exportaciones | permisos, integridad, moneda, paginación, compatibilidad, auditoría | información falsa/fuga | #659 | NOT_VERIFIED |
| PWA/offline | caché sensible fuera de SW, estados stale, logout, sincronización | fuga/operación obsoleta | #563 #984 | NOT_VERIFIED |

**Hallazgo histórico reconciliado:** `docs/architecture/clean-code-refactor-findings-v1.json` conserva un P1 anterior sobre `frontend/src/app.js` y `AccessControlService.canAccessRoute`. Sin embargo, **#698 está CLOSED/completed (2026-09-29)** y en el archivo actual `frontend/src/app.js` ya **no aparece esa sobrescritura**. Por tanto, no debe contarse como bug activo ni reimplementarse: únicamente queda por correr su caracterización/regresión sobre SHA actual. `docs/architecture/clean-code-refactor-metrics-v1.json` acredita también retirada histórica de un adaptador huérfano; ninguno de ambos antecedentes equivale a certificación global clean-code.

**Normativa:** todo cálculo venezolano debe asociar fuente oficial, vigencia, perfil fiscal y documento; no deducir automáticamente tasas/regímenes a partir de páginas comerciales. Una prueba funcional no certifica homologación ni cumplimiento SENIAT/BCV. Ticket canónico #717 sigue abierto.

## 5. Arquitectura, infraestructura, datos y disponibilidad

**Separa capacidades:** plataforma core (tenant, auth, permisos, configuración, auditoría); finanzas/contabilidad; comercial/inventario; verticales; Hípico; adapters externos. La regla es `UI -> API -> servicio de aplicación -> dominio -> repositorio transaccional -> PG -> evento/outbox -> UI`, sin negocio en presentación, rutas o accesos directos a tablas desde verticales. `docs/architecture/PRODUCT_BOUNDARIES_CONTAGEST_HIPICO.md` y #653 gobiernan el ownership. Hípico tiene tablas/journal y modelos operacionales propios, no duplicar ledger/monedas con ERP sin contrato aprobado.

**Persistencia:** PostgreSQL 17 aislado y efímero para QA; Supabase sólo como adapter autoritativo según entorno real, jamás reset de producción; migraciones aditivas, backfill y rollback auditables, FORCE RLS cuando proceda, grants mínimos, vistas `security_invoker`, evitar `SECURITY DEFINER` innecesario, search_path fijo en funciones privilegiadas, evidencias cross-tenant SELECT/INSERT/UPDATE/DELETE/joins/jobs. Backup cifrado y restauración #842 con scope canónico 25/25; fijar RPO/RTO objetivo y probarlo, no inventarlo.

**Infraestructura:** manifiesto de configuración único #665, secretos fuera de frontend y assets, scopes por servicio, retención y rotación, WAF/rate limiting, PostgreSQL connection limits, timeout y circuit breaker por proveedor, TLS, health/readiness separadas, structured logging con correlationId y redacción, métricas por tenant no sensibles, alarmas de cola/DB/errores, canary/rollback/restore drill. Contenedores/scripts con dependencias pinneadas y SBOM. Objetivos SLO deben acordarse a partir de medición, nunca atribuir cifras ficticias.

**CI/CD:** `.github/workflows` acumula numerosos flujos versionados y temporales; owner #654. `main` contiene `.github/workflows/ci.yml` con `npm ci`, typecheck, pruebas y builds; rama protegida nominalmente no mostró required contexts en la consulta del endpoint, por lo que hay que verificar el ruleset real y no asumir que CI bloquea PR. Matriz Chromium/Firefox/WebKit y PostgreSQL aislado según alcance, outputs por SHA, fallos/provider separados. El proyecto usa **npm + package-lock**: aplicar `npm ci` (no sustituir por `pnpm install --frozen-lockfile` sin migración aprobada).

## 6. UX/UI y diseño — dos marcas, estándares compartidos

**ContaGest:** `frontend/src/styles` contiene seis CSS según `AGENTS.md`; entrada `erp-runtime.css` coordina los estilos canónicos; `frontend/src/components/ui/kit.js` y `contagest-visual-system-v12.css` son autoridades de componentes/tokens, `designSystem.js` y `designTokens.js` facades de compatibilidad. Temas light/dark, viewport 360/390/430/768/1024/1440, títulos compactos, focus/keyboard, reduced motion, sin overflow global. `frontend/index.html` no tiene `<style>` global: **evidencia positiva**. Pero el HTML todavía enlaza `login-hotfix-v162.css`, `login-mobile-a11y-v163.css` y estilos de `design-system/`; **reconciliar contra regla AGENTS que prohíbe hojas hotfix versionadas como nueva autoridad**. No se afirma regresión visual hasta ejecutar computed styles/render.

**Control Hípico:** `frontend/public/hipico-control/STYLE-GUIDE.md` define lenguaje ecuestre propio, marfil/carbón/verde/bronce, themes `system/light/dark`, hit target 44px, shell compartido, estados semánticos, sin variaciones arbitrarias por vista. `frontend/public/hipico-control/assets/css/` mantiene `app.css`, `platform-tokens-v1.css`, compat `v3`, UI v4 y convergence; determinar imports y consumidores reales antes de eliminar compatibilidad. La app carga muchos módulos desde `index.html`; auditar dependencias/bootstrap/first paint, eventos duplicados y acceso offline.

**Contrato de revisión visual en runtime:** route x viewport x tema x `loading/empty/error/success/disabled` + keyboard, foco, lector pantalla, contraste WCAG, zoom 200%, Unicode extenso, scroll, orientación landscape, reduced-motion, conexión lenta/offline/reconexión, multi-tab, acción crítica con confirmación, mensajes comprensibles, errores y cambio de tenant. Comparar capturas con diff perceptual y pruebas de eventos. Nunca reemplazar test funcional por screenshot.

## 7. Ciberseguridad defensiva y abuso

| ID | Categoría | Ataque/abuso de prueba permitida | Criterio de éxito |
|---|---|---|---|
| SEC-01 | IAM | token caducado/firmado incorrectamente/revocado | rechazar 401/403 sin filtración |
| SEC-02 | BOLA/IDOR | tenant A pide ID/recurso/adjunto de B | deny/no rows/no metadata |
| SEC-03 | RLS | `SELECT/INSERT/UPDATE/DELETE` con sesión limitada | aislamiento completo y tests PG reales |
| SEC-04 | API/webhook | firma HMAC Meta inválida/replay/timestamp | negar sin efecto ni reenvío |
| SEC-05 | Browser/DOM | quoted payload cambiado, HTML/XSS, id `@g.us` engañoso | nunca usar input como autoridad |
| SEC-06 | IA | prompt injection y respuestas inventadas/financieras | policy fail-closed, human review |
| SEC-07 | Secretos | service role, tokens, cookies, DSN, JID en bundle/log/support | 0 secretos/PII reales en artefactos |
| SEC-08 | SSRF | proveedor de carrera apunta a loopback/metadata/red interna | URL allowlist, DNS/redirect/IP reject |
| SEC-09 | Disponibilidad | 429/5xx/red lenta/20 reintentos | backoff acotado y breaker |
| SEC-10 | Persistencia | DLQ/spool tampered, ciphertext/key corrupta | cuarentena, no doble commit/envío |
| SEC-11 | Recovery | backup robado/restauración fuera de scope | cifrado, least privilege, restore seguro |
| SEC-12 | Supply chain | dependencia/hook/skill externa comprometida | pin, review, `--ignore-scripts` donde aplique |
| SEC-13 | PWA/Android | SW cachea datos financieros o cuenta anterior | no-store y purga por workspace |
| SEC-14 | Reglas/CI | PR sin checks/ruleset desactivado | deployment guard exact-SHA manual/CI |

**No son afirmaciones de vulnerabilidades explotadas.** Son casos de adversarial QA dentro de sistemas propios/autorizados y no se ejecutó pentest sobre terceros. El repositorio ya contiene un modelo de amenazas Hípico `docs/hipico/SECURITY_THREAT_MODEL.md`, y #651 coordina findings de auth, media BOLA, health exposure, RLS, providers y telemetría. Cualquier HIGH/CRITICAL pendiente mantiene NO-GO de promoción.

## 8. REA y benchmarking competitivo venezolano (legal/clean-room)

**Estado de integración:** PR #997 propone REA `rea-agents@6.5.0` con SHA pin y licencia MIT en modo local opt-in, matriz por producto y `SOURCE_REUSE=NONE` por defecto; **no está fusionado** a este corte, no hay resultados de inspección real certificada. REA es una herramienta para estudiar comportamiento y arquitectura con permisos legítimos; no equivale a licencia para copiar código, marca, assets, datos o acceso privado de terceros.

**Fuentes comparativas públicas**:

| Producto / fuente | Patrones a benchmarkear | Implementación equivalente propuesta (propia) |
|---|---|---|
| a2 Suite https://a2.com.ve/producto/12-suite-administrativa/ | compras/ventas, CxC/CxP, contabilidad integrada, libros, bancos, multiempresa | workflows trazables #708, Venezuela pack #717 |
| Saint https://saintnet.com/soluciones-administrativas/ | ERP inventario/venta/reportes y parametrización | contratos fiscales y operación comercial |
| Valery https://valery.com/valery-estandar.html | cotización, historial crédito, gestión de pedidos | estados de documento y trazabilidad de usuario |
| Profit Plus | flujo administrativo/contable, impuestos, atención al mercado venezolano | comparación sujeta a fuente verificable |
| Gálac | contabilidad, fiscal/nómina local | comparar reglas versionadas; nunca asumir homologación |
| ERPNext/Dolibarr/Tryton/Akaunting/Invoice Ninja | inventario, libros, ERP, UX y automatizaciones | licencia por fuente; no copiar GPL/AGPL/BSL/custom por defecto |
| Websimproco Triple Crown (link de reporte aportado) | vistas grupales/personales, filtros fecha/carrera, tokens de acceso | #999 reportes internos y #1000 shares con autorización por scope; ninguno merged |

**Protocolo obligatorio REA:** autorización escrita del propietario del objetivo; scope preciso (dominios, cuenta test y pantallas accesibles); sin explotación, evasión de pagos, credenciales ajenas, PII real o crawling agresivo; recopilar captura/ruta/fecha/version/escenario/redacciones; describir *comportamientos observados* y no suponer estructura privada; matriz feature -> evidencia -> diferencia -> ticket owner -> tests; implementar desde cero sobre APIs existentes; revisión de licencia y de uso de marca/recursos; medir UX/security/performance propios. `?t=` en enlace privado es un token/capability, **no** prueba de groupId ni autorización para consultar datos de terceros. Los PR #999/#1000 son trabajos derivados propios con dependencias, no demuestra scraping del servicio original.

## 9. SEO, marketing, privacidad y adquisición

**Situación fuente:** `frontend/index.html` es aplicación privada y correctamente declara `noindex,nofollow`; `frontend/public/robots.txt` permite `/soluciones/`, bloquea `/api/` y rutas privadas; `frontend/public/sitemap.xml` contiene seis landings `/soluciones/` con `lastmod` antiguo. No indexar operaciones, saldos ni links con tokens. `robots.txt` no es control de acceso, por lo que endpoints privados deben exigir autenticación, autorización y no-store/no-referrer.

**Planes de mejora sin inventar KPIs:** validar rutas públicas y estado HTTP 200, canonical URLs, titles y descripciones únicas, enlazado interno, sitemap regenerado sólo al publicar cambios, schema.org `SoftwareApplication`/`Organization` cuando los datos comerciales sean verificados, OG, performance Core Web Vitals, página de precios sólo con valores reales, textos en español venezolano (comercio, contador, inventario, IVA, CxP, CxC, gimnasios, clínicas), formularios anti-spam y privacidad/cookies según normativa. Medir Search Console/analytics sólo tras consentimiento y configurar metas verificables: visita landing -> demo/consulta -> registro -> activación -> retención. SEO no debe tocar páginas autenticadas ni publicar reportes privados.

## 10. Plan ejecutable y propietarios (prioridades)

| Orden | Producto / trabajo | Dueño autorizado | Archivos/superficies a inspeccionar o cambiar, sólo si test lo exige | Prueba de cierre |
|---|---|---|---|---|
| 0 | Reconciliar `main`/PR #997/#998/#975/#999/#1000; claims | #661 / issues individuales | `.agents/*`, `config/*`, metadata PR | autoridad única, ningún duplicado |
| 1 | LAB conversacional end-to-end sin hechos falsos | #892 | `tools/hipico-whatsapp-web-bridge/src/index.mjs`, `lab-canonical-query.mjs`, `backend/src/modules/hipico-bot/hipico-lab-*` | síntesis read-only, scopes A/B, PostgreSQL+browser |
| 2 | Cola inbox, ACK y persistencia de contexto after-crash | #907 / #899 | `lab-pending-query-inbox.mjs`, `lab-test-reply-journal.mjs`, recuperación/manifest tests | fault injection, 0 doble Enter, Windows reboot |
| 3 | QA Windows, Android/PWA/APK, 2 perfiles | #119 | `tools/hipico-whatsapp-web-bridge`, `frontend/public/hipico-control`, `qa/*` | matriz física screenshots/logs sanitized por SHA |
| 4 | 24–72h soak y alertas | #120 | `backend/scripts/hipico-soak-v120.ts`, health/ops | umbrales documentados, memoria/cola/reconnect |
| 5 | Backup/restore real isolated | #842 | `ops/backup`, PG scripts y manifest 25/25 | restore + counts/FKs/orphans + RPO/RTO |
| 6 | Seguridad release | #651/#839 | auth/RLS/health/webhook/storage/CI | findings HIGH/CRITICAL cero + negativos |
| 7 | Cobertura real full ERP | #659/#663/#664 | `frontend/src`, `backend/src`, `qa`, `tests`, manifests | recorridos UI->PG->UI y fresh install |
| 8 | Venezuela pack fiscal | #717/#708 | `backend/src/modules/fiscal`, financial, migration/tests | reglas legales versionadas y golden fixtures |
| 9 | Unificación UX y deuda CSS | #619/#645/#6975, regresión histórica #698 (cerrado) | estilos/kit, `frontend/src/app.js`, Hípico v4 | browser states/roles/themes/responsive; no duplicar #698 |
| 10 | Autoridades compartidas negocio | #849/#848/#853/#854 | core catalog/scheduling/jobs/notifications | transacciones atómicas/tenants/no forks |
| 11 | Benchmark REA autorizado | #997/#707 | REA benchmark config, captures redacted, issue owners | evidencia trazable y licencia revisada |
| 12 | CI/env/release y SEO público | #654/#665/#669, marketing | `.github/workflows`, config, `/soluciones/` | reproducibilidad, required checks, SEO live |

**No se crean tickets duplicados cuando existe owner.** De surgir un gap nuevo, enlazar issue exacto, registrar prioridad, amenaza, baseline SHA, reproducción y aceptación; continuar por worktree único e integrar serialmente. Tickets cerrados históricamente no implican cumplimiento del `main` actual ni necesidad automática de reabrirlos.

## 11. Validación operacional que debe ejecutarse (no ejecutada aquí)

La raíz es un **monorepo npm workspaces**, con `package-lock.json`; la instalación reproducible real es `npm ci --no-audit --no-fund`, no `pnpm install`. Comandos de referencia presentes en package.json, sujeto a entorno seguro:

```bash
# baseline de calidad, en un checkout aislado en SHA exacto
npm ci --no-audit --no-fund
npm run skills:check
npm run agent:system:verify
npm run agent:system:test
npm run audit:architecture
npm run lint
npm test
npm run build
npm run audit:visual:strict
npm run audit:functions:strict
npm run qa:browser:routes:full
npm run qa:a11y

# Hípico, en el entorno con PG17 efímero y credenciales de pruebas
npm run test:hipico
npm run qa:hipico
npm run release:hipico:v290

# Bridge, solo con perfil/grupos LAB autorizados y datos sintéticos
cd tools/hipico-whatsapp-web-bridge
npm ci
npm run qa
npm run test:lab:recovery
npm run test:lab:tcp
npm run source:policy
npm run production:check
```

**No ejecutar `npm run qa:hipico` o `production:check` contra producción sin comprobar previamente el scope/entorno.** Los comandos figuran como plan, no como logs. E2E debe levantar base aislada por job y limpiarla siempre, obtener evidencia Chromium en PR y matriz Firefox/WebKit cuando el riesgo lo exija, usar `--frozen-lockfile` únicamente si el gestor propio fuera pnpm (no lo es), proteger las identidades SOURCE/LAB y mantener artifacts/errores sensibles redactados. Nunca inventar estados PASS. Al cambiar el SHA, invalidar gates materiales afectados.

## 12. Riesgos residuales y cierre

**P0:** fuente WhatsApp real NO-GO; falta QA físico de 2 sesiones y 24–72 horas; falta restore live 25/25; falta certificar gates de seguridad/CI/visual/runtimes exact-SHA; Vercel failure en `main` sin root-cause investigado. **P1:** intención y contexto LAB deben verificarse por backend actual, robustez offline/ambiguous, competencias fiscal Venezuela, autorización/tenant y coherencia visual. **P2:** consolidación workflows, mejoras SEO/marketing, benchmarking REA y refactor incremental del Bridge. No tocar code paths de dinero por ideas obtenidas de UX externa sin golden tests contables.

**Decisión:** `PARTIAL / NOT_RELEASE_READY`. Auditoría de fuente y backlog efectuada; sin cambios de código, commit, PR, merge, migración ni despliegue en esta sesión. Al no ejecutarse los gates, no existe un SHA candidato final nuevo ni certificado de QA. El camino corto a calidad es cerrar #892/#907 con verificación real, luego #119/#120/#842/#651 y reconciliar releases #839/#841; ContaGest en paralelo bajo #624/#835/#836 y sus owners especializados.

## 13. Enlaces de autoridad y fuentes

- Repo: https://github.com/adelvisMartin/ContaGest
- `AGENTS.md`: https://github.com/adelvisMartin/ContaGest/blob/main/AGENTS.md
- `docs/hipico/WHATSAPP_PRODUCTION_COMPLIANCE.md`: https://github.com/adelvisMartin/ContaGest/blob/main/docs/hipico/WHATSAPP_PRODUCTION_COMPLIANCE.md
- `docs/hipico/LAB_PENDING_QUERY_INBOX_907.md`: https://github.com/adelvisMartin/ContaGest/blob/main/docs/hipico/LAB_PENDING_QUERY_INBOX_907.md
- `docs/hipico/SECURITY_THREAT_MODEL.md`: https://github.com/adelvisMartin/ContaGest/blob/main/docs/hipico/SECURITY_THREAT_MODEL.md
- Control Hípico META: https://github.com/adelvisMartin/ContaGest/issues/837
- QA físico #119: https://github.com/adelvisMartin/ContaGest/issues/119
- Soak #120: https://github.com/adelvisMartin/ContaGest/issues/120
- Backup DR #842: https://github.com/adelvisMartin/ContaGest/issues/842
- LAB #892: https://github.com/adelvisMartin/ContaGest/issues/892
- LAB inbox #907: https://github.com/adelvisMartin/ContaGest/issues/907
- ContaGest META #624: https://github.com/adelvisMartin/ContaGest/issues/624
- Expansión #835: https://github.com/adelvisMartin/ContaGest/issues/835
- Localización Venezuela #717: https://github.com/adelvisMartin/ContaGest/issues/717
- Seguridad #651: https://github.com/adelvisMartin/ContaGest/issues/651
- REA PR #997: https://github.com/adelvisMartin/ContaGest/pull/997
- Compromiso skills PR #998: https://github.com/adelvisMartin/ContaGest/pull/998
- Reportes PR #999: https://github.com/adelvisMartin/ContaGest/pull/999
- Links privados PR #1000: https://github.com/adelvisMartin/ContaGest/pull/1000
- Meta / WhatsApp Business policy (actualizada 2026-09-23): https://whatsappbusiness.com/policy/
- REA upstream: https://github.com/morluto/rea
- a2 Suite: https://a2.com.ve/producto/12-suite-administrativa/
- Saint: https://saintnet.com/soluciones-administrativas/
- Valery: https://valery.com/valery-estandar.html