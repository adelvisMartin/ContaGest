# ADR — Ledger posting lifecycle e inmutabilidad v91

## Estado

Aceptado para implementación de `#91`. Este ADR describe el contrato técnico; no constituye una declaración de cumplimiento fiscal o legal.

## Contexto

`LedgerEntry.posted` existía como `Boolean`, pero no gobernaba un lifecycle real. Ventas y compras podían crear asientos sin marcar el efecto como contabilizado y no existía una barrera PostgreSQL que impidiera modificar o borrar un asiento ya contabilizado. El contrato del repositorio exige que el pasado contable se corrija mediante eventos nuevos y auditables, no reescribiéndolo.

La aritmética de este ADR depende del núcleo Decimal canónico de `#90` y no introduce una segunda abstracción monetaria.

## Decisión

Se mantiene `posted Boolean` por compatibilidad y se convierte en un estado de dominio efectivo mediante metadata y enforcement:

- `posted=false` representa `DRAFT`;
- `posted=true` representa `POSTED`;
- `postedAt` registra el instante de posting;
- `postedBy` registra el `UserProfile.id` cuando existe evidencia del actor;
- `reversalOfId` enlaza un reverso con su asiento original;
- `reversalOfId` es único: un asiento admite como máximo un reverso directo.

No se introduce un enum porque sólo existen dos estados persistidos. `REVERSED` es un estado derivado: un `POSTED` está reversado cuando `reversedBy` existe.

## Diagrama de estados

```text
DRAFT
  |
  | post (balance exacto + período abierto + actor/auditoría)
  v
POSTED ----------------------+
  |                           |
  | reverse                   | contenido original permanece
  v                           |
POSTED REVERSAL --------------+
(reversalOfId = original.id)
```

Transiciones prohibidas:

```text
POSTED -> DRAFT
POSTED -> editar cabecera
POSTED -> editar/agregar/eliminar/mover líneas
POSTED -> DELETE
REVERSAL -> reverse
ORIGINAL -> segundo reverso directo
```

Una corrección posterior a un reverso se registra como **ajuste contable nuevo**, no como cadena de reversos.

## Posting atómico de documentos operativos

Ventas y compras no borrador deben producir un asiento `POSTED` en la misma transacción del documento. Para permitir que PostgreSQL valide las líneas antes de bloquearlas, la implementación física es:

1. crear `LedgerEntry` como DRAFT;
2. crear sus `LedgerLine`;
3. cambiar el mismo asiento a `posted=true` con `postedAt/postedBy`;
4. escribir `AuditLog` obligatorio;
5. confirmar la transacción completa.

Por tanto no existe una ventana observable donde una venta/compra emitida quede con un asiento draft: el estado intermedio vive sólo dentro de la transacción.

La base de datos rechaza la inserción directa de un padre `posted=true`; el camino soportado es siempre la transición explícita después de construir las líneas.

## Invariantes

Un posting válido debe cumplir simultáneamente:

- al menos dos líneas;
- `SUM(debit) == SUM(credit)` con `NUMERIC/Decimal`, sin IEEE-754 `Number`;
- ningún débito/crédito negativo;
- una misma línea no puede tener débito y crédito distintos de cero a la vez;
- período contable permitido;
- tenant del asiento conocido;
- un reverso referencia únicamente un `POSTED` del mismo tenant;
- el original no puede ser a su vez un reverso;
- un `POSTED` no cambia de contenido ni se elimina.

El backend valida las reglas de dominio y PostgreSQL vuelve a validar las invariantes críticas para impedir bypass mediante scripts, futuras rutas o accesos directos soportados.

## Reversos

`POST /accounting/entries/:id/reverse` recibe el período donde se registrará el reverso. El período puede diferir del original cuando el original ya esté cerrado; el nuevo período debe estar abierto.

Ventas/compras aceptan `reversalFiscalPeriod` y `reversalDate` opcionales al anular. Si no se indican, se usa el período original y el gate de período decide si es válido.

El reverso:

- conserva el original intacto;
- copia cuentas, moneda y tasa de las líneas originales;
- intercambia débito y crédito con Decimal exacto;
- se crea como nuevo asiento manual;
- queda `POSTED` dentro de la misma transacción;
- guarda `reversalOfId`;
- genera un `AuditLog` obligatorio.

## Auditoría

Los eventos contables críticos son:

- `ledger.entry.posted`;
- `ledger.entry.reversed`.

