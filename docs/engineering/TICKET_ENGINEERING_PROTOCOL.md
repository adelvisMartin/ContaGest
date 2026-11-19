# Protocolo de exactitud de tickets, ingeniería Staff+ y revisión multidisciplinaria

**Autoridad:** `AGENTS.md` > `.agents/TICKET_EXECUTION_POLICY.md` > issue/AC explícitos > código/contratos y evidencia SHA; este documento detalla el proceso sin sustituir las autoridades existentes. **Aplicación:** tickets nuevos y expansiones materiales de los 23 owners vivos. La migración retroactiva de un ticket antiguo exige revisar el owner y no generar duplicados.

## 1. Ticket listo para implementar: contrato obligatorio

Un ticket debe describir **hecho vs hipótesis**, referencia de código y baseline SHA, usuario/rol/tenant, objetivo verificable, alcance y fuera de alcance; rutas/archivos como candidatos, dependencias y posibles PR en curso; flujos positivos/negativos y datos de prueba. Diferenciar requisitos del dueño, evidencias actuales, sugerencias benchmark, obligaciones legales verificadas y decisiones de ingeniería. Ni un título amplio ni 10.000 combinaciones de texto sustituyen implementación o QA real.

**Checklist de preparación:** 1) live main SHA y PRs abiertos; 2) owner/claim y contratos existentes; 3) workflow UI/evento→estado/cliente→API→servicio→PostgreSQL→respuesta→UI; 4) definiciones de roles/autorización, versionado, idempotencia y rollback; 5) AC atómicos; 6) QA y casos adversariales; 7) UX, perf, carga y observabilidad; 8) FODA y fuente/permiso de benchmarks; 9) riesgos P0/P1 y out-of-scope; 10) revisión independiente.

**Criterios de aceptación:** ID estable `AC-01`, etiqueta `[POSITIVO]`, `[NEGATIVO]` o `[REGRESION]`, caso Dado/Cuando/Entonces, respuesta observable y `Prueba:` concreta en API/DB/browser. Cada AC une al menos un resultado y una verificación, nunca “funcional”, “optimizado” o “100%” sin medición. No desactivar tests, modificar expectativas para lograr verde ni usar mocks permanentes. Mantener los AC históricos al refinar, salvo cambio autorizado y trazable.

## 2. Fases de entrega por ticket

**A. DISCOVER:** revisar `docs/PROJECT_START_HERE.md`, ticket, PR, HEAD y código; registrar `EXISTS|PARTIAL|MISSING|INFERRED`, grafo de consumidores, BDD, guardas, UX y tests actuales.

**B. PLAN:** ejecutar router v3, seleccionar solo 2–4 skills ACTIVE obligatorias y perfiles advisory por dominio. Declarar archivos, cambios y riesgos. Capturar baseline de latencia, bundle/route JS, PostgreSQL y UI cuando afecte rendimiento; baseline no medible se marca `NOT_EXECUTED`.

**C. IMPLEMENT:** primero flujo positivo completo y fallos, luego refactor mínimo; frontend/backend/DB quedan integrados, sin autoridad paralela o scope creep. Revisar expiración, permisos, tenant y ownership en servidor; efectos contables precisos y reversibles; migraciones aditivas cuando sea posible.

**D. FODA ITERATIVO:** después de caracterización, tras primer vertical slice y antes de PR, evaluar Fortaleza/Oportunidad/Debilidad/Amenaza con ruta/función/test real, severidad, decisión `NOW|FOLLOW_UP|REJECT` y costo/beneficio. Una oportunidad no crea requisito nuevo automáticamente; auditor independiente decide bloqueo P0/P1.

**E. VERIFY:** pruebas local static/lint/typecheck/unit/contratos/build, PostgreSQL 17 aislado real con tenants A/B y limpieza garantizada; Playwright Chromium como puerta PR y Firefox/WebKit según matriz; UI teclado/foco/lector, 360/390/430/768/1024/1440, light/dark/reduced motion; seguridad BOLA/BFLA/idempotencia/replay, performance comparada p50/p95, UI LCP/INP/CLS con tamaño de muestra; pruebas físicas/Play cuando corresponda.

**F. REVIEW/SHIP:** review de diff/secretos, conflictos, migraciones, RPO/RTO/rollback y evidence exact-SHA, reviewer independiente; PR dedicado, CI requerido solo PASS real, merge serial con nuevo HEAD; cerrar solo si cada AC y gate aplicable se verificó. Estados `PASS|FAIL|BLOCKED|NOT_EXECUTED|NOT_APPLICABLE` y cierre `DONE|PARTIAL|BLOCKED|FAILED` según resultado real. Bloqueo de proveedor se comunica separado.

