# Matriz jurídica Venezuela — IVA, retención de IVA, ISLR y perfil tributario

Fecha de corte de la **investigación documental:** 2026-10-22. Los textos normativos requieren comprobación de vigencia para cada fecha de hecho imponible. **No es un dictamen jurídico ni una certificación SENIAT.**

## Instrumentos comprobados y jerarquía de confianza

| Área | Instrumento y fecha | Fuente consultable | Decisión de ingeniería |
| --- | --- | --- | --- |
| IVA | Ley del IVA / reforma parcial, Gaceta Oficial extraordinaria N.º 6.507, 29-01-2020 | Texto Gaceta y repositorio institucional: https://www.asambleanacional.gob.ve/ ; extracto https://satdc.gobernacion.web.ve/wp-content/uploads/2022/12/COT-Reforma-Tributaria-2020-GO-6507-E-1-1.pdf (enlace puede no estar disponible) | El art. 27 contempla variabilidad de alícuota; la franja de ley **no** es una tasa efectiva. Exigir versión concreta vigente/acto ejecutivo revisado. |
| Retención de IVA | Providencia SENIAT SNAT/2025/000054, Gaceta Oficial N.º 43.171, 16-07-2025; efecto indicado desde 01-08-2025; derogación SNAT/2015/0049 | Transcripción para lectura jurídica (no autoridad primaria): https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2025-54 ; comentario técnico independiente https://insightplus.bakermckenzie.com/ | Agente exige clasificación/notificación; incluye determinados sujetos personales con firma personal, además de supuestos previos; revisar exclusiones, comprobantes y momento antes de aplicar retención. |
| ISLR | Decreto N.º 1.808, 23-04-1997, Gaceta Oficial N.º 36.203, 12-05-1997, Reglamento Parcial de Retenciones; consultar modificaciones | Copia académica: https://www.cidtct.uc.edu.ve/wp-content/uploads/2025/05/Decreto-1808-ISLR.pdf | Configurar concepto + clase beneficiario/residencia + base imponible + mínimos/sustraendo/UT + event date. El DSL de razón simple **no basta** para todos los conceptos. |
| ISLR ley de base | Reforma parcial LISLR Decreto N.º 2.163, Gaceta Oficial Extraordinaria N.º 6.210, 30-12-2015 | Fuente institucional Asamblea Nacional: https://www.asambleanacional.gob.ve/storage/documentos/leyes/decreto-n0-2163-mediante-el-cual-se-dicta-el-decreto-con-rango-valor-y-fuerza-de-ley-de-reforma-parcial-del-decreto-con-rango-valor-y-fuerza-de-ley-de-impuesto-sobre-la-renta-20211019151632.pdf | Contrastar con decreto reglamentario y providencias aplicables; no derivar clasificación del navegador. |

### Registro de confianza / por qué no cargar alícuotas

Los enlaces secundarios documentan y orientan búsqueda, pero el administrador de ContaGest debe capturar el ejemplar primario o constancia validada, calcular SHA-256 del **contenido real**, referenciar disposición/artículo y fechas, someterlo a revisión independiente, y activar la definición exacta solo tras aprobación. `FiscalLegalSource.REVIEWED` es aprobación del documento capturado; **no implica** tasa autorizada. Las tasas en JSON no pueden tomarse de la tabla de una asesoría sin comprobación del instrumento normativo. Una norma publicada antes de 2025 puede haber sido derogada: no basta ordenar versiones por número.

### Análisis operativo con efectos contables

- **IVA ventas**: determinar obligación y alícuota de cada operación con la regla vigente y perfil; separación gravado/exento/no sujeto; snapshot antes del posting.
- **IVA compras**: agente de retención debe estar notificado/clasificado; proveedor ordinario, operación no exceptuada; retención calculada sobre impuesto de la factura conforme a disposición revisada; registro de comprobante original sin duplicidad.
- **ISLR**: la retención puede depender de concepto, beneficiario, domicilio, residencia, base y mínimos expresados en unidades tributarias. Los límites y sustraendos exigen un DSL ampliado, revisado por categoría; **prohibido aproximar con una razón simple**.
- **Débito/crédito y reversos**: AP/AR/VAT/withholding payable/receivable se resuelven mediante cuentas semánticas del tenant. El balance de un **preview** no equivale a contabilizar un evento; al reversar, copiar montos históricos, no tasas actuales.
- **Calendarios y certificados**: vigencia local, quincena o plazo aplicable deben salir de disposición revisada. La emisión digital formal de comprobantes puede requerir requisitos/autorización diferenciados.

