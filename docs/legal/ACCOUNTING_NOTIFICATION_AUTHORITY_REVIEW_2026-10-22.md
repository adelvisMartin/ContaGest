# ContaGest · Revisión legal, de seguridad y trazabilidad — #637/#773/#849/#852/#854

**Fecha de revisión:** 2026-10-22. **Naturaleza:** matriz ingeniería + normativa; **no dictamen ni certificación fiscal**. 
**Candidato original PR #1282:** `7af1e338ee528887e23848786bda2da0b22990f2`. Cualquier SHA nuevo requiere regenerar evidencia. Las fuentes externas abajo son información pública consultada, no pruebas de adopción del SENIAT.

## Normativa identificada, impacto técnico y límites
| Fuente identificable | Hecho documentado | Mapeo de implementación | Qué NO significa |
| --- | --- | --- | --- |
| Código de Comercio venezolano (1955), arts. 32, 34–37, WIPO Lex | Diario, Mayor, Inventarios; registro temporal y correcciones por asiento distinto, no sobrescrituras | #637: inmutabilidad post, reverso compensatorio, cierre auditado, trazabilidad actor/período; #852 ledger de derechos **no sustituye** libros contables | Un sistema de asientos no acredita libros rubricados ni cumplimiento integral de conservación |
| Ley de IVA, texto G.O. 6.507 Extraordinario (2020), arts. 54–56 | Facturación y registros fiscales diferenciados; separar IVA cuando sea aplicable | #637 y #785: plantilla/roles contables por evento y clasificación, conservar documentos/snapshots | No fijar alícuotas, aplicabilidad, IGTF o retenciones por copia de un ejemplo |
| Providencia SNAT/2024/000102, G.O. 43.032 (19/12/2024) y remisiones a SNAT/2011/0071 y SNAT/2018/0141 | Condiciones para ciertos sujetos obligados a emitir facturas y documentos fiscales mediante medios digitales | Fiscal #751/#775/#776: provenance, fecha efectiva, perfil y soporte de emisión autorizado; en #637 preservar contabilización asociada al documento | Una plantilla de notificación o recibo comercial **no es** factura fiscal autorizada |
| Constitución venezolana, art. 60, y Ley de Protección a la Privacidad de las Comunicaciones (G.O. 34.863, 1991), art. 1 | Vida privada/confidencialidad de comunicaciones | #854: minimización PII, no revelar destinatarios, textos, secretos, tokens o proveedor en timelines; consentimiento y entrega comprobable; cross-tenant | No confundir política de privacidad con autorización de Meta/WhatsApp para enviar |
| Decreto con Fuerza de Ley sobre Mensajes de Datos y Firmas Electrónicas (G.O. 37.148, 28/02/2001), art. 1 | Eficacia jurídica general de mensajes de datos/firma electrónica sujeta a requisitos | Trazabilidad de eventos, no repudio y evidencia de recepción solo con acuse verificable | HTTP 200 de proveedor no es acuse de entrega, firma válida ni certificado |

## Fuentes de revisión (consultadas 2026-10-22)
- Código de Comercio, texto WIPO Lex: https://www.wipo.int/wipolex/es/legislation/details/4008
- Ley de IVA G.O. 6.507/2020: https://www.joseaugustorodriguezm.com/wp-content/uploads/2022/06/IVA.pdf
- SNAT/2024/000102 (transcripción de Gaceta): https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2024-102
- Análisis jurídico de SNAT/2024/000102 (publicación 2025-01-16): https://accesoalajusticia.org/regulacion-del-uso-de-medios-digitales-para-la-emision-de-facturas-y-otros-documentos/
- Constitución, art. 60: https://venezuela.justia.com/federales/constitucion-de-la-republica-bolivariana-de-venezuela/titulo-iii/capitulo-iii/
- Ley de Protección a la Privacidad de las Comunicaciones: https://docs.venezuela.justia.com/federales/leyes/ley-sobre-proteccion-a-la-privacidad-de-las-comunicaciones.pdf
- Decreto Ley de Mensajes de Datos/Firmas Electrónicas: https://venezuela.justia.com/federales/decretos/decreto-n-1-204/gdoc/

**Limitación de vigencia:** material de Gaceta reproducido por terceros y normas históricas; confirmar reformas, derogaciones, providencias complementarias y sujeto pasivo ante texto oficial/SENIAT y asesoría fiscal local antes de habilitar emisión certificada o cálculos legalmente vinculantes. No se introducen nuevas tasas/roles fiscales productivos con esta revisión.

