# ADR — Gobierno fiscal RBAC y transiciones auditables (#96)

## Estado

Aceptado para el candidato del issue #96.

## Alcance de ingeniería

Este ADR define controles de software para períodos y documentos fiscales. No declara homologación, certificación ni cumplimiento SENIAT. Reglas regulatorias, alícuotas y calendarios deben validarse por separado contra fuentes oficiales vigentes.

## Permisos

- `fiscal.read`: consultar períodos/documentos y capacidades.
- `fiscal.manage_documents`: registrar documentos fiscales.
- `fiscal.close`: crear y cerrar períodos fiscales.
- `fiscal.reopen`: reabrir un período cerrado con motivo obligatorio.

Los permisos se insertan por migración. No se conceden automáticamente a roles productivos existentes; deben asignarse mediante gobierno RBAC. En entornos de seed, el rol QA/admin recibe el catálogo completo después de migraciones.

## Módulos permitidos

`fiscal`, `iva`, `islr`, `igtf`, `retiva`, `municipal`.

No se aceptan strings arbitrarios.

## State machine

`OPEN --close--> CLOSED`

`CLOSED --reopen + permiso + motivo--> OPEN`

No existe `upsert` como transición. Un período debe crearse explícitamente abierto antes del cierre. Cerrar un cerrado o reabrir un abierto devuelve transición inválida.

La reapertura limpia los campos que representan el cierre actual (`closedAt`, `closedBy`); la evidencia histórica del cierre y de la reapertura permanece en `AuditLog` con before/after, actor y motivo.

## Documentos

Los tipos admitidos por el contrato son `invoice`, `credit_note`, `debit_note`, `withholding`, `tax_return`, `supporting_document`, `other`.

El módulo fiscal se valida y se conserva dentro del payload controlado por servidor. Un documento no puede crearse cuando el módulo solicitado o el cierre `fiscal` general del período está cerrado.

No se añaden rutas de borrado/renumeración. La unicidad existente `(tenantId, kind, number)` sigue vigente.

## Tenant isolation

Todas las consultas/transiciones se resuelven con `tenantId` de sesión. El período no se busca por clave global. Tenant A no puede cerrar/reabrir un período de B ni ver sus documentos.

## Relación con accounting #91

El cierre fiscal y el cierre contable son estados independientes aunque compartan `ClosingPeriod`.

- cerrar fiscal no cierra accounting;
- reabrir fiscal no reabre accounting;
- un asiento posted no se modifica por ninguna ruta fiscal;
- una corrección contable posterior sigue el workflow de reverso/ajuste de #91.

## Auditoría

Eventos append-only:

- `fiscal.period.created`;
- `fiscal.period.closed`;
- `fiscal.period.reopened`;
- `fiscal.document.created`.

Los documentos se auditan con metadatos, hash y estado, no con el payload completo para evitar PII innecesaria en logs.

## UX

La pantalla de cierres consume `/fiscal/periods`, que devuelve `capabilities` calculadas desde RBAC. La UI sólo muestra cerrar/reabrir/crear cuando el servidor reporta capacidad, pero la seguridad sigue aplicada server-side.

Tributos permite registrar/listar documentos sólo cuando `fiscal.manage_documents` está habilitado. Un 403 se representa como permission denied, no como éxito vacío.

## Recuperación

Una transición errónea no se corrige editando la fila ni eliminando auditoría. Se ejecuta la transición autorizada contraria cuando sea válida y se conserva el expediente en `AuditLog`.