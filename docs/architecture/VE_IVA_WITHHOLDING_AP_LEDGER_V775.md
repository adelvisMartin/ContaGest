# #775 · Aplicación contable interna RET_IVA sobre AP (sin certificado)

**Estado:** implementación nueva en PR #1279, pendiente de PostgreSQL 17 / E2E exact-SHA. Nunca utilizar como comprobante formal de retención ni como constancia de enteramiento ante el SENIAT.

## Alcance y autoridad

El nuevo flujo `POST /api/v1/fiscal/withholding-applications` enlaza exclusivamente **compras VES contabilizadas** con un asiento adicional: Debe `ap` / Haber `withholding_payable` por el importe retenido. Su integridad legal deriva de `FiscalLegalSource → FiscalRuleVersion ACTIVE → TaxpayerProfileVersion ACTIVE`; su integridad financiera deriva de la compra real y su asiento publicado `source=purchase`.

Los módulos existentes de facturación no se duplican. El nuevo soporte `FiscalWithholdingApplication` es una **autoridad de aplicación contable interna**, no tabla de comprobantes de IVA ni alternativa a `FiscalDocument`.

### Pasos y denegaciones

1. Aceptar exclusivamente `purchaseInvoiceId`, `ivaRuleKey`, `retentionRuleKey` y una `Idempotency-Key` segura. Los importes, sujetos, perfiles, fechas y asientos **no se toman del body del navegador**.
2. Adquirir `FOR UPDATE` de la factura de compra por `tenantId`. Rechazar proveedor de otro tenant/inactivo, duplicación de aplicación (incluidos otros idempotency keys), compra draft/cancelada, múltiples asientos originales o un asiento original reversado.
3. Reconocer el hecho contable desde `LedgerEntry.postedAt` del asiento de compras. Obtener perfil tributario `ACTIVE` del RIF real y exigir categoría revisada `special_notified`; proveedor persistido como `ordinary`. **No implica que se haya comprobado una notificación real SENIAT**: el operador debe aportar evidencia normativa y de calificación revisada antes del uso legal.
4. Leer IVA `ACTIVE` al `PurchaseInvoice.issueDate` y RET_IVA `ACTIVE` al `LedgerEntry.postedAt`; rechazar faltas, solapamientos, fuentes sin `REVIEWED`, hashes manipulados y denominadores inválidos. No usar códigos ni porcentajes de UI como autoridad.
5. Perfil de alcance conservador: una sola alícuota efectiva, compra completamente gravada, VES libro funcional, FX exactamente 1, categoría ordinaria sin excepción. El IVA declarado históricamente debe coincidir **céntimo a céntimo** con el cálculo de la regla revisada sobre el subtotal. Retención sobre ese IVA, BigInt, round-half-up. Fuera de este perfil, 422 (no aproximar).
6. Resolver roles semánticos `ap`, `vat_input` y `withholding_payable` sobre cuentas activas/postables del tenant. Verificar AP y IVA del asiento original contra importes de la compra, asentar Debe AP / Haber retención por pagar y `Σ debe=Σ haber`, `posted=true`.
7. En **la misma transacción**: contabilización, evidencia canónica JSON + hash SHA-256, FK compra/asiento, fila append-only `FiscalWithholdingApplication`, auditoría `fiscal.retiva.applied` e idempotencia. SQL trigger revalida tenancy de origen/asiento, `posted`, tipo de asiento y monto de las dos líneas. No crear certificación fiscal falsa.
8. `POST /:id/reverse` exige período abierto, motivo mínimo 15 caracteres y clave idempotente; copia el asiento inverso desde el histórico publicado, marca el registro `REVERSED` preservando evidencia original, referencia `reversalOfId` y audita atómicamente. No se permite nuevo reversal con otra clave.
9. `PATCH /purchases/:id/cancel` bloquea mientras haya una aplicación `POSTED`. Usa la misma fila `PurchaseInvoice FOR UPDATE` que la retención, serializando ambas rutas. Una vez reversada RET_IVA, el workflow de cancelación de compra existente puede inversar la compra.

### Contratos HTTP

| Método y ruta | Resultado |
|---|---|
| GET `/fiscal/withholding-applications` | Hasta 100 registros del tenant; importes bigint serializados como **cadenas exactas**; integridad SHA recomputada |
| GET `/fiscal/withholding-applications/:id` | Un histórico con referencia a compra y ledger; sin fuga entre tenants |
| POST `/fiscal/withholding-applications` | 201, `mode=INTERNAL_AP_APPLICATION_NOT_CERTIFICATE`; body sólo UUID compra y dos ruleKeys; requiere `Idempotency-Key` |
| POST `/fiscal/withholding-applications/:id/reverse` | Asiento inverso en período indicado y abierto, motivo 15–500 caracteres, `Idempotency-Key` |
| PATCH `/purchases/:id/cancel` | 409 `RETIVA_ACTIVE_APPLICATION_CANCEL_DENIED` hasta reversar retención |