## 3. Matriz de expertos consultivos (no implica empleados ni certificados)

| Rubro / tipo | Perfil consultivo | Foco y negativos imprescindibles |
| --- | --- | --- |
| Contabilidad, hoja de trabajo, costos, punto de equilibrio, KPI, estados, fiscal | `financial-domain-review` | saldo y asiento cuadrado, Decimal, periodificación, moneda/tasa, costo fijo/variable, margen, conciliación total vs desglose mensual, auditar source-of-truth |
| Administración, ERP, CRM, venta, compra, inventario, bancos | `financial-domain-review` + `backend-api` existente | cotización→orden→recepción/entrega→factura→pago→ledger, idempotencia, lotes/FEFO, reverso, dependencia cliente/proveedor y ownership |
| Gym, Vet, Dental, Medicina | `clinical-services-review` + `frontend-pwa-ux` y `appsec-iam` existentes | consentimiento/registro longitudinal, tutor/paciente/socio propios, doble reserva/dosis, firma y corrección versionada, privacidad, PWA offline |
| Control Hípico (local, fuera de Google Play) | `clinical-services-review` + `hipico-reliability` existente | resultados de jornada desde canonical, ledger/reportes auditados, LAB synthetic, SOURCE WhatsApp auto-read/send NO_GO, respaldo/soak/QA físico |
| Infraestructura, redes, telecom, ciberseguridad, backend/frontend, rendimiento | `infra-telecom-performance-review` + especialistas `dbre`, `appsec-iam`, `qa-release` existentes | p95/latencia, N+1/índice, TLS/CORS/CSP, revocación offline, despliegue exact-SHA, restore, zero-regression, no DoS en producción |
| Investigación de competidores/capacidades | `competitive-intelligence-review` | fuente pública, versión, licencia, ToS/API, gap de repo, decisión ADAPT/DEFER y AC original |

El perfil es un **documento consultivo**, no un proceso de agente autónomo ni un título profesional. Las aprobaciones clínicas, fiscales, legales y de seguridad requieren responsables humanos con competencia formal cuando corresponda. El enrutador conserva su límite de 2–4 skills ACTIVE y la autoridad de `foda-senior`/`auditoria-independiente`/`qa-release`.

## 4. Investigación comparativa permitida y verificable

La [matriz de investigación por sector](DOMAIN_COMPETITIVE_RESEARCH_GUIDE.md) compara ERP, CRM, compras, ventas, inventario, KPI, estructura de costos, punto de equilibrio, conciliaciones, hoja de trabajo, Gym, Veterinaria, Odontología, Medicina, Control Hípico e infraestructura. Cada oportunidad se documenta con fuente oficial, fecha, licencia, owner, riesgo y test; **no** se incorpora automáticamente al backlog.

Preferir manuales oficiales, changelogs, demos públicas, screenshots de marketing con derechos claros, APIs documentadas, GitHub OSS con licencia y documentación de organismos normativos. Antes de cualquier crawler: verificar términos, robots.txt, método autorizado, volumen/cadencia, identidad, datos accesibles y conservación de capturas; respetar límites y desistir si el proveedor prohíbe o bloquea. No evadir logins, CAPTCHA, paywalls, bans ni extraer registros privados de usuarios/pacientes. **Que una página sea públicamente visible no concede derechos para clonar su diseño o ejecutar scraping masivo.**

Matriz de ejemplo para buscar *patrones*, no copiar código: ERPNext (transacciones, stock, conciliación); wger (rutinas y nutrición); Open Dental (odontograma/planes); OpenMRS (encuentros/observaciones); OpenVPMS (veterinaria clínica); PWA/operación Hípico a partir del dominio propio y fuentes públicas autorizadas. Para cada caso documentar URL, fecha, versión, licencia, patrón observable, alternativa original, gap `EXISTS|PARTIAL|MISSING`, costo/impacto, owner y prueba. Si no se autoriza automatización, usar revisión manual de información pública.

Fuentes primarias de contraste: https://docs.frappe.io/erpnext/accounting-introduction ; https://github.com/wger-project/wger ; https://www.opendental.com/manual/chart.html ; https://guide.openmrs.org/getting-started/openmrs-information-model/ ; https://www.openvpms.com/features ; https://developers.google.com/search/docs/crawling-indexing/robots/intro ; https://docs.scrapy.org/en/latest/topics/downloader-middleware.html . Consultar licencia y versión de nuevo antes de reutilizar un recurso.