## Bloqueos legales y técnicos hasta cierre real de #775 y #776

1. No hay archivo primario completo con huella registrada y revisión humana de cada clase IVA/ISLR; web search **no realiza revisión legal oficial**.
2. `RATIO_MINOR_UNITS` solo cubre casos simples, no mínimo en UT/sustraendo/acumulación de ISLR ni exenciones/residencia específicas. Las tablas base del usuario no están homologadas jurídicamente.
3. El endpoint `/fiscal/tax-events/preview` devuelve **NON_POSTING_PREVIEW**: requiere perfil ACTIVE + regla ACTIVE + fuente REVIEWED + roles semánticos válidos, pero no genera asiento, certificado ni efecto financiero.
4. Los posting existentes de `sales.routes.ts` y `purchases.routes.ts` todavía toman `taxRate` del request comercial. No pretender que representan cálculos legales vigentes.
5. Requiere pruebas PostgreSQL 17 desde cero/upgrade, HTTP de sesión, tenant A/B, conciliación, browser y evidencia exact SHA antes de merge.

## Criterio de aceptación futuro

No emitir comprobante de retención ni afectar ledger hasta que cada línea tenga determinación normativa, perfil/beneficiario, impuesto exacto, asiento equilibrado y certificado idempotente en **la misma transacción**; reverso auditado, nunca borrado histórico, y comprobación completa con fixture sintético y revisión normativa humana.


## Actualización de fuentes verificadas (22-10-2026)

### Calendario SENIAT 2026 — NO usar solo la edición original

- Providencia **SNAT/2025/000091**: calendario para Sujetos Pasivos Especiales y agentes de retención, publicado inicialmente en Gaceta Oficial N.º **43.273 del 09-12-2025**.
- **Reimpreso por error material** en Gaceta Oficial N.º **43.283 del 23-12-2025**; debe consultarse esta última versión para las fechas 2026, distinguiendo obligación, período, tipo de contribuyente y último dígito del RIF.
- Índice oficial de gacetas (metadatos): https://www.gacetaoficial.gob.ve/gacetas/43273
- Referencia de reimpresión y cronología: https://accesoalajusticia.org/reimpresion-de-la-providencia-administrativa-que-establece-el-calendario-tributario-del-2026/
- Nota sobre la reedición: https://www.pwc.com/ve/es/assets/documentos/stl/NAC-Calendarios-de-Sujetos-Pasivos-Especiales-A%C3%B1o-2026%E2%80%8B.pdf

**Regla de implementación:** nunca inferir deadlines por «día fijo del mes» ni por tasa del frontend. Una captura de calendario debe identificar `legalSourceId`, SHA-256 de la **reimpresión** aplicable, dígito RIF y el tipo de obligación; debe tener revisión humana distinta del autor. No se importaron fechas de vencimiento preestablecidas en este PR.

### Requisitos de comprobante IVA — SNAT/2025/000054

Texto transcrito para cotejo con gaceta primaria (la cabecera de esta transcripción presenta un **error tipográfico de año**, por lo que no sirve como documento oficial por sí sola):
https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2025-54

- **Artículo 13:** momento de retención al pago o al abono en cuenta, lo que suceda primero.
- **Artículo 14:** retenciones 1–15 y 16–fin de mes deben enterarse conforme al calendario aplicable.
- **Artículo 16:** numeración consecutiva de **14 caracteres** `AAAAMMSSSSSSSS`; datos del agente y proveedor (RIF), identificación de factura/control, base imponible, total, cuota tributaria y monto retenido, además de emisión/entrega y conservación. Verificar días hábiles del período siguiente en el texto oficial aprobado.
- No basta guardar un `FiscalDocument` de tipo `withholding`; un certificado legalmente exigible requiere un modelo propio que preserve la identidad de la factura origen, del proveedor, del hecho imponible/pago/abono, de la retención, del asiento y del acuse de entrega. Debe ser **idempotente y reversible**, sin editar históricos ni consultar tasas futuras para revertir.
- Cualquier intento de registrar `kind=withholding` en el endpoint manual `POST /fiscal/documents` se rechaza. Los soportes manuales admitidos reciben estado `external`, no `issued`.

### Evidencia de implementación actual

