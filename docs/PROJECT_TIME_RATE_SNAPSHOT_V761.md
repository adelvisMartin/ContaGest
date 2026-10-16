# #761 · Tarifa horaria exacta para registro de tiempo (propuesta v1)

**Estado:** incremento aditivo de dominio, sin facturación habilitada. `SOURCE_REUSE=NONE`.

## Autoridad y flujo

`prepareProjectTimeRateSnapshotIntent` en `backend/src/modules/projects/time-entry-rate-snapshot-intent.ts` reutiliza **ejecutando** `normalizeProjectTimePeriod` y `prepareProjectTimeReviewIntent`. Solo procesa una propuesta de **aprobación** de horas cuya entrada, proyecto, empresa, cliente y miembro sean coherentes con la tarifa consultada por un servidor autorizado. El revisor debe ser distinto del autor y tener una concesión `canReviewTime` **derivada del RBAC backend**; no debe leerse del JSON enviado por el navegador.

La cotización de tarifa ha de proceder de un RateCard **cargado de PostgreSQL para el tenant**, con `rateCardId`, `rateCardRevision`, `hourlyRateExact`, `currency` y `effectiveFromUtc`. `capturedAtUtc` debe producirlo el servidor, en UTC canónico; no es una marca de tiempo confiable si proviene del cliente. El helper verifica solo consistencia de esos datos, no su autenticidad, su validez legal ni su existencia en base de datos. Se bloquean cambios de empresa/cliente/proyecto, revisiones obsoletas, autoaprobaciones y entradas vinculadas a facturas. El tiempo usa el cálculo UTC existente del ticket #761.

## Decimal exacto, sin facturar

La tarifa requiere exactamente dos decimales, moneda de tres letras mayúsculas y valor positivo. Los céntimos/hora se convierten mediante `BigInt`, nunca mediante `Number` de punto flotante. El prorrateo de `M` minutos se expresa en unidades menores como fracción `céntimosPorHora × M / 60`:

| Caso | Resultado |
|---|---|
| USD 100.00/h durante 45 minutos | Numerador `450000`, denominador `60`, `exactMinorUnits=7500` |
| USD 10.00/h durante 1 minuto | Numerador `1000`, denominador `60`, `exactMinorUnits=null`, `requiresExplicitRoundingPolicy=true` |

**No se redondea silenciosamente.** La moneda de tres letras es una restricción sintáctica, no validación ISO 4217 ni del catálogo de divisas del tenant. Antes de crear líneas de `SalesInvoice`, la autoridad fiscal/contable debe fijar precisión, política de prorrateo, redondeo por línea/agregado y versión aplicable. Un resultado exacto tampoco permite saltarse impuestos, permisos o estado de facturación.

El resultado está congelado, conserva la versión de la tarifa y las revisiones CAS de la propuesta, y declara `persisted=false`, `approvedInDatabase=false`, `billableAuthorized=false`, `invoiceAuthorized=false`. **No almacena** la aprobación, no produce notas de crédito ni contabiliza dinero. El ledger y la factura existente son la única autoridad para dinero.

## Verificación y siguientes pasos

Con las dependencias del backend (`tsx`) instaladas:

```sh
cd backend
npx tsx --test ../tests/project_time_rate_snapshot_v761.test.mjs
```

La verificación sin dependencias en contenedor aislado se realizó compilando los tres módulos de #761 mediante `tsc` global 5.8.3 a JavaScript en un directorio temporal, colocándolos junto a las fuentes `.ts` solo durante el test y ejecutando `node --experimental-strip-types --test` contra los tres tests de #761: **40/40 PASS**; verificación de tipos estricto **PASS**. Esto no equivale a `npm ci`, al TypeScript 5.9.3 bloqueado en el monorepo ni a pruebas de base de datos o navegador.

**Faltan para cerrar #761:** migraciones/schema Project/Task/TimeEntry/RateCard, carga server-authenticated, RBAC/tenant RLS, actualización CAS y aprobación **atómicas**, audit/`approvedAt`, snapshot persistente por aprobación, reglas monetarias/decimales aceptadas, generación idempotente de borrador `SalesInvoice` y pruebas PG17/API/browser/financieras. Ningún check en cola es PASS; no desactivar checks requeridos por cuota de proveedor.

Rollback: revertir únicamente este helper, su test y la presente documentación. No hay migración, API, estado de datos ni permiso nuevo.

## Corrección de vigencia al inicio del trabajo (2026-10-16)

El contrato puro `prepareProjectTimeRateSnapshotIntent` tenía una brecha:
comprobaba únicamente que la tarifa estuviese vigente a la hora de la
**captura**. Eso permitía elegir una tarifa activada después de que comenzó
el turno (por ejemplo, 13:15 para horas de 13:00 a 13:45) y aplicar el
prorrateo retroactivamente. Ahora la tarifa debe entrar en vigor **a más
tardar en el instante UTC de inicio del período**. Una tarifa iniciada
a mitad del turno se rechaza con `PROJECT_TIME_RATE_EFFECTIVE_AFTER_START`:
no se hace split ni se inventa política de redondeo. La captura del servidor
tampoco puede anteceder al fin real del período; se rechaza con
`PROJECT_TIME_RATE_CAPTURE_BEFORE_END`. Los bordes exactamente iguales
sí son válidos. Las regresiones incluyen transición DST de noviembre.

Esta validación solo comprueba un `quote` ya cargado por autoridad server.
**No verifica el historial completo de versiones**: el selector real de
RateCard sigue siendo responsable de rechazar otra vigencia que empiece
dentro de un turno, y PostgreSQL/tenant/RBAC son requisitos previos para
activar #761. `persisted:false`, `billableAuthorized:false` e
`invoiceAuthorized:false` se conservan; sin facturas ni operaciones
financieras. El PR #1126 continúa pendiente de validación PostgreSQL17 y
autenticación antes de poder fusionarse.
