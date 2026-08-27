# Runbook — Posting, reversos y backfill del ledger v91

## Propósito

Procedimiento operativo para desplegar y operar el lifecycle de `LedgerEntry` de `#91` sin perder trazabilidad histórica. Este runbook no autoriza cambios destructivos ni sustituye las políticas generales de backup/restore del repositorio.

## Regla principal

Un asiento `POSTED` nunca se corrige editándolo o eliminándolo. La corrección se registra como:

1. reverso relacionado cuando se quiere neutralizar el efecto original; o
2. ajuste contable nuevo cuando se necesita un efecto adicional/posterior.

## Antes de desplegar la migración en un entorno con datos

### 1. Confirmar backup y restore

- disponer de backup verificable del entorno objetivo;
- validar que existe un procedimiento de restore compatible con la versión de PostgreSQL;
- registrar quién autoriza el cambio y la ventana de despliegue;
- no ejecutar la migración de producción a modo de prueba.

Seguir también `docs/DATABASE_SECURITY_RECOVERY_RUNBOOK.md`.

### 2. Inventariar ledger actual

Ejecutar consultas de sólo lectura equivalentes a:

```sql
SELECT "source", "posted", COUNT(*)
FROM "LedgerEntry"
GROUP BY "source", "posted"
ORDER BY "source", "posted";

SELECT le."id", le."tenantId", le."source", le."sourceId",
       le."salesInvoiceId", le."purchaseInvoiceId", le."fiscalPeriod"
FROM "LedgerEntry" le
WHERE le."posted" = FALSE
  AND le."source" IN ('sales', 'purchase')
ORDER BY le."tenantId", le."createdAt";
```

No modificar filas desde estas consultas.

### 3. Revisar balance de filas existentes

```sql
SELECT le."id", le."tenantId", le."source", le."fiscalPeriod",
       COUNT(ll."id") AS lines,
       COALESCE(SUM(ll."debit"), 0) AS debit,
       COALESCE(SUM(ll."credit"), 0) AS credit
FROM "LedgerEntry" le
LEFT JOIN "LedgerLine" ll ON ll."entryId" = le."id"
GROUP BY le."id"
HAVING le."posted" = TRUE
   AND (
     COUNT(ll."id") < 2
     OR COALESCE(SUM(ll."debit"), 0) <> COALESCE(SUM(ll."credit"), 0)
   );
```

Cualquier resultado es un **bloqueo**. No “cuadrar” el asiento editando líneas sin investigar su documento fuente y evidencia.

## Política de backfill

### Backfill automático permitido por la migración

La migración puede clasificar como `POSTED` únicamente un asiento legacy que cumpla todo:

- `posted=false`;
- `source=sales` con factura del mismo tenant, o `source=purchase` con compra del mismo tenant;
- documento en estado `issued`, `paid` u `overdue`;
- vínculo inequívoco por `salesInvoiceId/purchaseInvoiceId` o por el `sourceId` histórico esperado;
- asiento balanceado y estructuralmente válido.

Para estas filas:

- `posted=true`;
- `postedAt=createdAt` si no existe otro timestamp demostrable;
- `postedBy=NULL`, porque no se inventa un actor histórico.

### Filas que NO se infieren automáticamente

- asiento operacional sin documento fuente válido;
- documento draft con ledger inesperado;
- documento cancelled cuyo original/reverso histórico no pueda reconstruirse sin revisión;
- reversos legacy manuales ambiguos;
- duplicados o múltiples asientos candidatos para el mismo documento;
- asiento vacío/descuadrado/estructuralmente inválido.

La migración falla de forma cerrada si detecta estas condiciones. El error no debe silenciarse ni evitarse modificando el SQL de producción.

## Cómo resolver una fila ambigua

1. Identificar tenant y documento fuente.
2. Reconstruir evidencia desde factura/compra, historial Git sólo si explica código histórico, AuditLog y datos disponibles.
3. Determinar si la fila era:
   - efecto contable real que debe quedar posted;
   - draft legítimo;
   - duplicado/inconsistencia que requiere un ajuste/reverso explícito.
4. Documentar la decisión y el actor que la autoriza.
5. Aplicar una corrección aprobada en una transacción separada y auditable.
6. Volver a ejecutar el preflight.

No clasificar por intuición ni por el mero hecho de que `posted=false`.