El nuevo módulo `fiscal-document-authority-policy.ts` prohíbe que el endpoint manual cree facturas, notas de crédito/débito, certificados, declaraciones o documentos clasificados IVA/ISLR/RETIVA/IGTF/MUNICIPAL. Prohíbe asimismo insertar desde el cliente campos `_fiscalModule`, `_ruleKeys`, `_taxpayerProfileHash` u otros metadatos con prefijo reservado. Tests: `tests/fiscal_document_authority_v751.test.mjs`.

**No confundir investigación con revisión legal humana:** ninguna descarga/web page se ha insertado ni marcado `REVIEWED` en la base de datos de una empresa. El cierre de #775/#776 continúa bloqueado mientras los cálculos comerciales históricos tomen `taxRate` desde el request y no existan certificados y reversos contables completos.


## Actualización normativa posterior — Gaceta 43.435 del 12-08-2026

Comprobada la publicación de **SNAT/2026/00080**, Providencia RIF, en la Gaceta Oficial N.º **43.435** del **12 de agosto de 2026**. La reforma sustituye reglas anteriores de la providencia de RIF **SNAT/2013/0048**, se centra en inscripción, modificación y verificación electrónica, dispone reflejar el RIF en facturas/documentos/libros y **elimina la vigencia automática de tres años**. La categoría fiscal de un perfil validada dentro del ERP no demuestra que el RIF esté verificado contra el portal SENIAT. Fuentes para cotejo con gaceta primaria:
- Texto de la providencia transcrita: https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2026-80
- Comentario jurídico con fecha y alcance: https://ttpn.com.ve/?p=5673
- Gaceta 43.435 (sumario): https://mail.gacetaoficial.org/2026-08-12-gaceta-oficial-venezuela-43435

En el **sumario de la misma Gaceta 43.435** figura también una providencia que **deroga la SNAT/2024/000121**, que regulaba requisitos de proveedores de sistemas informáticos utilizados para emitir facturas y otros documentos fiscales. **No extrapolar** esta derogación a la normativa de contenido de factura, obligación tributaria ni a la SNAT/2025/000054 (retención IVA). Tampoco deducir que ContaGest quedó automáticamente certificado para emitir comprobantes. Fuente: https://vlexvenezuela.com/vid/gaceta-oficial-republica-bolivariana-1132827271

### Consecuencias para #774/#775/#776

1. El perfil `TaxpayerProfileVersion` conserva RIF del `Tenant` y su fecha de captura, pero **no integra verificación electrónica SENIAT**, vigencia/actualización de datos de RIF por cambios relevantes ni prueba de notificación de sujeto especial. Por tanto **la clasificación manual `special_notified` NO equivale a notificación comprobada**.
2. La aplicación contable `FiscalWithholdingApplication` conserva factura, proveedor, perfil, regla IVA/RETIVA y asiento con copia de fórmulas exactas, pero es **registro interno**, no comprobante legal ni declaración. Permanece deshabilitada por defecto con `VE_FISCAL_INTERNAL_RETIVA_POSTING_ENABLED`.
3. Antes de habilitar certificados legales, obtener la Gaceta primaria del 12-08-2026 y el texto vigente de las normas de facturación electrónica, determinar requisitos aún aplicables, comprobar estatus y RIF vía procesos SENIAT autorizados, y documentar revisión independiente/hashes en la base por tenant. Se requiere revisión jurídica y auditoría humana; fuentes de internet no activan reglas.

### Verificación documental de retenciones IVA

Se inspeccionaron visualmente páginas de la **Gaceta 43.171, 16-07-2025**, con texto de la SNAT/2025/000054 (reproducción de gaceta):
https://www.marambio-hlb.com/wp-content/uploads/2025/07/PROVIDENCIA-000054-Ret.-IVA.-G.O.-43.171-16-07-2025.pdf

Artículos observados:
- **1 y 3:** designación de agentes SPE notificados y exclusiones con condiciones legales (operaciones exentas/exoneradas, contribuyentes formales y otros casos), no inferibles sólo del campo `retentionProfile`.
- **4 y 5:** 75% usual, 100% en los supuestos de la providencia; **estos porcentajes no se precargan**: cada regla productiva exige fuente/review/fecha.
- **13 y 14:** evento cuando ocurre pago o abono en cuenta, lo primero; períodos quincenales con plazo según calendario del contribuyente.
- **16:** comprobante propio, numeración de catorce caracteres y obligaciones de emisión/entrega. El asiento interno de retención de este PR no suple el comprobante.
