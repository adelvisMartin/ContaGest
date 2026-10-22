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
