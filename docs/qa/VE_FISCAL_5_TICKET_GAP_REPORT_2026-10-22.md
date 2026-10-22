# Revisión QA P0 · ContaGest VE (#751, #785, #774, #775, #776)

**Fecha:** 2026-10-22. **Destino:** PR #1279, rama `feat/ve-tax-751-785-774-775-776-integrity-20261022`. **Veredicto actual:** PARTIAL / NOT READY TO MERGE. El HEAD debe consultarse de nuevo para cualquier evidencia exact-SHA.

## Evidencia ejecutada en esta revisión

- `node --experimental-strip-types --test tests/fiscal_rule_governance_policy_v751.test.mjs` sobre copia local exacta de los dos blobs Git publicados (`f380d62b2440bfcd78ec6a1307f3bf514baeabca` módulo y `062fcff6c82dc796f49fb749516de6609e15a8ae` test): **4/4 PASS** con Node 22.16.0, comprobado en distintas zonas horarias. Es evidencia **focal exact-blob**, no QA del backend/DB del commit completo.
- `tsc --strict --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext backend/src/modules/fiscal/fiscal-rule-governance-policy.ts` sobre réplica local: PASS focal. No sustituye el typecheck de workspace.
- Suite `fiscal_rule_snapshot_integrity_v751.test.mjs`: 5/5 PASS aislado de la revisión anterior; no revalidada como gate del HEAD actual.
- Verificación GitHub de branch/PR, cambios publicados, SHA y diff: VERIFIED (inspección, no ejecución de aplicación).
- Workflows remotos del SHA candidato: PENDING/QUEUED/SKIPPED al revisar, sin PASS global.
- **NOT EXECUTED**: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build:backend`, `npm run build:frontend`, PostgreSQL 17 `from-zero` y `upgrade`, API real/RLS, Playwright E2E y deployment exact-SHA. Clon completo bloqueado por DNS de github.com; sin PostgreSQL 17 disponible en la sesión. Ninguna consulta ni test se ejecutó sobre producción.

## Hallazgos y disposición

| Severidad | Ticket | Hallazgo | Estado |
| --- | --- | --- | --- |
| P0 | #751 | Regla aplicada sin LegalSource ni revisión independiente | Código nuevo: migración + API + política; **PG17 pendiente** |
| P0 | #751 | Overlap silencioso / snapshots mutables | Código endurecido en PR; pruebas PG17 pendientes |
| P0 | #775 | `sales.routes.ts` calcula IVA desde `req.body.lines[].taxRate`; posting contable no exige `ACTIVE LegalSource`, regla ni hash aplicado | **NO RESUELTO, BLOCK_MAIN** |
| P0 | #775 | `purchases.routes.ts` repite el mismo flujo de impuestos client-derived sin provenance jurídica del evento | **NO RESUELTO, BLOCK_MAIN** |
| P0 | #774 | `TaxpayerProfileVersion` sigue sólo en `DRAFT`; no hay política server-derived de activación, calendario, snapshot aplicado | **NO RESUELTO** |
| P0 | #776 | ISLR: preview puro, sin certificado real emitido/recibido, base normada por condición, anulaciones ni ledger | **NO RESUELTO** |
| P0 | #775 | IVA retenido: no existen aún certificados/reversos/versiones fiscales vinculados al posting comercial | **NO RESUELTO** |
| P1 | #785 | Resolver semántico integrado en posting de ventas/compras, pero falta PG17 multiempresa, reversos y validación contable exact-SHA del lote | Parcial existente; **NO VERIFIED** |
| P1 | #751 | El hash SHA-256 es una huella, no firma autenticada ni prueba autónoma de vigencia de la ley | Documentado; requiere revisión fuente real y control de acceso |
| P1 | #751 | La ruta legacy de captura crea borradores sin fuente legal; quedan inactivos y no sirven para emisión | **Comportamiento fail-closed intencional**, revisar migración de datos |

## Matriz mínima de regresión pendiente

1. **LegalSource / autoridad**: DRAFT sin review → 422; creator=self-review → 409; reviewer sin permiso → 403; hash incorrecto o tenant B → 422/409; reviewed source con regla malformada → 409. Rango UTC con inicio inclusivo y fin exclusivo.
2. **Activación**: reviewer y activator distintos, tres cuentas reales activas; dos activaciones concurrentes no duplican estado; overlap de dos reglas ACTIVE bajo PG advisory lock; supersession creciente sin ciclos; fuente REJECTED jamás ACTIVE.
3. **Snapshot**: emitir dos documentos con una regla validada; comparar hash legal y regla; subir versión y emitir después; lectura del documento antiguo sin reinterpretarlo; UPDATE y DELETE SQL rechazados aun cuando el caller conozca el ID.
4. **Ventas/compras IVA / ISLR**: regla ACTIVE obtenida en la misma transacción del evento; perfil ACTIVE del tenant derivado en servidor; `taxRate` enviado por UI no puede determinar posting; exact decimal / rounding, tasas cero o exento; roles AR/AP/VAT/withholding definidos por tenant y cuentas postables; balance Debe=Haber, idempotencia y crash rollback. Datos sintéticos.
5. **Certificados/reversiones**: creación por documento origen con unique/idempotencia, hash y período; 2º intento no duplica; nota de crédito/débito/reverso conserva historial y no doble efecto; period close rechaza mutaciones posteriores.
6. **Seguridad**: tenant A/B dos vías, principal sin permisos, sesión revocada/expirada, encabezado tenant manipulado, revisión de roles, RLS real con runtime no-superuser, audit trail en transacción, API y browser.
7. **Migraciones / release**: PostgreSQL17 de cero y upgrade con fixtures propios y limpieza incondicional; comparación de esquema; PR exact-SHA lint/typecheck/build/unit/E2E y checks protegidos; diferencia de bloqueo proveedor vs defecto de código.

## Autoridades existentes que no deben duplicarse

- `backend/src/modules/fiscal/fiscal.repository.ts`: regla/versiones/documento/close #629.
- `backend/src/modules/fiscal/fiscal-legal-source.repository.ts`: captura y revisión de fuentes #751.
- `backend/src/modules/accounting/accounting.service.ts` / `resolveSemanticPostingAccounts`: ledger y roles #637/#785; ventas/compras postean con transacción, pero aún falta conexión **legal-tax**.
- `FiscalDocumentRuleSnapshot`: evidencia histórica; no se reescribe ante ley futura.

## Criterio de seguridad

La revisión de una fuente capturada no valida automáticamente una alícuota; no preinstalar números del texto de una Gaceta. Se requiere comprobación de la disposición concreta, vigencia, supersession y alcance por persona, operación y jurisdicción. Hasta cerrar los hallazgos P0 y superar PostgreSQL 17 + browser + CI exact-SHA, mantener PR DRAFT y los 5 tickets OPEN en #661. Prohibido presentar el estado actual como cumplimiento SENIAT o release listo.

## Ampliación 2026-10-22: #774 / #775 / #776 / #785

### Código implementado en el mismo PR

- Perfil #774: migración nueva `20261022190000_issue_774_taxpayer_profile_activation` sobre tabla existente, actores distintos DRAFT→REVIEWED→ACTIVE, fuente y RIF server-derived, prohibición PostgreSQL UPDATE/DELETE de evidencia histórica y períodos ACTIVE superpuestos; endpoint `/fiscal/taxpayer-profiles/:id/review|activate`. Emisión `module=iva|islr|retiva` o `kind=withholding` exige perfil activo; almacena snapshot/hash en `FiscalDocument` dentro de la misma transacción; consulta histórica `/fiscal/documents/:id/taxpayer-profile`.
- Familias #775/#776: `fiscal-event-rule-family.ts` prohíbe aplicar ruleKey de otro tributo, períodos discordantes y fechas no explícitas en eventos fiscales regulados. IVA e ISLR permanecen sin tasas prefijadas.
- Plan fiscal `ve-tax-posting-plan.ts`: determinación *NON_POSTING*, semántica de roles, precisión BigInt por unidades menores, redondeo mitad-arriba, IVA/exento/no-sujeto, retención de IVA sobre IVA, ISLR simple sobre base y reverso de líneas originales. `/fiscal/tax-events/preview` exige fuente y regla ACTIVE, perfil ACTIVE de RIF real, cuentas de tenant postables y balance de diario. **No contabiliza ni emite certificado**.
- #785: nuevo rol `withholding_receivable` naturaleza normal deudora (migración aditiva de CHECK) y `withholding_payable` preexistente para retenciones por pagar. Códigos reales se obtienen del plan de cuentas del tenant; cero fallback.
- UI: vista de fuentes, regla activa, revisión perfil, controles reviewer/activator y simulación de Debe/Haber con casos de denegación. No se exponen privilegios financieros nuevos al cliente.
- Matriz legal [`VE_TAX_LEGAL_MATRIX_2026.md`](../architecture/VE_TAX_LEGAL_MATRIX_2026.md): 2025 SNAT/2025/000054 derogó 2015/0049; Decreto 1808 ISLR exige familias/beneficiario/sustraendo/UT. Enlaces de apoyo no reemplazan capturas oficiales/hashes reales.

### Evidencias focales realmente ejecutadas

Comando en copia local construida con archivos cuyos blobs SHA se compararon en GitHub:
`node --experimental-strip-types --test tests/fiscal_rule_governance_policy_v751.test.mjs tests/fiscal_rule_snapshot_integrity_v751.test.mjs tests/fiscal_rule_snapshot_integrity_contract_v751.test.mjs tests/taxpayer_profile_activation_v774.test.mjs tests/ve_tax_posting_plan_v775_v776.test.mjs tests/fiscal_event_rule_family_v775_v776.test.mjs`.

Resultado: **PASS 23/23**, 0 fallos, Node 22.16.0. Para resolver el import TS→JS del módulo `ve-tax-posting-plan.ts` en este entorno local sin `tsx` se utilizó únicamente un enlace de desarrollo `.js→.ts` en la copia aislada; **no forma parte del PR**. En CI ese test corre con `tsx` después de `npm ci`. Esto prueba la lógica focal, NO el workflow GitHub ni el backend compilado.

TypeScript focal estricto: **PASS**, con `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --typeRoots /usr/local/slides_js/node_modules/@types --types node` sobre los cinco módulos TS puros. Un primer chequeo sin los tipos Node disponibles falló por `node:crypto`/`Buffer`; se corrigió la invocación del entorno, no se silenció el error.

SHA Git verificados (comparando `git hash-object` local con `fetch_file` remoto):
- perfil política `7225ddc298a559f47d0377914ad2328908b5d5d5`
- perfil test `fd07eb2c674a5bb8da19b82c9d2dabf27a088b08`
- plan financiero `24e581670d29b1c37ba647dc2bcf7855e49cfb12`
- plan test `918b5806b2b878c0818ee5a93ef419282baed4cc`
- familia fiscal política `542d3b7f75adce538e60ccb8bee79e863e388a44`
- familia test `83d47694167ddcfe93ac04552a81f1db0a628429`

### Bloqueos P0 restantes (BLOCK_MAIN=yes)

1. **#775/#776**: los endpoints `sales.routes.ts` y `purchases.routes.ts` siguen tomando `taxRate` de líneas solicitadas por el cliente para registrar sus asientos actuales. El nuevo preview no sustituye posting real. Todavía falta determinación normativa desde documento + beneficiario/proveedor + pago, certificado inmutable con idempotencia, reversos auditados, reconciliación y retención por período.
2. **#776**: el DSL actual soporta razón simple; NO sustraendos, límites en UT, clasificaciones completas o acumulación ISLR. Exigir revisión jurídica humana por concepto y normas vigentes. No fingir completitud.
3. **#774**: falta calendario/obligaciones municipal/SENIAT y distinción estructurada auditada ordinario/especial, notificación de agente, persona/beneficiario; los campos de categoría siguen siendo humanos/propuestos. La activación implementada necesita PG17 y browser real.
4. **#751/#785**: migraciones de cero y upgrade PG17, runtime RLS A/B y autorizaciones/carrera/advisory locks, browser, build y contraste de tipos del monorepo: **NOT_EXECUTED** debido a checkout remoto/dns inaccesible y ausencia de PostgreSQL en este entorno. No false PASS.
5. Reconciliar rama con `main` (avanzó durante ejecución), volver a ejecutar los gates en **nuevo SHA exacto** y resolver conflictos si aparecen; el estado `mergeable=true` de GitHub no demuestra calidad ni DoD.

**Decisión: PR DRAFT / NOT_READY** hasta resolver bloqueo funcional #775/#776 y pruebas integrales. Nada tocó producción. No cerrar #751 #785 #774 #775 #776 ni quitar del backlog #661.


## Reingeniería de controles documentales — incremento posterior #1279

### Defectos de seguridad y atomicidad confirmados por revisión

1. **BYPASS-P0:** la ruta legacy `POST /fiscal/documents` permitía crear documentos tipo `invoice`/`withholding`/`tax_return` sin pasar por las autoridades `FiscalLegalSource`, `FiscalRuleVersion` ni `TaxpayerProfileVersion`.
   - **Corregido en código:** se limita a `module=fiscal` y `kind=supporting_document|other` con estado `external`, no `issued`; el frontend sólo ofrece esos valores. Intentos regulados → HTTP 422.
2. **SPOOF-P0:** los campos especiales `_taxpayerProfileHash`, `_ruleKeys`, `_effectiveAt`, `_fiscalModule` podían llegar desde un `payload` del usuario.
   - **Corregido en código:** una validación compartida falla ante campos reservados en los endpoints de soporte y de emisión; HTTP 422 con error determinista.
3. **CERT-P0:** la ruta genérica `/fiscal/documents/issue` admitía documentos `kind=withholding` con numeración `WITHHOLDING-` no homologada con la serie de 14 dígitos del artículo 16 de la Providencia SNAT/2025/000054, y sin modelo real de certificado.
   - **Corregido en código (fail closed):** se deniegan `withholding`, `tax_return`, `credit_note` y `debit_note` por esa ruta hasta que exista workflow específico con factura original, proveedor, acuse, auditoría contable y reverso. **No implica que el certificado esté implementado.**
4. **AUDIT-P1:** después de la confirmación de la transacción financiera se ejecutaba un `writeAudit` externo; su fallo podía producir HTTP 500 con documento ya emitido y duplicar evidencia en replays idempotentes.
   - **Corregido en código:** `tx.auditLog.create` participa en **la misma transacción** de secuencia, documento y snapshots; replay no genera segunda emisión. La captura de reglas ya auditaba dentro de la transacción, por lo que se retiró el audit duplicado del router. Soportes externos también registran documento+audit en una sola transacción.

### Evidencia técnica y pruebas

Prueba focal, sobre los trece archivos verificados por hash Git contra la rama remota en la misma sesión:

```sh
node --experimental-strip-types --test \
  tests/fiscal_rule_governance_policy_v751.test.mjs \
  tests/fiscal_rule_snapshot_integrity_v751.test.mjs \
  tests/fiscal_rule_snapshot_integrity_contract_v751.test.mjs \
  tests/taxpayer_profile_activation_v774.test.mjs \
  tests/ve_tax_posting_plan_v775_v776.test.mjs \
  tests/fiscal_event_rule_family_v775_v776.test.mjs \
  tests/fiscal_document_authority_v751.test.mjs