El módulo Tributos incorpora selección visible de reglas `ACTIVE`, formulario de ID compra, listado de aplicaciones, motivo/período para reversar y estados error/espera. El cliente genera claves mediante `crypto.randomUUID` usando el servicio central `BackendApi`.

### Fundamentación normativa — no certificación

- Providencia SENIAT **SNAT/2025/000054**, Gaceta 43.171, 16-07-2025, con vigencia desde 01-08-2025. Art. 1: condiciones del agente especial; Art. 3: excepciones; Art. 4 y 5: supuestos de retención parcial/total; Art. 13: pago o abono en cuenta (el primero); Art. 14: períodos; Art. 16: comprobante y numeración `AAAAMMSSSSSSSS`. Fuente para lectura y verificación con Gaceta oficial: https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2025-54 (la página muestra un error de año en su encabezado).
- Calendario fiscal 2026 `SNAT/2025/000091`, reimpresión Gaceta 43.283 23-12-2025. Fuente secundaria: https://iusdata.com/seniat-calendario-sujetos-pasivos-especiales-agentes-de-retencion-ano-2026-reimpresion/
- Las referencias web **NO equivalen** a un documento oficial capturado ni a aprobación legal. La calificación del agente y la condición del proveedor deben verificarse contra SENIAT. Las excepciones, ajustes, enteramientos y entrega del comprobante **NO se deducen** de un campo `special_notified`.
- Sin modelo formal de comprobante con secuencia de 14 caracteres, datos del agente/proveedor, factura/control, soporte entregado/acuse, fecha real y correcciones, **NO marcar como certificado emitido**; registro sólo contable interno.

## QA / pruebas y release

- Política pura: `tests/ve_iva_withholding_application_v775.test.mjs`. Comprueba reconciliación exacta, cálculo íntegro, cross-tenant, monedas no admitidas, períodos, estado cancelado y errores.
- PostgreSQL 17/API: `qa/iva-withholding-application-v775.test.ts` prueba compra real → fuente reviewed → IVA/RETIVA ACTIVE → perfil independiente ACTIVE → mapeos AP/IVA/retención → asiento posting → replay sin doble asiento → duplicado con otra clave 409 → bloqueo cancelación de compra → reverso → cancelación → evidencia igual, SQL UPDATE/DELETE negados → IVA cliente discrepante 422.
- Workflow `.github/workflows/fiscal-authority-v561.yml`: suites `tsx`, PG17 `from-zero`, seed, fiscal QA, `typecheck` y `build:backend`. **No ejecutado en este entorno** (GitHub Actions sin conclusión de aprobación; no PG17 local disponible); no declarar resultado PASS hasta obtener logs y ejecución exact-SHA.
- Simulaciones `ve-tax-posting-plan.ts` IVA/ISLR continúan independientes del ledger real; ISLR con umbrales, UT/sustraendo, certificados formales y retenciones recibidas siguen sin integración completa.
- La facturación general de `sales.routes.ts` y `purchases.routes.ts` sigue calculando `taxRate` desde renglones del request antes de la comparación jurídica. **Este incremento controla la contabilización secundaria de RETIVA contra el IVA realmente registrado; NO declara homologado el cálculo original de facturación**.

### Operación y migración

Migración aditiva `20261022213000_issue_775_withholding_application_ledger/migration.sql`, con RLS/FORCE RLS, permisos de columna, trigger antifraude, unicidad por tenant/compra/tipo, historial append-only y referencias ledger. No ejecutar migraciones ni pruebas sobre producción. Exigir respaldo, drill PG17 from-zero/upgrade, RLS dos tenants y reconciliación antes de merge. Si el sistema no cuenta con ambas reglas aprobadas o se trata de una excepción legal, **denegar** y gestionar mediante revisión fiscal/contable fuera de esta ruta.


## Conciliación interna real de retenciones

`GET /fiscal/withholding-applications/reconciliation?period=AAAA-MM`, permiso `fiscal.read`, consulta transaccional de sólo lectura con `tenantId`. Devuelve hasta 1000 aplicaciones; superar el límite retorna 413 en vez de declarar completos datos truncados.