## Hallazgos técnicos y plan de verificación
1. **#637 / autenticación QA:** la prueba de persistencia firmaba JWT sin `sid` aunque `requestContext` exige `UserSession` viva desde endurecimiento. Mantener verificación real; usar el fixture de sesiones firmado, limpieza y negativo rol. No desactivar protección.
2. **#637 / contratos CRUD:** test histórico intenta `tenantId` arbitrario, mutar stock/saldo/período por factory y borrar entidades protegidas. Nueva caracterización exige negativos 422/405, sin rebajar allowlist.
3. **#637 / cierre↔posting:** los bloqueos de cierre y post deben coordinar en PostgreSQL en todas las rutas; el lock actual de período por sí solo no certifica carrera ni RLS. Mantener #637 OPEN.
4. **#849 / #852:** los validadores puros rechazan arrays dispersos e historiales con huecos; todavía no existen migraciones, relaciones tenant/staff/location ni consumo/booking en una transacción. Mantener ambos OPEN.
5. **#854:** `NotificationLog` preserva metadatos sin PII y separa `provider_accepted` de `delivered`. El envío directo anterior carece de outbox duradero, consentimiento verificado y dedupe completo. Antes de producción: integrar #853/#772 con auditoría, retries y webhook firmado. **No afirmar entrega por HTTP 200.**
6. **#773:** exige navegadores, a11y, temas y rutas. Una matriz documental no acredita esas verificaciones.

## Evidencia / runbook
- Tests nativos: `npm ci` (Node 22 / npm workspaces), `npm run typecheck`, `npm run build`, `npm test`, `node --test tests/qa_real_backend_sid_contract_v637.test.mjs`.
- PG efímero: `npm run test:backend:persistence:real`, `npm run test:backend:financial:decimal:real`, transacciones concurrentes en PG17 con tenant A/B y aislamiento RLS; nunca usar DB compartida.
- UI: `npm run test:browser:58`, `npm run test:browser:a11y`, `npm run test:browser:contrast`, Chrome/Firefox/WebKit según CI.
- Clasificación obligatoria exact-SHA: PASS/FAIL/BLOCKED/NOT_EXECUTED; discrepancias antiguas de QA no se silencian y un merge no es aprobación legal.

**Rollback:** revertir commits del PR 1282 con revisiones por ámbito. No se modificó schema ni datos productivos ni se habilitaron métodos alternativos de autenticación.

## Matrix de tests de caracterización incorporada al backend test (último incremento)

El script `backend npm test` ahora incluye las regresiones nativas de #637 (servicio/reverso), #773 (touch/focus CSS), #849 (pasos ordenados), #852 (eventos contiguos) y #854 (redacción, estado no verificado y respuesta del proveedor). Se ejecutan con el Node 22 de CI y **no** sustituyen PG17/API/browser ni demuestran la Definition of Done. Los contratos de nuevos intentos permanecen scope limitado; ninguna suite se deshabilitó.

## Política de WhatsApp no autorizado — revisión legal/técnica

La ley venezolana de protección de privacidad de las comunicaciones (G.O. 34.863, art. 1) protege confidencialidad; por sí sola no determina todas las exigencias de opt-in que aplican bajo políticas del proveedor. Sin prueba de consentimiento ni vínculo server-side con destinatario, el endpoint automático queda HTTP 503 por diseño y se mantiene el enlace de acción manual separado. Fuentes verificadas: https://venezuela.justia.com/federales/leyes/ley-sobre-proteccion-a-la-privacidad-de-las-comunicaciones/gdoc/ y https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2024-102 .

## Fuentes oficiales y alcance por artículo (verificado 2026-10-22)

- **Código de Comercio, arts. 32-37:** contabilidad en castellano, Diario/Mayor/Inventarios y asientos correctores distintos: https://www.wipo.int/wipolex/es/legislation/details/4008 . El soporte de asientos contables electrónicos no reemplaza sin más la legalización/formalidades de libros (art. 33).
- **SNAT/2024/000102, G.O. 43.032, arts. 3, 7, 12, 29:** no todo sujeto puede autodeclarar factura digital conforme; existen autorización/sujeto comprendido, número de control de imprenta digital autorizada, RIF/domicilio, identificación del documento, fechas, desglose de impuestos y requisitos formales. https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2024-102 . **Los resúmenes de pedido, tickets de prueba y mensajes WhatsApp no deben rotularse facturas digitales fiscales.** No generar numeración de control ficticia ni declarar aprobación SENIAT automática.
- **Ley sobre Protección a la Privacidad de las Comunicaciones, G.O. 34.863/1991, art. 1:** privacidad/confidencialidad de comunicaciones: https://venezuela.justia.com/federales/leyes/ley-sobre-proteccion-a-la-privacidad-de-las-comunicaciones/gdoc/ . No equivale por sí sola a consentimiento comercial ante Meta; esa fuente de autorización debe documentarse separadamente.
- **PostgreSQL 17, bloqueos advisory:** los locks de transacción se liberan al finalizar commit/rollback y sólo protegen a escritores que los adquieran: https://www.postgresql.org/docs/17/explicit-locking.html y https://www.postgresql.org/docs/17/functions-admin.html . No deben tratarse como barreras SQL universales para clientes que las omitan.

