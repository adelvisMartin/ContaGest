# #751: workflow de normas y versiones fiscales — candidato, no cumplimiento declarado

Autoridad: tablas existentes `FiscalLegalSource`, `FiscalRuleVersion` y `FiscalDocumentRuleSnapshot` del módulo #629. La migración de gobernanza añade estado, fuente con SHA-256 y supersession sin tabla fiscal paralela. Las reglas antiguas quedan **DRAFT** y no pueden generar nuevos documentos tributarios automáticamente hasta revisión independiente. Ninguna tasa se configura por defecto.

## Evidencia normativa (solo referencias candidatas)

- Asamblea Nacional, texto publicado de reforma de IVA, Gaceta Oficial Extraordinaria 6.507 del 29 de enero de 2020: https://www.asambleanacional.gob.ve/storage/documentos/leyes/decreto-constituyente-de-reforma-parcial-del-decreto-con-rango-valor-y-fuerza-de-ley-que-establece-el-impuesto-al-valor-agregado-20220204234747.pdf
- La vigencia y las alícuotas de actos posteriores deben comprobarse contra la versión específica, decreto/providencia, alcance del contribuyente y evento. La fuente web no constituye aprobación jurídica, no implica una tasa única y no se importa ni se activa automáticamente.
- Captura humana: `sourceType`, `reference`, URL, hash del archivo original y metadatos de captura. Revisor distinto del autor: `DRAFT→REVIEWED`; después otra persona revisa la definición exacta `RATIO_MINOR_UNITS` y otra la activa.
- Mantener `sourceUrl` como referencia, no descargar URLs arbitrarias desde backend (SSRF). Hash del archivo capturado por operador, revisión humana y pruebas RLS obligatorias.

## Invariantes y límites

- Sólo `ACTIVE` + fuente `REVIEWED` + revisión/activación independientes puede seleccionarse en una emisión; no activar tasa de una fuente meramente capturada.
- UTC: `effectiveFrom` incluido, `effectiveTo` excluido. Rechazar solapamientos, fuentes ajenas, ausencia de permiso y supersession no creciente. Bloqueo advisory PostgreSQL por tenant/regla; no se rebalancea ni modifica ledger desde este workflow.
- Fórmula cerrada `RATIO_MINOR_UNITS`: `numerator`, `denominator`, `basis`; sin `eval`, imports, expresiones en JSON ni porcentajes precargados.
- Los snapshots capturados previamente no se modifican al cambiar normas; el trigger histórico impide UPDATE/DELETE; el hash NO es firma digital infalsificable.
- El sistema **no es SENIAT-certified**. La investigación no reemplaza verificación legal vigente por profesional autorizado.

## QA de integración obligatorio

1. `npm ci` y `npm run typecheck`, `npm run build:backend`.
2. PostgreSQL 17 efímero `migration:test:from-zero` y `migration:test:upgrade`, RLS tenant A/B, tests de fuentes DRAFT/REVIEWED y reglas review/activate.
3. Concurrencia de activaciones, límites UTC, estado previo, duplicados, supersession, retries y auditoría atomic en PostgreSQL real.
4. Emisión → snapshot → consulta histórica → compensación/reverso ledger por autoridad contable #637/#785, certificados #775/#776 y browser E2E. Esos recorridos siguen pendientes hasta tener evidencia completa exact-SHA.

## Roll-forward

No reescribir migraciones aplicadas, no alterar snapshots. Ante una interrupción por legacy sin provenance, inspeccionar en copia PG17 de solo lectura, capturar fuentes y nueva versión explícita; no convertir automáticamente las reglas antiguas en ACTIVE. Una retirada de triggers requiere una migración nueva y respaldo/restore demostrado.