Invariantes de cada aplicación:
- Compra origen y asiento de compra tienen vínculo tenant propio; origen `posted`.
- `ledgerEntryId` publicado `source=tax` y `sourceId` de la aplicación; dos líneas contables en cuentas **distintas**.
- `ΣDebe` y `ΣHaber` expresados en céntimos enteros exactos, ambos iguales a `withheldMinor`.
- `POSTED` no tiene reverso ni puede tener `PurchaseInvoice.status=cancelled`.
- `REVERSED` apunta a un ledger posted cuyo `reversalOfId` es exactamente el asiento aplicado; contiene dos líneas con **mismas cuentas y Debe/Haber intercambiados**, no sólo totales balanceados.
- SHA de `evidence` se vuelve a computar y compara con `evidenceSha256`; cualquier diferencia deja reporte bloqueado.
- El agregado entrega `grossWithheldMinor`, `reversedMinor`, `netOutstandingMinor`, `issueCount` y razones específicas por fila (sin punto flotante ni números fabricados).

Estados: `RECONCILED_INTERNAL_ONLY`, `BLOCKED_INTERNAL_RECONCILIATION` o `BLOCKED_EMPTY_PERIOD`. Incluso `RECONCILED_INTERNAL_ONLY` devuelve `officialCertificateVerified:false` y `externalFilingVerified:false`: **no autoriza** presentar ni enterar impuestos. La página Tributos permite consultar el período e inspeccionar alertas. Pruebas puras en `tests/ve_iva_withholding_reconciliation_v775.test.mjs`, ejecutadas por el workflow fiscal con `tsx`; prueba PostgreSQL real de estado antes/después en `qa/iva-withholding-application-v775.test.ts`.

## Gate de liberación

El workflow ahora depende de `npm ci`, migración canónica PostgreSQL 17 desde cero, seed aislado, QA HTTP con sesión/tenant/ledger, tests focales `tsx`, `typecheck` y `build:backend`. Los tests están incorporados; **sin un resultado real en GitHub Actions, todo lo anterior está implementado pero no es evidencia PASS**. Validar además upgrade PG17 y browser E2E exact-SHA. La consulta de conciliación interna no equivale a libros de compra certificados ni a conciliación SENIAT.


## Fail-closed release switch

El endpoint de creación del asiento `POST /fiscal/withholding-applications` ahora exige `VE_FISCAL_INTERNAL_RETIVA_POSTING_ENABLED=true`. **Por defecto está deshabilitado** y responde `503 RETIVA_POSTING_NOT_ENABLED`; no basta que un actor tenga permiso o que existan reglas ACTIVE. No habilitar en producción sin acuerdo del responsable contable, verificación efectiva de condición SPE/agente, elegibilidad y exclusiones del proveedor, QA PG17 de dos tenants, balances, restauración, E2E y revisión del texto normativo aplicable.

El workflow fiscal habilita el switch **sólo en la base PostgreSQL 17 desechable**, sin modificar los entornos productivos. La lectura de históricos y el reverso auditado siguen accesibles cuando el switch esté apagado para posibilitar la corrección reversible de operaciones existentes. Esto es una barrera adicional, no una acreditación legal ni garantía de cumplimiento.


## Seguridad adicional de roles y snapshot histórico

- La autoridad para crear asientos de retención es ahora **`fiscal.post_withholding`**. Para inversarlos se exige **`fiscal.reverse_withholding`**. Ninguna se hereda automáticamente de `fiscal.manage_documents`. La migración aditiva asigna inicialmente ambas **sólo al rol Administrador Global**; la autorización del backend consulta roles/permisos del tenant en cada request. La pantalla distingue post y reverse a partir de `/fiscal/periods.capabilities`, sin asumir acceso por visibilidad del botón.
- QA real pendiente: el test PG17 crea un actor adicional con únicamente `fiscal.manage_documents`, sesión persistida y token firmado, y verifica **HTTP 403** al intentar post y reverse. La cobertura propuesta también prueba idempotencia, SQL inmutable y aislamiento básico de IDs.
- El JSON aplicado no guarda sólo `ruleHash`: incluye **las definiciones revisadas completas** de IVA y RET_IVA, versión, fechas UTC, referencia documental y `legalSourceSha256`; incluye además RIF, jurisdicción, categoría, actividades y fuente del perfil `ACTIVE`. El `evidenceSha256` se calcula sobre todo el objeto en la misma transacción y se revisa en lecturas posteriores, sin usar tasas de versiones futuras.
- Se exige que `ap.accountCode !== withholding_payable.accountCode`; de lo contrario se rechaza antes del asiento. El trigger PostgreSQL también exige dos líneas y **dos cuentas distintas**, origen `source=purchase` posted y asiento aplicado `source=tax` posted, conciliando ambos importes con la aplicación.
- La conciliación por período compara las cuentas/valores originales con los valores intercambiados y requiere exactamente dos líneas en el reverso. No se declara conciliado un período vacío.

El switch `VE_FISCAL_INTERNAL_RETIVA_POSTING_ENABLED` continúa deshabilitado por defecto, incluso si un usuario tiene los dos permisos. Requiere un opt-in exacto `true` y no autoriza emisión de certificados, solo libro mayor interno.