Antes de declarar cumplimiento: contraste de textos consolidados vigentes con asesora contable/jurídica venezolana para el perfil fiscal de cada contribuyente; escenarios facturación (máquina fiscal vs medios digitales autorizados), registros/providencias y trazabilidad/retenibilidad conforme al caso. Estado normativo de producto: **NO CERTIFICADO**.

## FE DE ERRATAS NORMATIVA — vigencia verificada el 2026-10-22 (lectura obligatoria)

**SNAT/2024/000121 ESTÁ DEROGADA**, no vigente. La **SNAT/2026/00084** publicada en G.O. N° **43.435 del 12/08/2026** la derogó expresamente (arts. 1 y 2; vigencia el día de publicación). Por tanto, **NO** exigir homologación o autorización previa del *proveedor de software* invocando la providencia 000121 derogada. Tampoco declarar a ContaGest "homologado" o "certificado" sobre esa norma.

El régimen distinto de **emisión digital de facturas** de la providencia **SNAT/2024/000102**, G.O. 43.032 (19/12/2024), se analiza separadamente: art. 17 (solicitud de autorización de ciertos emisores) y art. 18 (integridad, trazabilidad, imprenta digital autorizada, conservación/consulta de hasta 10 años y contingencias en el supuesto regulado). La derogatoria de la 000121 **no deroga por sí misma** la 000102, ni la 0071/2011, ni sustituye el análisis por tipo de contribuyente y canal de emisión.

**Implicación de arquitectura:** desagregar `providerAuthorizationRequired=false_for_repealed_000121` de las validaciones **por contribuyente/documento** bajo normativa fiscal aplicable. **No** emitir numeraciones fiscales ni recibos presentados como facturas por defecto. **No** bloquear todos los módulos contables en nombre de 000121: el registro contable no equivale a emisión de documento fiscal. No introducir tasas ni reglas fiscalmente vinculantes sin provenance/effective-date. Esta revisión no es asesoría tributaria individual y exige verificar texto consolidado/gaceta oficial antes del despliegue fiscal.

**Fuentes corroboradas (22-10-2026):**
- G.O. 43.435 (sumario, 12/08/2026): https://www.gacetaoficial.org/2026-08-12-gaceta-oficial-venezuela-43435
- Texto SNAT/2026/00084 (art. 1 derogatoria y art. 2 vigencia): https://tugacetaoficial.com/leyes/providencia-administrativa-snat-2026-00084-derogatoria-de-normas-deproveedores-de-sistemas-informaticos-utilizados-para-la-emision-de-facturas-y-otros-documentos-fiscales/
- Revisión jurídica Acceso a la Justicia (31/08/2026): https://accesoalajusticia.org/seniat-permite-el-uso-de-cualquier-sistema-contable/
- Análisis Victum Legal (vigencia, distinción): https://victum.legal/seniat-deroga-el-regimen-de-homologacion-y-autorizacion-de-los-proveedores-de-sistemas-informaticos-de-facturacion/
- Texto independiente SNAT/2024/000102, arts. 17-18: https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2024-102

## Contrastación adicional con Gaceta 43.032 (2026-10-22)

En la reproducción integral de Gaceta Oficial 43.032 consultada: https://galac.com/Gacetas/GO_43032-SNAT2024000102_Uso-de-medios-electronicos-para-facturacion.pdf, los artículos 3–5 distinguen sujetos autorizados, comercio exclusivamente electrónico y operaciones electrónicas concurrentes con máquinas fiscales; art. 6 ordena separar en el Libro de Ventas las operaciones relevantes; art. 7 exige, entre otras condiciones, numeración consecutiva única, RIF/domicilio del emisor, número de control asignado por imprenta digital autorizada y fecha/hora de emisión. La interpretación doctrinal de implementación transitoria (1 de marzo de 2025 para sujetos obligados) está en https://accesoalajusticia.org/regulacion-del-uso-de-medios-digitales-para-la-emision-de-facturas-y-otros-documentos-fiscales/. Esta revisión **no** prueba que las facturas ContaGest satisfagan estos requisitos ni resuelve cuáles contribuyentes están obligados; la activación de emisión debe ser fail-closed por perfil fiscal/medio autorizado, nunca asumir que cualquier PDF/WhatsApp tiene valor fiscal.

La evaluación adicional de código en este HEAD detectó y corrigió: (#854) regex de horas de silencio con doble escape, ahora acepta 00:00..23:59; (#852) un `Invalid Date` que habría eludido comparación de ventanas cuando el servicio se invoca fuera del parser HTTP. Se añadieron y ejecutaron checks aislados; quedan pendientes suite npm/PG17/Playwright exact-SHA.