## Posting manual

Flujo soportado:

```text
POST /api/v1/accounting/entries
        -> DRAFT
POST /api/v1/accounting/entries/:id/post
        -> POSTED
```

Antes de posting el backend y PostgreSQL verifican balance y período. Después del posting:

- cabecera inmutable;
- líneas inmutables;
- delete bloqueado;
- el evento `ledger.entry.posted` debe existir en `AuditLog`.

Un segundo posting es error de dominio; no se usa para “actualizar” metadata.

## Reverso manual

Flujo:

```text
POST /api/v1/accounting/entries/:id/reverse
{
  "fiscalPeriod": "AAAA-MM",
  "date": "opcional",
  "description": "opcional"
}
```

El período del reverso debe estar abierto. Es válido que sea posterior al original.

Verificar después:

- original sigue presente y sin cambios;
- reverso `posted=true`;
- `reversal.reversalOfId == original.id`;
- mismo tenant;
- suma del reverso balanceada;
- líneas del reverso intercambian debit/credit del original;
- `AuditLog.action = ledger.entry.reversed`.

## Anulación de venta/compra

Los endpoints de anulación aceptan opcionalmente:

```json
{
  "reason": "Motivo",
  "reversalFiscalPeriod": "AAAA-MM",
  "reversalDate": "2026-08-27T12:00:00.000Z"
}
```

Si el período original está cerrado, especificar un período abierto permitido por política. No reabrir ni editar el asiento original sólo para poder cancelar.

Si el sistema detecta múltiples asientos originales, un asiento legacy no posted o una relación ambigua, la operación se bloquea para conciliación.

## Reverso de un reverso

No está permitido. Política v91:

```text
ORIGINAL -> REVERSO
```

Un error posterior se corrige con un **ajuste nuevo**, no con:

```text
ORIGINAL -> REVERSO -> REVERSO DEL REVERSO
```

Esto mantiene una relación simple y auditable.

## Verificación de inmutabilidad DB

En QA PostgreSQL real deben probarse como mínimo:

- `UPDATE LedgerEntry` posted -> SQLSTATE `23514`;
- `DELETE LedgerEntry` posted -> `23514`;
- INSERT/UPDATE/DELETE de `LedgerLine` de posted -> `23514`;
- posting descuadrado -> `23514`;
- relación de reverso cross-tenant -> `23514`;
- segundo reverso directo -> constraint/guard;
- reverso de reverso -> `23514`;
- posting/reverso en período cerrado -> rechazo;
- original intacto luego del reverso.

No ejecutar pruebas destructivas de enforcement contra producción.

## Observabilidad

Eventos esperados:

- `ledger.entry.created` para creación de draft manual;
- `ledger.entry.posted` obligatorio para posting;
- `ledger.entry.reversed` obligatorio para reverso.

Los eventos críticos deben incluir actor cuando existe, IP y user-agent disponibles. El esquema actual no dispone de `requestId/correlationId`; no se simula un valor inexistente.

No incluir documento completo, credenciales, tokens ni información sensible innecesaria en logs.

## Rollback operativo

Si el despliegue de aplicación falla después de aplicar la migración:

1. detener nuevas mutaciones contables si existe riesgo de incompatibilidad;
2. conservar DB y ledger; no eliminar triggers ni reversos como primera medida;
3. restaurar una aplicación compatible o desplegar hotfix revisado;
4. sólo considerar migración correctiva de DB con backup/restore probado.

Una vez que existan postings/reversos reales bajo v91, eliminar columnas/relaciones o volver a habilitar edición de posted no es un rollback seguro.

## Checklist de despliegue

- [ ] backup creado y restore verificado;
- [ ] preflight sin filas posted inválidas;
- [ ] filas legacy ambiguas = 0 o expediente de resolución aprobado;
- [ ] migración en PostgreSQL representativo aprobada;
- [ ] Prisma generate/validate aprobados;
- [ ] tests DRAFT→POSTED aprobados;
- [ ] tests de inmutabilidad DB aprobados;
- [ ] tests tenant A→B y B→A aprobados;
- [ ] venta/compra emitida crea posted;
- [ ] reversos venta/compra enlazados;
- [ ] AuditLog de posting/reverso verificado;
- [ ] regresión de reportes confirma que drafts no contaminan balance;
- [ ] evidencia asociada al SHA final.
