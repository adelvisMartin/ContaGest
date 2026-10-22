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