Estos eventos se insertan con la misma transacción que el cambio de ledger. Si el `AuditLog` obligatorio falla, el posting/reverso también se revierte.

Se registra el actor disponible (`UserProfile.id`), IP y user-agent. El modelo `AuditLog` actual no contiene `requestId/correlationId`; este ADR no inventa una columna ni una infraestructura inexistente. Cuando el sistema incorpore correlación de requests, estos eventos deberán enlazarla.

`ledger.entry.created` continúa usando el mecanismo de auditoría general porque crear un DRAFT no produce todavía efecto contable.

## Permisos

- consulta de ledger: `accounting.view`;
- crear/postear/reversar asiento manual: `accounting.post`;
- venta operativa: `sales.manage`;
- compra operativa: `purchases.manage`.

Ventas/compras autorizadas contabilizan su propio efecto dentro de su transacción. No se obliga en `#91` una segregación preparador/aprobador adicional porque esa decisión de producto/RBAC permanece futura.

La API manual fuerza `source=manual`; un consumidor no puede fingir por esa ruta que un asiento proviene de ventas, compras, nómina, bancos, impuestos o inventario.

## Reportes

El balance de comprobación considera exclusivamente `posted=true`. Los DRAFT no forman parte de estados financieros.

Para evitar regresión histórica, la migración sólo marca automáticamente como `POSTED` los asientos antiguos de ventas/compras que puedan clasificarse de forma determinista como documentos emitidos/pagados/vencidos y cuyo asiento sea balanceado. Cualquier fila operacional ambigua bloquea la migración y debe resolverse mediante el runbook.

## Base de datos

La migración añade:

- columnas `postedAt`, `postedBy`, `reversalOfId`;
- self-FK `reversalOfId -> LedgerEntry.id` con `ON DELETE RESTRICT`;
- unicidad de `reversalOfId`;
- índices tenant/source/reversal/posted;
- constraint de consistencia de metadata;
- trigger de lifecycle del `LedgerEntry`;
- trigger de inmutabilidad de `LedgerLine` cuando el padre está posted.

Los triggers usan mensajes estables (`ledger_posted_immutable`, `ledger_posted_line_immutable`, `ledger_unbalanced_posting`, `ledger_reversal_cross_tenant`, etc.) para QA/observabilidad, sin registrar contenido sensible de documentos.

## UX

Cuando una UI consuma este lifecycle:

- `posted=true` se presenta como inmutable;
- no se ofrece `Editar`/`Eliminar` para un posted;
- la acción es `Reversar/Ajustar`;
- debe mostrar la relación original ↔ reverso y el período del efecto.

No se crea una pantalla nueva en `#91` si el repositorio no dispone actualmente de una superficie de edición de asientos.

## Alternativas rechazadas

### Convertir `posted` a enum ahora

Aumenta la migración y compatibilidad sin aportar un tercer estado persistido necesario. `REVERSED` puede derivarse de la relación.

### Confiar sólo en la API

No protege contra scripts, nuevas rutas o mantenimiento directo.

### Insertar directamente `posted=true` con líneas anidadas

Impide que el trigger de líneas distinga construcción inicial de mutación posterior y dificulta validar el balance antes de inmovilizar. Se adopta DRAFT→POSTED dentro de una sola transacción.

### Reversar un reverso

Produce cadenas ambiguas. Se adopta un único reverso directo y ajustes nuevos para correcciones posteriores.

## Consecuencias

Positivas:

- historial posted técnicamente inmutable;
- balance validado en backend y DB;
- reversos navegables;
- mejor auditoría y reproducibilidad;
- drafts fuera de reportes financieros.

Costes/riesgos:

- una inconsistencia legacy puede bloquear la migración hasta ser clasificada;
- `postedBy` histórico puede quedar NULL por ausencia de evidencia;
- cambios futuros que intenten editar posted fallarán en PostgreSQL y deberán usar reversos/ajustes.

## Rollback

Antes de que exista información contabilizada con el nuevo lifecycle, el cambio puede revertirse junto con su migración en un entorno no productivo.

Después de usarlo con datos reales, **no** se recomienda un rollback destructivo que elimine relaciones o vuelva a habilitar edición de posted. El rollback operativo seguro es revertir la aplicación manteniendo datos/constraints o desplegar una migración correctiva revisada. Nunca borrar reversos ni reescribir el original para “volver atrás”.
