# Control Hípico — Auction Domain Admission (#1010)

**Estado:** BLOCKED / diseño previo; 2026-10-15. **No autoriza** una nueva entidad, endpoint, puja, cobro, pago, transferencia, envío WhatsApp ni migración de base de datos. El negocio concreto de remates **no ha sido confirmado por el propietario**, y no existe autorización para usar datos reales ni para replicar reglas de proveedores.

## Por qué existe el gate

El ticket #1010 exige aprobación del bounded context antes del DDL. Una subasta de **venta de caballos** no es una apuesta hípica. Tampoco puede asumir las fórmulas observadas en la interfaz de un proveedor, su mecanismo de tickets, su idoneidad fiscal ni su modelo de identidad. Este contrato documenta la frontera antes de desarrollar el primer modelo persistido.

## Flujo propuesto, no implementado

1. Operador responsable de remate crea evento y lotes del catálogo, todos bajo un único owner/organización y RLS.
2. Compradores aprobados son elegibles con consentimiento, edad, identidad y permisos demostrables. El martillero abre/cierra el lote; servidor ordena pujas con precisión Decimal, reloj y concurrencia transaccional; los reintentos usan idempotency key.
3. La adjudicación final requiere un solo ganador mediante lock/constraint; ninguna oferta nueva después de cierre. Disputa/retiro/cancelación son transiciones auditables, no eliminación de hechos históricos.
4. Ticket numerado e inmutable con snapshot de moneda/cambio/términos aprobados; de momento **no generar ni contabilizar tickets**.
5. Cobro, retención, comisión, incentivo, reintegro, reversos y conciliación esperan explícitamente el contrato de autoridad financiera; jamás crear un segundo ledger hípico ni asumir porcentajes.

## Matriz de autoridad y permisos (propuesta)

| Operación | Rol | Riesgo / control previo |
|---|---|---|
| Crear catálogo y publicar evento | organizer | RLS owner/tenant; audit/versionado |
| Consignar lotes/medios | consignor | consentimientos y provenance de archivos |
| Abrir/cerrar/adjudicar | auctioneer | lock, orden total, auditoría y razón |
| Registrar cobros/reembolsos | cashier | **BLOCKED**: authority de dinero no aprobada |
| Ofertar | approved_buyer | **BLOCKED**: elegibilidad y consentimiento faltantes |
| Leer conciliación/exportar | auditor | acceso mínimo, datos personales redactados |

## Reglas a aprobar antes de cualquier schema

La [autoridad machine-readable](../../config/hipico-auction-admission-v1010.json) contiene 10 decisiones pendientes: dominio comercial real, operador legal, participantes, moneda/FX/redondeo, comisión/impuestos, tie-break/disputas, autoridad de pagos y reversos, permisos, retención/exportaciones y jurisdicción. Solo una autorización escrita y revisada en el issue permite diseñar un PR posterior con modelos y tests PostgreSQL 17. **Modificar el JSON, una env var o un botón no constituye aprobación**.

## Límites de canal y seguridad

- Quedan fuera de esta authority los saldos de apostadores, tickets de carreras, liquidación de apuestas y cualquier mensaje automático a SOURCE WhatsApp. El canal SOURCE permanece `NO_GO` por #154/#728/#1011. El LAB sólo utiliza datos sintéticos aprobados.
- No almacenar contraseñas, teléfonos, token, documentos personales ni formularios reales en este ADR.
- La capacidad técnica nunca suple consentimiento, licencias, contratos, seguridad financiera ni aprobación del responsable.
- Si en el futuro se autorizan subastas comerciales, las actividades financieras se integrarán con el ledger canónico existente mediante diseño y pruebas autorizadas, no mediante tablas paralelas.

## Evidencia técnica y estado

Validar con `node scripts/hipico-auction-admission-v1010.mjs` y `node --test tests/hipico_auction_admission_v1010.test.mjs`. La CLI devuelve **BLOCKED con exit 0** para manifiesto válido; solo la estructura inválida termina con código 1. Es el comportamiento esperado: aprobar un contrato de *bloqueo* no es habilitar remates.

El contrato cubre falsos GO, activación de SOURCE, sustitución del ledger, liquidación, roles mínimos y evidencia no confiable. **No** es un test E2E, de PostgreSQL, de UI, de cobro o de subasta: todas esas capacidades siguen `NOT_EXECUTED/OUT_OF_SCOPE` hasta aprobación comercial, implementación separada y ejecución real. Los criterios completos de #1010 permanecen **PENDING**. Rollback: eliminar los cuatro archivos nuevos; no se modifican datos ni código productivo.

**Decisión:** `BLOCKED`, owner approval pendiente. `SOURCE_REUSE=NONE` (referencias LatamTurf e HipNumber son benchmark documental, no código/activos reutilizados).
