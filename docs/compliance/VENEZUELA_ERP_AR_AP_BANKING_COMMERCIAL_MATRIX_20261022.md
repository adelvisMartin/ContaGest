# Matriz de cumplimiento Venezuela: ERP comercial/contable (22-10-2026)

**Alcance:** #743 conciliación bancaria, #744 subledger AR/AP, #753 cotización→orden, #754 delivery, #755 FEFO/warehouse, #756 reorder/ageing, #757 compras. **SOURCE_REUSE=NONE.** Investigaciones de normativa para definir requisitos y pruebas, NO certificación SENIAT, cumplimiento legal probado ni reglas tributarias hard-coded. Estado: **REVIEW_REQUIRED / NOT_RELEASE_READY**.

## Referencias verificadas (consultar texto oficial antes del go-live)

| Fuente / rango | Referencia revisada y fecha | Implicación técnica / política |
| --- | --- | --- |
| Código de Comercio, arts. 32, 34, 36, 37, 44 | https://venezuela.justia.com/federales/codigos/codigo-de-comercio/gdoc/ | Diario/Mayor/Inventario; trazabilidad, prohibición de borrar/corregir asientos en sitio; error mediante nuevo asiento; libros y comprobantes 10 años desde último asiento del libro. El esquema debe permitir retención/legal hold y reversos append-only. |
| Ley IVA, arts. 55, 56, 58 | https://venezuela.justia.com/federales/leyes/ley-que-establece-el-impuesto-al-valor-agregado/gdoc/ | Entrega y facturación tienen obligaciones y momentos distintos según operación; conservar soporte/documento original y enlazar guías de entrega a facturas posteriores cuando aplique; cambios mediante facturas/notas de crédito/débito con identidad fiscal. |
| Providencia SNAT/2011/00071 | GO 39.795, 08-11-2011; https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2011-71 | Reglas generales de emisión de facturas y otros documentos. Referencia fiscal para numeración/control, notas, orden de entrega y requisitos por perfil; separar documentos comerciales pre-factura de documentos fiscales. |
| Providencia SNAT/2024/000102 | GO 43.032, 19-12-2024; https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2024-102 | Regula emisión por medios digitales; requiere revisión de aplicabilidad y formalidades para cada contribuyente/medio. NO activar `isOfficialFiscalInvoice` por tener una factura ERP común. |
| Providencia SNAT/2026/00084 | GO 43.435, 12-08-2026; https://vlexvenezuela.com/vid/gaceta-oficial-republica-bolivariana-1132827271 ; https://tugacetaoficial.com/leyes/providencia-administrativa-snat-2026-00084-derogatoria-de-normas-deproveedores-de-sistemas-informaticos-utilizados-para-la-emision-de-facturas-y-otros-documentos-fiscales/ | **Deroga expresamente la SNAT/2024/000121 de homologación de proveedores de software.** NO exigir en código una autorización de proveedor basada solamente en 000121 ni inferir que toda facturación/medios digitales quedan liberados. Mantener reglas 000071/000102 sujetas a revisión legal. |
| IFRS 9 (referencia contable, sujeto a VEN-NIF/perfil) | https://www.ifrs.org/content/dam/ifrs/project/pir-9-impairment/rfi-iasb-2023-1-ifrs9-impairment.pdf | La tabla de antigüedad NO implica automáticamente pérdida crediticia o castigo de deuda: requerir política aprobada, configuración contable, consentimiento/RBAC, asientos equilibrados y period lock. |

**Grado de evidencia:** Código de Comercio y Ley IVA consultados como reproducciones de normativa; 000071 y 000102 consultadas en repositorio tributario no oficial; 000084 corroborada contra índice/texto reproducido de Gaceta 43.435. Antes de producción, abogado/contador fiscal VE debe contrastar texto íntegro vigente, reformas, regímenes especiales, calendarios y permisos reales. No se inventan impuestos, intereses moratorios, alícuotas, FX, retenciones ni plazos particulares.

## Traducción a contratos ERP verificables