## 5. Presupuestos y veredicto

Las metas de LCP ≤2.5s, INP ≤200ms y CLS ≤0.1 a p75 son **referencias Web Vitals**, no un SLA garantizado; medir campo o entorno sintético indicado y registrar muestra. Consultar https://web.dev/articles/vitals . El repo exige controles táctiles de ~44px, foco accesible y ausencia de scroll horizontal global, más fuerte que las excepciones de WCAG 2.2. DB: revisar con EXPLAIN (ANALYZE, BUFFERS) solo en entorno seguro; esta sentencia ejecuta la query (no usar DML peligrosamente).

Verificar fuentes: https://www.postgresql.org/docs/17/using-explain.html ; https://www.w3.org/TR/WCAG22/ ; https://playwright.dev/docs/best-practices ; https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/ .

**Iteración verificable del validador:** la suite `node --test tests/ticket_quality_gate_v1.test.mjs` ejecuta **10.000 escenarios deterministas de especificación**, incluyendo documentos malformados y casos estructuralmente correctos. Son pruebas del analizador de tickets y no ejecuciones de funcionalidades del ERP, ni 10.000 revisiones profesionales independientes. Repetir diseño → caracterización → código → pruebas → FODA → auditoría hasta satisfacer criterios y riesgos reales; no reiterar texto por una cifra arbitraria.

**Verificador estructural:** `node scripts/ticket-quality-gate.mjs --file ruta/ticket.md --domains erp,compras --strict --json`. Comprueba secciones y mapeo de AC a pruebas, propone perfiles consultivos. **`SPEC_STRUCTURE_READY` NO es `PASS` de código, QA, legalidad ni benchmark**; se requiere auditoría humana de sentido de negocio y pruebas reales. No se ejecuta automáticamente sobre todos los issues históricos: se usa para specs nuevas/revisiones materiales y se evitan falsos bloqueos por títulos antiguos.

## 6. Plantilla mínima de ticket

```md
# Ticket: <descripción>
## Contexto y evidencia
HEAD/PR/archivos y hechos verificados vs INFERRED.
## Objetivo
Qué cambia, para quién y con qué resultado observable.
## Alcance
Funciones y flujos incluidos.
## Fuera de alcance
Límites y follow-ups sin duplicación.
## Dependencias y ownership
Issue/PR dueño y archivos/servicios afectados.
## Flujo y arquitectura
Evento → UI → API → servicio → PG17 → respuesta → UI; auth/tenant/RBAC.
## Criterios de aceptación
- [ ] AC-01 [POSITIVO] Dado rol válido Cuando confirma Entonces guarda datos propios | Prueba: E2E+PG17
- [ ] AC-02 [NEGATIVO] Dado rol/tenant ajeno Cuando consulta Entonces API 403 y cero datos | Prueba: API A/B
- [ ] AC-03 [REGRESION] Dado cliente existente Cuando actualiza Entonces conserva su flujo | Prueba: Chromium
## UX/UI y accesibilidad
Estados, teclado/foco, responsive, dark/light, reduced-motion.
## QA y regresión
Tests de contrato, PG17, Playwright y físicos si aplica.
## Rendimiento y cargas
Baseline: NOT_EXECUTED hasta medición con fixture reproducible; objetivo ejemplo p95 250 ms con entorno/volumen acordado, además de LCP/INP/CLS si aplica.
## Seguridad y datos
Rol, tenant, PII, idempotencia, rollback.
## FODA y mitigaciones
Fortalezas: contrato reutilizable; Oportunidades: menor fricción; Debilidades: riesgo INFERRED; Amenazas: carrera simultánea; Mitigación: NOW: probar concurrencia.
## Investigación y licencias
Fuente: https://www.postgresql.org/docs/17/; Fecha: 2026-11-19; versión, licencia y restricciones de scraping.
## Plan de implementación
Pasos/archivos, dependencia, retrocompatibilidad.
## Evidencia y cierre
SOURCE_REVIEW: NOT_EXECUTED; LOCAL_UNIT: NOT_EXECUTED; LOCAL_POSTGRES: NOT_EXECUTED; CI: NOT_EXECUTED.
```

La plantilla es **orientativa** y contiene placeholders: no certificarla con `--strict` sin reemplazarlos por hechos.
