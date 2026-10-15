# #772 · Catálogo de integraciones neutral y free-first

**Baseline auditado:** `main@01060d9938e282c133e7da18615fd8d9ea3ab195` (2026-10-14 America/Lima). **Entrega:** investigación + contratos declarativos + validador y regresiones, **no** adapters ejecutables. **SOURCE_REUSE=NONE.** Autoridades: API #565/#652, arquitectura #653, seguridad #651, worker/outbox #853 y catálogos competitivos #707/#764. Todos los conectores permanecen apagados (`runtimeEnabled=false`, `enabled=false`).

## Evidencia por proveedor

| Proveedor | API documentada / autenticación | Decisión hoy | Costo y licencia (revisar versión/ToS concretos) | Caso propio y autoridad |
| --- | --- | --- | --- | --- |
| ERPNext / Frappe | [REST /api/resource/{DocType}](https://docs.frappe.io/framework/user/en/api/rest), `Authorization: token key:secret`; [rate-limit y 429](https://docs.frappe.io/framework/user/en/rate-limiting) | **CONSUME_EXTERNAL_API** (candidato, no activo) | Self-host preferido; [GPL-3.0](https://github.com/frappe/erpnext) | Importar catálogo de contactos/productos **read-only, dry-run**; no sincronización financiera antes de mapping #770 |
| Dolibarr | [REST module /api/index.php/{resource}](https://wiki.dolibarr.org/index.php/Module_Web_Services_REST), header `DOLAPIKEY`; módulos activos determinan recursos | **CONSUME_EXTERNAL_API** (candidato, no activo) | Self-host preferido; [GPL](https://github.com/Dolibarr/dolibarr) | Lectura opt-in de terceros/productos, sin usar `DOLAPIENTITY` controlado por el navegador |
| Odoo 19 | [JSON-2 `/json/2/{model}/{method}`](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html), bearer API key, record rules; RPC XML/JSON histórico en retirada | **IMPLEMENT_INTERNAL_EQUIVALENT** primero | [Community LGPL / Enterprise comercial](https://www.odoo.com/documentation/master/legal/licenses.html); [API externa Odoo SaaS requiere plan Custom](https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html) | Integración sólo cuando licencia/plan permita; modelo contable nativo #637 |
| Akaunting | [REST + HTTP Basic / permission `read-api`](https://akaunting.com/hc/docs/developers/restful-api/); rutas varían por versión | **IMPLEMENT_INTERNAL_EQUIVALENT** primero | [BSL y terms por versión](https://github.com/akaunting/akaunting) | Exportación de datos por contrato propio #770, no añadir credenciales privilegiadas por defecto |
| Invoice Ninja v5 | [API `/api/v1/invoices`](https://invoiceninja.github.io/docs/developer-guide), `X-API-TOKEN` + `X-Requested-With` | **CONSUME_EXTERNAL_API** (candidato, no activo) | [Elastic license, no permisiva](https://github.com/invoiceninja/invoiceninja); self-host sujeto a licencia | Migración sólo dry-run, sin doble ledger; ownership financiero #637/#745 |
| Finpartner | [App pública](https://finpartner.pt/app-finpartner/) | **NOT_APPLICABLE** a conector externo: no se acreditó API pública | Servicio comercial, terms/API desconocidos | Inspiración de colaboración cliente-contador; flujo interno propio #745 |
| Referencias verticales | [Benchmark vertical #707](https://github.com/adelvisMartin/ContaGest/issues/707) | **NOT_APPLICABLE** hasta identificar provider/API y autorización | Sin identificación/licencia/API suficiente | No inventar endpoints para clínica/veterinaria/fitness |

La documentación externa sólo acredita contratos publicados **por sus fabricantes**, no funcionamiento desde ContaGest, acceso concedido, licencia compatible ni endpoints disponibles en una instalación específica. No se tomó código ni UI de proveedores.

## Contrato adapter v1 y fronteras

El catálogo canónico de decisiones reside en `config/provider-integration-catalog-v772.json`. El validador `scripts/verify-provider-integration-catalog-v772.mjs` prohíbe cambios que habiliten la integración o debiliten sus garantías. **No es una implementación de esas garantías.** No se permite construir una conexión operativa sin completar su implementación y pruebas reales.

**Borde principal:** request autenticado → tenant/rol de servidor → conexión registrada perteneciente al tenant → operación admitida por allowlist → port `integration-port-v1` → adapter específico → respuesta sanitizada/auditada. Ni `tenantId` ni identidad del proveedor o host pasan directamente del payload a la autoridad. Protección obligatoria contra SSRF: HTTPS, URL de host permitido, IP privadas bloqueadas, revalidación DNS en conexiones, redirects restringidos, timeout y límite de bytes.

**Inbound webhook:** raw body → comprobación de firma con secreto server-side → límite temporal/replay nonce+eventId durables → resolución del tenant por conexión registrada → inbox idempotente → validación schema/versión → trabajo de dominio autorizado → outbox/reconciliación. Una firma válida no concede permiso de contabilidad, salud ni tenant. No existe implementado este flujo por el solo hecho de figurar aquí.

**Outbound:** job persistente → correlación + `Idempotency-Key` por tenant+conexión+operación → timeout, rate limit/429 Retry-After, retry con backoff bounded → DLQ y conciliación. Nunca reintentar writes no idempotentes sin dedupe comprobado. Los side effects financieros sólo en core contable; provider no crea una segunda autoridad.

**Credenciales:** exclusivamente secretos cifrados/referencias server-side y permisos mínimos; nunca navegador, URL, logs, fixture ni documento. Rotación/revocación prevista y redacción de Authorization, cookies, tokens, rawBody y PII. La API de ContaGest deriva de `backend/src/shared/contracts/api-contract-v1.json` y su inventario generado, **no** de especificaciones editadas por vendor.

## Prioridad y decisiones de producto

1. **P1 investigación/portabilidad:** read-only ERPNext/Dolibarr con mapping, dry-run y rollback diseñados por #770; implementar adapters únicamente tras el contrato completo y PostgreSQL aislado. No requiere SaaS.
2. **P2 opcional:** Invoice Ninja para importación/exportación y Odoo cuando el tenant ya tenga instancia/plataforma autorizada. Sin costo obligatorio para ContaGest; licencia/ToS y contratos revisados antes de conectar.
3. **N/A por ahora:** Finpartner y proveedores verticales sin API pública confirmada; crear un equivalente interno de colaboración (#745), nunca scraping autenticado o clonación de UI.
4. **No-duplicación:** factura/ledger, job worker, webhooks, audit y permisos siguen en sus dominios propietarios; si la autoridad ya existe, **reusar** en vez de crear adaptador financiero paralelo.

## QA/CI ejecutable y criterios por etapas

**Preflight sin proveedores ni credenciales:**

```bash
node scripts/verify-provider-integration-catalog-v772.mjs
node --test tests/provider_integration_catalog_v772.test.mjs
npm ci
npm run lint
npm run build
```

Regresiones negativas del inventario: activación prohibida, tenant spoofing, host/redirect/SSRF y URL con secretos, replay no firmado, repetición no idempotente, faltas de provenance/licencia, proveedor no acreditado, redacción e incompatibilidad de contrato. Los tests del catálogo **sólo prueban reglas de configuración**, no prueban operaciones reales ni cumplimiento de HTTP/DB.

**Ejecución de adapters (pendiente fuera del entregable declarativo):** contract tests HTTP con servidor proveedor stub efímero y fixtures propias; PostgreSQL 17 efímero por run/tenant; proveedor indisponible, 401/403/429/500, duplicados/out-of-order, replay, clave rotada, DLQ/reconciliación, retry idempotente y rechazo A→B/B→A; Chromium Playwright en flujo de consentimiento/conexión y matrices Firefox/WebKit conforme al pipeline. No usar DB compartida; no usar mocks permanentes en producción. Son **NOT_EXECUTED** hasta existir adapter real.

## Registro pendiente / condición de resolución

| ID | Estado al crear este documento | Responsable / salida verificable |
| --- | --- | --- |
| **BLOCK-772-ENV** | BLOCKED — checkout local remoto no resuelve `github.com` desde sandbox actual | Disponer de checkout confiable y deps mediante entorno con DNS; `git ls-remote`, `npm ci` y ejecutar gates sobre exact HEAD sin copiar credenciales |
| **BLOCK-772-ADAPTER** | OUT OF SCOPE de la matriz (gap de entrega end-to-end) | #772 y futuros tickets atómicos si el producto aprueba integración: implementar port, tenant+RBAC real, webhook, DLQ/worker y browser; sólo activar con pruebas |
| **BLOCK-772-LICENSE** | NOT VERIFIED por versión, instancia y plan comercial concretos | #656 + owner de #772 verifican contrato legal/ToS, API access, límites, NOTICE antes de activar |
| **BLOCK-772-CI** | PENDING exact-SHA hasta ejecución en PR | GitHub Actions y logs/artifacts del SHA exacto; queued no es PASS; fallos preexistentes se clasifican separadamente |
| **BLOCK-764-OWNER** | #764 reclamado previamente por PR #1004; PR #1003 cerrado sin merge por duplicado | #764 owner PR #1004; clasificación Ecologic/provenance y QA quedan pendientes ahí, no se incorporan aquí |
| **BLOCK-979-OBS** | CI de PR #1003 falló `backend/src/shared/observability/contract.test.ts:86`: legacy expected vs Problem Details v2 actual | #979/PR #980 resuelven y verifican en HEAD nuevo; evidencia de job 116244545822, run 38680763433; no modificar contratos concurrentes |

**Regla de cierre:** ningún estado `CANDIDATE` habilita operaciones reales; se registra `PASS` sólo con comando, ambiente, SHA y evidencia verificables. No cerrar #772 por el número de filas o por tener tests escritos. El QA manual del usuario permanece al final, sin diferir regresiones automáticas de seguridad.

**Rollback:** revertir JSON, validador, tests y este documento; no hay DDL, secrets ni runtime. El impacto operacional es nulo mientras no se conecte el adaptador.