1. **#744 Cobros/pagos**: factura fiscal y sus líneas inmutables una vez emitidas; note/refund/reversal son documento + efecto independiente, no `status=paid` arbitrario. Allocation/credit debe estar anclada a tenant, tercero, moneda, timestamp de efecto, idempotencia/period lock y GL. AR/AP debe reconciliar con débitos/créditos históricos al as-of. El ageing es evidencia operativa; un write-off exige política/permiso y balanceo #643. Dunning usa outbox/consentimiento/política, no correos ocultos ni intereses automáticos.
2. **#743 Bancos**: importar extracto ≠ mover dinero; CSV idempotente con hash fuente+línea, evidencia de orden y moneda; matching y reversos auditables. Conciliación bancaria no se certifica por igualdad numérica ni por una página sin errores.
3. **#753 Ventas**: quote/order son documentos comerciales NO fiscales por defecto; numeración tenant-scoped por servicio común (#762), tax/price/FX snapshots deterministas e inmutables; confirmación no emite factura fiscal ni asienta GL hasta la autoridad correspondiente.
4. **#754 Entregas**: Delivery/Pick no sustituye factura ni guía fiscal; conservar evidencia de entrega, relación con factura/guía cuando proceda y movimientos de inventario ligados a reservations del propietario. Cancelar tras dispatch requiere corrección/reverso trazable.
5. **#755 Lotes/ubicación**: FEFO es política operativa, no presume por sí sola norma universal de vencimiento para cada categoría. Lotes caducados deben excluirse salvo excepción autorizada/auditada donde legalmente proceda, especialmente farmacia/alimentos. No mezclar inventario físico/location con stock comercial en memoria.
6. **#756 Reposición/ageing**: reportes derivados conservan timestamp, corte, moneda/unidad y evidencia de origen; alertas por outbox configurable; no compra automática ni balance duplicado.
7. **#757 Compras**: PurchaseRequest/PurchaseOrder/GoodsReceipt son eventos comerciales y físicos distintos de factura de proveedor y AP; control de sobre-recepción/facturación y nota de crédito tributaria, original preservado; receipt contabiliza stock solo por autoridad inventario con idempotencia.

## Gates regulatorios, financieros y seguridad antes de declarar READY

- Matriz de contribuyente, sujeto tributario, medio de facturación, moneda y tipo de documento aprobada; referencias vigentes verificadas contra Gaceta.
- PostgreSQL17 efímero: migraciones desde cero/upgrade, tenant A↔B/RLS, control de acceso negativo, relaciones compuestas, transacciones concurrentes, idempotencia de receipt/payment/import, reverso y period lock.
- Conciliación #643: sumas `Decimal` exactas por tenant+moneda+fecha, posted GL, ageing por corte y saldos de bancos; ningún importe `float` de autoridad.
- E2E Chromium gate de PR y matriz Firefox/WebKit programada, UX accesible, estados error/loading/empty/replay, auditoría de diff y secretos.
- Aprobación fiscal y contable del diseño antes de habilitar emisión/ajustes automáticos productivos. La ausencia de infra o permiso = **BLOCKED**, nunca `PASS`.

## Situación al publicar este documento

Investigación jurídico-funcional completada como insumo de ingeniería; **implementación y QA end-to-end de los siete tickets aún pendientes**. Reutilizar los contratos existentes, sin crear un segundo stock ledger, sin sobreescribir historial ni permitir que read-only projections actúen como pagos/órdenes/conciliaciones oficiales.

## Verificación cruzada adicional · 2026-10-22

- **Derogatoria SNAT/2026/00084:** Gaceta 43.435 (12-08-2026), texto reproducido en https://tugacetaoficial.com/leyes/providencia-administrativa-snat-2026-00084-derogatoria-de-normas-deproveedores-de-sistemas-informaticos-utilizados-para-la-emision-de-facturas-y-otros-documentos-fiscales/ ; análisis independiente https://www.forvismazars.com/ve/en/insights/forvis-mazars-insights/fmi-0726-derogatoria-de-sistemas-homologados y https://ttpn.com.ve/?p=5862 . **Efecto limitado:** deroga requisitos de homologación de proveedores de 000121; NO deroga por sí sola la Ley del IVA, los documentos fiscales ni todos los requisitos de medios digitales de 000102.
- **SNAT/2024/000102:** reproducción articulada en https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2024-102 ; su disposición final primera remite a 2011/0071 y 2018/0141 para aspectos no previstos. Exige matriz por contribuyente/medio, sin habilitación automática en UI.
- **Código de Comercio:** documento estatal reproducido en https://docs.venezuela.justia.com/federales/codigos/codigo-de-comercio.pdf ; informe público OEA (https://www.oas.org/juridico/spanish/mesicic_iii_inf_ven.pdf) también identifica artículos 37 (corrección por asiento distinto) y 44 (10 años para libros/comprobantes). Aplicación: reverso append-only, retención y cadena de evidencias.
- **Calidad de fuentes:** se consultaron referencias reproducidas, análisis profesionales y copia institucional de OEA, no se ha obtenido desde el SENIAT un texto oficial íntegro con certificación de vigencia y aplicabilidad específica. **LEGAL_VALIDATION_PENDING** hasta esa comprobación por asesor tributario para cada perfil.
- **#743:** el importador no equipara dos movimientos sin identificador bancario por coincidir importe/fecha/texto; identidad de fuente+ordinal documentada en [BANK_IMPORT_LINE_IDENTITY_V743_20261022](../architecture/BANK_IMPORT_LINE_IDENTITY_V743_20261022.md). Es política de integridad de datos, no regla tributaria nueva.