```

**Resultado PASS 28/28; fallos 0; Node v22.16.0** en copia aislada; el import `.js` del módulo TS de cálculo usa una equivalencia local como se documentó en la sección anterior. No afirmar que esto reemplaza `tsx` real o el backend completo.

TypeScript puro, con `--strict --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --typeRoots /usr/local/slides_js/node_modules/@types --types node` sobre seis módulos de política: **PASS**.

Hashes focales nuevos:
- `fiscal-document-authority-policy.ts`: **031cffc30c677ad30d26f3ebbd2a3e07e0b0d266**
- `fiscal_document_authority_v751.test.mjs`: **033896acc3a9731b9fd9156af82ce7266933c794**

**QA real pendiente (NOT_EXECUTED):**
- PG17: `qa/fiscal-authority-v561.test.ts` incluye pruebas para soporte externo, intento de emisión falsa, fuente/tenant, auditoría atómica del soporte y **exactamente un evento `fiscal.document.issued`** después de reintento idempotente. Son casos incorporados, **no ejecutados contra PostgreSQL**.
- No se pudo ejecutar `npm ci`, `npm run typecheck`, `npm run build:backend`, `npm run build:frontend`, DB from-zero/upgrade ni Playwright del proyecto; checkout de GitHub con DNS inaccesible y no hay servidor PostgreSQL en este entorno.
- La rama sigue con divergencia respecto a `main`; rebase/merge debe ser seguido de nueva prueba exact-SHA.

### Normativa contrastada

- **IVA SNAT/2025/000054**, Gaceta 43.171 del 16-07-2025, aplicable desde 01-08-2025: artículo 13 oportunidad pago/abono; art. 14 quincenas y calendario; art. 16 número AAAAMMSSSSSSSS y datos/formalidades del comprobante. Fuente transcrita secundariamente: https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2025-54 ; revisión del instrumento: https://ttpn.com.ve/?p=3498 . **Sin tasa automática ni aprobación de fuente en DB.**
- **SNAT/2025/000091**, calendario SPE/agentes para 2026 publicado inicialmente G.O. 43.273 y **reimpreso por error material en G.O. 43.283 del 23-12-2025**: https://accesoalajusticia.org/reimpresion-de-la-providencia-administrativa-que-establece-el-calendario-tributario-del-2026/ . No se deben generar fechas de vencimiento mediante reglas fijas o desde la primera edición.
- **ISLR Decreto 1.808** y modificaciones: los conceptos, UT, mínimos, sustraendos y condiciones del beneficiario siguen requiriendo mapeo legal humano. No simular que el ratio simple es suficiente.

**Definición de salida del lote:** no alcanzada. La contabilización comercial sigue tomando porcentajes del cliente; no hay certificados legales reales con unicidad, entrega y reverso; falta PG17 A/B y E2E. **BLOCK_MAIN=yes; conservar PR DRAFT y cinco issues abiertos**.


## Incremento de contabilidad real RET_IVA en el mismo PR (#775/#785)

**Implementado en código pero NO VERIFICADO EN POSTGRESQL:** se añadió un flujo persistente distinto del preview.

- **Migración:** `20261022213000_issue_775_withholding_application_ledger`: `FiscalWithholdingApplication` única por tenant/compra/tipo, referencias a compra y a asientos origen/aplicación/reverso, RLS+FORCE, trigger que impide editar base/IVA/retención y valida cruces tenant, ledger publicado, dos líneas, monto y reverso. Cualquier fallo SQL revierte todo el efecto.
- **`POST /fiscal/withholding-applications`**: sólo `purchaseInvoiceId`, IVA/RET_IVA ruleKeys e `Idempotency-Key`. Obtiene compra, proveedor, condiciones, perfil activo, hora de asiento AP original, monedas y reglas legales de DB en una transacción. Compara IVA calculado según versión aprobada con el IVA de la compra histórica; no confía en `taxRate` del request. Sólo compra completamente gravada VES/FX1, proveedor `ordinary`, agente `special_notified`; falla cerrado fuera de esos supuestos.
- **Libro mayor efectivo:** el asiento `tax` se publica Debe `ap` / Haber `withholding_payable` con roles reales postables del tenant, importe calculado BigInt y conciliación con cuenta AP e IVA originales. Auditoría y evidencia SHA en la misma transacción. **No emite comprobante fiscal oficial** ni prueba notificación SENIAT.
- **`POST /fiscal/withholding-applications/:id/reverse`**: inversa el asiento exacto histórico, no reaplica porcentajes actuales, referencia `reversalOfId` y actualiza estado histórico sólo a REVERSED con motivo/auditoría. Replay idempotente, segundo reverso prohibido.
- **Cancelación de compras:** `purchases.routes.ts` se coordina por `PurchaseInvoice FOR UPDATE` y rechaza una anulación mientras haya retención POSTED, exigiendo primero el reverso. Evita saldos de retención huérfanos.
- **Frontend:** `FiscalService`, `BackendApi` con generación central de claves idempotentes y pantalla Tributos permiten visualizar historial, aplicar con ID compra/reglas revisadas y reversar con motivo; estados de error/denegación explícitos.
- **QA PG17 escrito, NO ejecutado:** `qa/iva-withholding-application-v775.test.ts` emite compra real, crea fuentes y reglas revisadas con tres actores, activa perfil, prepara roles, aplica/reintenta, verifica asiento y único audit, bloquea doble aplicación/anulación prematura, reversa, después cancela la compra, protege hash y SQL inmutabilidad, y rechaza facturas con IVA manipulado. Se añadió al job PostgreSQL real de `.github/workflows/fiscal-authority-v561.yml`.
- **Pruebas focales nuevas escritas:** `tests/ve_iva_withholding_application_v775.test.mjs` cubre importes exactos, ventanas, cruces tenant, ausencia de origen contabilizado y source-VAT mismatch. **No confundir prueba escrita con PASS real**.
- **Documentación específica:** [`VE_IVA_WITHHOLDING_AP_LEDGER_V775.md`](../architecture/VE_IVA_WITHHOLDING_AP_LEDGER_V775.md), con ruta de transacciones, límites, fuentes normativas, reversos y runbook.

### Brechas que permanecen bloqueantes

1. El asiento interno de RET_IVA **NO es un certificado**. Faltan secuencia legal de catorce posiciones `AAAAMMSSSSSSSS`, constancia de entrega, identificación validada de notificación SPE, verificación de exclusiones, agrupación quincenal, corrección y enteramiento según SNAT/2025/000054 y calendario reimpreso 43.283.
2. **ISLR #776:** no hay emisión de retenciones real con mínimos/sustraendos/UT y conceptos; tampoco certificado o conciliación; aún no tiene DoD.
3. **IVA origen #775:** `sales.routes.ts` y `purchases.routes.ts` siguen calculando impuesto desde `taxRate` del cliente para la contabilización inicial. La nueva aplicación compara el resultado con una norma revisada, pero **no sustituye la validación del evento origen en todas las ventas/compras**.
4. **Perfil #774:** el estado especial es una declaración revisada de un operador, **no una consulta ni acreditación automática del SENIAT**. Falta calendario, condiciones materiales, certificados/acuse de calificación y manejo de personas/beneficiarios.
5. **#751/#785 y release:** migrations PG17 from-zero+upgrade y RLS tenant A/B, API real, build completo y browser no ejecutados. Revisar ejecución de CI y conservar exact-SHA. No se ha hecho merge ni deploy.

**Gate:** `NOT_READY/BLOCK_MAIN`. El último PASS focal documentado (28/28) precede a este módulo; no extenderlo a estas implementaciones sin ejecutar sus pruebas nuevas. Reconciliar branch con main y ejecutar todo antes de declarar cumplimiento.


## Revisión de seguimiento de la aplicación RET_IVA y cambios legales hasta 22-10-2026

**Código publicado** en el mismo PR #1279, **sin habilitar posting productivo por defecto**.

| Evidencia | Resultado |
| --- | --- |
| Implementación `FiscalWithholdingApplication`, debit AP/credit withholding, reverso, lock compra, RLS, dos cuentas distintas, FK ledger, source checks | IMPLEMENTED / PG17 NOT_EXECUTED |
| Endpoint `GET /reconciliation?period=`, conteo sin truncar, hash, saldos BigInt, comparación exacta de reversos, estado vacío bloqueado | IMPLEMENTED / PG17 NOT_EXECUTED |
| Registro de fuente jurídica y reglas/versiones completas, perfil tributario completo, hash de evento append-only | IMPLEMENTED / PG17 NOT_EXECUTED |
| Permisos diferenciados `fiscal.post_withholding` y `fiscal.reverse_withholding`, sólo Administrador Global inicialmente, UI con capacidades derivadas de servidor | IMPLEMENTED / RBAC HTTP NOT_EXECUTED |
| Interruptor `VE_FISCAL_INTERNAL_RETIVA_POSTING_ENABLED` apagado de fábrica; sólo `true` permite creación de asientos en PG17 QA disposable | IMPLEMENTED / integration NOT_EXECUTED |
| Dominio `tests/ve_iva_withholding_application_v775.test.mjs` (incluye flag) y `tests/ve_iva_withholding_reconciliation_v775.test.mjs` (reverso/cuentas/saldo cero) | WRITTEN, **NO PASS proclamado** |
| `qa/iva-withholding-application-v775.test.ts` con sesión/roles limitados 403, compra real con factura IVA legal fixture, deducción, replay, cancel-before-reverse rechazo, reverso, cancel-after-reverse permitido, reconciliación y SQL inmutable | WRITTEN, PG17 **NO EJECUTADO** |
| Última prueba focal previa de políticas #751/#774/#775 sin esta nueva aplicación y conciliación | PASS 28/28 en pasada anterior; **no extrapolable** |

### Normativa posterior que cambia criterios del perfil RIF

**SNAT/2026/00080** publicada en la Gaceta Oficial **43.435 del 12 de agosto de 2026**: modernizó inscripción y actualización del RIF por medio electrónico, eliminó vigencia de 3 años y exige exhibir RIF en facturas/documentos/libros, según texto accesible y boletín especializado. El sumario de la misma Gaceta deroga **SNAT/2024/000121** sobre proveedores de sistemas informáticos para emisión fiscal, **sin** implicar que toda facturación quede exenta de regulación. Véase `docs/architecture/VE_TAX_LEGAL_MATRIX_2026.md`. Estado legal: FUENTE CANDIDATA para captura primaria y revisión humana; **no insertada/validada ni activada en base productiva**.

**SNAT/2025/000054**, Gaceta 43.171 del 16-07-2025: se inspeccionó reproducción de la Gaceta con artículos 1 (agente especial notificado), 3 (exclusiones), 4–5 (porcentajes según supuestos), 13 (pago/abono: el primero), 14 (enteramiento) y 16 (comprobante formal). **El código de aplicación interno NO certifica condición de agente ni ausencia de las excepciones**; sólo permite caso conservador validado por fuentes revisadas del ERP y feature flag. Formularios/entrega/enteramiento siguen sin implementarse.

### Bloqueadores exactos para DoD del lote

- No hay PG17 verdadero desde cero y upgrade ni pruebas reales tenant A/B, concurso de operaciones, restore, frontend/browser y build completo de este SHA.
- IVA de factura original sigue dependiendo de la tasa de las líneas cliente; el flujo interno compara y deniega discrepancias, pero **no impone fuente fiscal en todos los orígenes**.
- ISLR #776 aún sin taxonomía de conceptos, UT, sustraendo mínimo, residencia y certificado/ledger legal; #775 certificado de retención IVA formal todavía ausente.
- RIF/notificación SPE reales no consultados contra SENIAT, y calendario 2026 reimpreso no aplicado con last digit; no fingir certificación.
- Rama atrás respecto a `main` y runs CI exact-SHA sin conclusión; PR permanece DRAFT / NOT_READY. **No hacer merge hasta cierre de requisitos y gates**.


## Evidencia ejecutada posterior — suite focal IVA RETIVA (#775)

Se reconstruyeron copias locales de **cuatro blobs fuente/test** y se contrastaron sus hashes Git exactos contra GitHub. En la primera ejecución de `tsc --strict` se detectó **TS2454: variables de IVA/retención utilizadas antes de asignación** en `ve-iva-withholding-application.ts` (5 diagnósticos). Fue corregido en el repositorio inicializando ambos acumuladores a cero antes del cálculo protegido por `try/catch`, que conserva rechazo fail-closed. **No ocultar ese primer fallo**.

Hashes Git después de la corrección, ejecutados en Node 22.16.0:
- `backend/src/modules/fiscal/ve-iva-withholding-application.ts`: `8c9232752deb3c9d126ae1c54a9072aeff17d9b9`
- `tests/ve_iva_withholding_application_v775.test.mjs`: `30698478e30f9ef9d535d8edc520165c562db249`
- `backend/src/modules/fiscal/ve-iva-withholding-reconciliation.ts`: `066bb710553bc7d18d56467d0c2b55c868de3068`
- `tests/ve_iva_withholding_reconciliation_v775.test.mjs`: `13e31ce770976312d242b276c20b5c5f83b687f1`

**Re-ejecución:** `node --experimental-strip-types --test tests/ve_iva_withholding_application_v775.test.mjs tests/ve_iva_withholding_reconciliation_v775.test.mjs` → **PASS 12/12, FAIL 0**.

**TypeScript:** `tsc --strict --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --typeRoots /usr/local/slides_js/node_modules/@types --types node` sobre `ve-iva-withholding-application.ts`, `ve-iva-withholding-reconciliation.ts`, `ve-tax-posting-plan.ts` y `fiscal-rule-governance-policy.ts` → **PASS**. Las copias usan sólo enlaces locales `.js→.ts` para resolver imports de módulos TS no compilados; el workflow real usa `tsx`.

**No confundir este resultado focal con CI global ni con pruebas SQL/API.** La base PostgreSQL 17, los joins del endpoint, la migración, RBAC HTTP y el frontend siguen `NOT_EXECUTED` en esta sesión. El último HEAD remoto y workflow deben verificarse otra vez tras el commit documental.

**Normativa nueva comprobada:** Gaceta Oficial N.º 43.435 del 12-08-2026, `SNAT/2026/00080` RIF y derogación de `SNAT/2024/000121` sobre proveedores de sistemas informáticos. Las clases y notificaciones reales SENIAT siguen sin validación externa; el post RETIVA está desactivado por defecto.
