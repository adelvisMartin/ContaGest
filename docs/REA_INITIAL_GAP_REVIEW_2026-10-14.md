# REA · Reconocimiento inicial del backlog y objetivos (2026-10-14)

> **Estado: SOURCE_REVIEW / BACKLOG-BASED, no REA capture.** Este es un informe preliminar trazable a issues visibles en GitHub; **no es una prueba de ausencia de funcionalidades ni una auditoría ejecutada de competidores**. Baseline analizada: `main@cff24727bcb5bca1f0f585ad63562c7ea092dbe5`. Cada modificación y candidato requiere nueva comparación con HEAD y pruebas reales.

## Autoridades que se deben reutilizar

- [#707 — Competitive Intelligence / software OSS](https://github.com/adelvisMartin/ContaGest/issues/707): ya existe inventario de productos comparables, clasificación `ADOPT/MERGE/DEFER/NOT APPLICABLE`, políticas de licencia y estudio previo Hi-Tad. **No** crear un segundo backlog ni copiar código GPL/AGPL/proprietario.
- [#659 — Functional Coverage Gap Audit](https://github.com/adelvisMartin/ContaGest/issues/659): autoridad sobre flujos de punta a punta `UI → state/client → API → service → persistence → UI`. Debe confirmar cualquier posible gap de REA.
- [#837 — Control Hípico 100%](https://github.com/adelvisMartin/ContaGest/issues/837) y [#835 — ContaGest expansión](https://github.com/adelvisMartin/ContaGest/issues/835): scope y prioridades por producto. Las referencias externas nunca reemplazan estos criterios.

## ContaGest — trabajo abierto a revisar, no nuevas funciones verificadas como ausentes

| Nivel | Objetivo del proyecto | Evidencia de backlog | Verificación necesaria | Ejemplos de benchmark legítimo |
| --- | --- | --- | --- | --- |
| P0 | Autoridad fiscal Venezuela, vigencia normativa y trazabilidad | [#751](https://github.com/adelvisMartin/ContaGest/issues/751), [#774](https://github.com/adelvisMartin/ContaGest/issues/774), [#775](https://github.com/adelvisMartin/ContaGest/issues/775) | Inspeccionar reglas/estados, reviewer, aplicabilidad por fecha, snapshots, migración y base PG aislada | ERPNext/Odoo sólo como flujos de trabajo; normas/tasas venezolanas provienen de fuentes legales independientes |
| P0 | Impuestos, retenciones, libros y cumplimiento | [#776](https://github.com/adelvisMartin/ContaGest/issues/776), [#778](https://github.com/adelvisMartin/ContaGest/issues/778), [#780](https://github.com/adelvisMartin/ContaGest/issues/780), [#781](https://github.com/adelvisMartin/ContaGest/issues/781), [#782](https://github.com/adelvisMartin/ContaGest/issues/782), [#783](https://github.com/adelvisMartin/ContaGest/issues/783) | Reglas versionadas, idempotencia contable, cierres y reconciliación de documentos | ERPNext/Dolibarr como ideas de navegación/reportes, nunca como fuente normativa |
| P1 | Cotización → pedido de venta | [#753](https://github.com/adelvisMartin/ContaGest/issues/753) | Un contrato de documento, snapshots, secuencia, RBAC, API, UI y tests de concurrencia | Dolibarr/ERPNext |
| P1 | Importación/exportación y portabilidad | [#770](https://github.com/adelvisMartin/ContaGest/issues/770) | Mapeo, dry-run, rollback, fórmulas hostiles CSV/XLSX, tenant A/B y export autorizado | Dolibarr/ERPNext |
| P1 | Tableros y KPIs operativos reconciliables | [#771](https://github.com/adelvisMartin/ContaGest/issues/771) | KPI→origen, drill-down y exactitud bajo permisos/tenant | ERPNext |
| P2 | Cobertura de acciones/rutas reales del ERP | [#659](https://github.com/adelvisMartin/ContaGest/issues/659), [#655](https://github.com/adelvisMartin/ContaGest/issues/655) | Inventario per-route, botones activos, errores, pruebas API/DB y navegadores por SHA | Referencias UX accesibles: analizar, no copiar |

## Control Hípico — barreras operativas y pendientes

| Nivel | Objetivo del proyecto | Evidencia de backlog | Verificación necesaria |
| --- | --- | --- | --- |
| P1 | Entrada interactiva LAB con conversación/contexto canónico | [#892](https://github.com/adelvisMartin/ContaGest/issues/892) describe `processLabTestInput()` con clasificación local, sin ruta directa al motor canónico en ese recorrido a fecha del issue | Revisar source HEAD, Bridge→API→read-model→respuesta/outbox; casos con contexto por grupo/tenant; SOURCE sigue read-only |
| P1 | Cola durable pre-consulta LAB independiente del DOM | [#907](https://github.com/adelvisMartin/ContaGest/issues/907) documenta pérdida de visibilidad de filas cuando desaparecen del DOM | Journal/spool pre-query, reinicio/replay/retención, dedupe, respuesta segura, fault-injection Windows |
| P0 | Backup y restore reales de Hípico | [#842](https://github.com/adelvisMartin/ContaGest/issues/842) requiere rol `hipico_backup` least-privilege y restore drill PG17 con 25/25 tablas | Evidencia operacional de backup cifrado, restore efímero, conteos/FKs/roles; no producción mutable |
| P0 | Comportamiento físico PWA/Android/WhatsApp | [#119](https://github.com/adelvisMartin/ContaGest/issues/119), [#120](https://github.com/adelvisMartin/ContaGest/issues/120), [#839](https://github.com/adelvisMartin/ContaGest/issues/839) | Dispositivos reales, red intermitente, permisos, sesiones y soak 24–72h; nunca reemplazar por observación de fuente |
| P1 | Recuperación de acceso/contraseña | [#267](https://github.com/adelvisMartin/ContaGest/issues/267) | E2E auth y flujo Supabase real bajo pruebas no productivas |

**SOURCE read-only no es un gap**: es política canónica [#837](https://github.com/adelvisMartin/ContaGest/issues/837), que exige autonomía sólo en LAB; una herramienta externa no debe recomendar su bypass.

## Siguiente etapa de investigación (no ejecutada)

La fuente #707 ya permite comenzar por **ERPNext** y **Dolibarr** para ContaGest. En Hípico se requiere primero identificar un referente que realmente cubra carreras, grupos, outbox, offline y comprobantes, con permiso de observación. No se ha capturado ninguna página con REA ni ejecutado comparaciones de frontend/backend ajenos en esta rama. Para cada sitio permitido: documentar URL/scope, levantar captura pasiva con REA CDP, conservar hash SHA-256 y version/pin, seleccionar hechos comprobables, verificar código y runtime propios, y crear **subtareas dentro de issues existentes** sólo ante brechas confirmadas. Las ideas sin evidencia permanecen `NEEDS_VERIFICATION`.

## Priorización

P0: integridad fiscal y DR/QA físico Hípico. P1: motores conversacionales LAB durables y flujos comerciales ERP. P2: comparación UX/prácticas de terceros y análisis per-route. La prioridad surge del backlog, no de un hallazgo REA ni de que el software de terceros lo haga así.

**Regla de cierre:** ningún issue se cierra ni un módulo se declara completo por similitud visual, existencia de archivo o ausencia de errores de scraping. Debe haber recorrido funcional, seguridad, DB cuando aplique y evidencia ejecutada exact-SHA.
