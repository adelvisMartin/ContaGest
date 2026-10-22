# #852 — proyección exacta de ledger de derechos (incremento parcial)

El módulo puro `backend/src/modules/entitlements/entitlement-ledger-projection.mjs` reconstruye saldo y movimientos de un derecho finito a partir de eventos en orden secuencial, con milésimas BigInt. Rechaza scope cruzado tenant/beneficiary, reintentos con ID o effectKey duplicado, cantidades/orden inválidos, consumes sin saldo y releases que superen el grant. Distingue CONSUME, REFUND_REVOKE y EXPIRE de RELEASE; cada renovación debe usar un entitlement nuevo.

**No crea un entitlement ni escribe dinero, saldo, base de datos, booking, licencia SaaS o membership Gym.** Este resultado readOnly no es autoridad de consumo: el futuro handler deberá validar y escribir el evento de manera atómica e idempotente, con PostgreSQL 17 real y aislamiento entre tenants.

QA: `node --test tests/entitlement_ledger_projection_v852.test.mjs` (regresiones unitarias). Pending: Prisma schema/immutable ledger, grant/consume DB, #746/#787 bridge, concurrency and PostgreSQL/browser E2E. Rollback: revert three files sin migraciones. Issue #852 permanece abierto.

## Regla de recuperación (`RELEASE`) — protección de regresión

`RELEASE` sólo puede recuperar cantidad previamente consumida por eventos `CONSUME` del mismo entitlement. Un `REFUND_REVOKE` o `EXPIRE` reduce derechos **irreversiblemente para esta proyección**: nunca habilita `RELEASE`. Un segundo release del mismo consumo también se rechaza. Los saldos siguen derivados de eventos inmutables, BigInt con precisión de tres decimales; no se crea un contador mutable ni se modifica el contrato de salida.

Esta protección **no** resuelve por sí sola la vinculación causal entre cada release y su consumo de origen: la futura autoridad transaccional debe almacenar y verificar referencias/effect keys, fechas de expiración, política de cancelación/reembolso y el commit atómico con booking/check-in bajo PostgreSQL 17. Los tests focalizados no prueban esa integración.

## Integridad de historial parcial (2026-10-22)

La proyección exige ahora secuencias **contiguas** desde el evento GRANT (1), además de orden creciente. El antiguo chequeo monotónico permitía recibir 1 y 3 sin 2: una consulta incompleta podía ocultar un CONSUME y sobrestimar el saldo. Se rechaza con `ENTITLEMENT_INVALID_SEQUENCE` y regresiones; no se reconstruye ni suple un evento faltante. Pendiente integración DB/worker/booking bajo transacción.

## Elegibilidad determinista de lectura — 2026-10-22

El módulo puro `entitlement-eligibility-policy.mjs` resuelve una **vista previa** de derechos entre snapshots server-side, con cantidad en milésimas BigInt, scope ALL/SERVICE/CATEGORY, location, vigencia `[validFrom, validUntil)` en UTC, prioridad descendente y desempate por vencimiento más próximo e ID. Rechaza mezcla de tenant/beneficiary, duplicados, faltantes, counters forjados en unlimited y fechas malformadas. Respuesta inmutable `writeAuthorized:false` y `consumed:false`. No autoriza acceso ni sustituye revalidación transaccional, registro de events ni idempotencia PostgreSQL. Primero vincularla a un repositorio authoritative server-only, después integrar #848/#746 y probar concurrencia de último crédito. **No exponer este policy directamente a request.body.**

QA: `node --test tests/entitlement_eligibility_v852.test.mjs` (elegibilidad/negativos y desempate).

## Persistencia de concesiones finitas (2026-10-22)

El schema canónico incluye `BenefitDefinition`, `CustomerEntitlement` y `EntitlementLedgerEvent` con vínculos compuestos por tenant a `Product`, `Client`, `ServiceDefinition`, `ServiceCatalogCategory` y `BusinessLocation`. Los registros del derecho congelan el beneficio al otorgar, y eventos/concesiones son append-only a nivel PostgreSQL (trigger + privilegio runtime SELECT/INSERT). La API `/api/v1/customer-entitlements` exige tenant y `admin.manage`, valida un motivo de cortesía y crea entitlement+GRANT+auditoría en una sola transacción. La clave `effectKey` usa un mutex transaccional por tenant/efecto antes de buscar replay, con índice único de PostgreSQL como defensa final. La lectura de saldos reconstruye el ledger BigInt milésimas; jamás acepta `remaining` del usuario.

**Límite de alcance:** sólo beneficiarios `Client` con derechos **finitos** y concesiones **manuales**, sin generar ingresos ni contabilizaciones. No activar todavía CONSUME/refund ni mapear automáticamente GymMember/remainingAccesses: falta #746/#848, vinculación causal booking y concurrencia last-credit verificada en PG17. `LicenseKey` SaaS permanece fuera de este ledger. La migración, API y CI se consideran `NOT_EXECUTED` en PostgreSQL hasta un entorno descartable.

## Internal booking consume seam — 2026-10-22

Se incorporó `consumeCustomerRightInBookingTransaction(tx, ctx, input)` como **comando interno no montado en ninguna API**. Sólo permite consumo cuando ya existe un `SchedulingBooking` confirmado del tenant cuyo `sourceType='client'` y `sourceId` coincide con el beneficiario, tiene `SchedulingResourceAllocation` activa de la misma sede y la fecha/hora está dentro de la vigencia. La función recibe la **misma** transacción Prisma `tx` del creador de la reserva, bloquea tenant+entitlement con advisory lock, reconstruye historial contiguo, valida cantidad BigInt milésimas, claves de efecto y scope servicio/categoría, y crea CONSUME + auditoría sólo dentro de esa transacción. Dos intentos con el mismo efecto no crean dos eventos. **No** invocar después de confirmar un booking o pasaría a ser un segundo efecto no atómico. Como #848 aún no cuenta con un adapter de escritura montado que suministre esta misma `tx`, esto no certifica booking+consume E2E ni sustituye la integración de Gym. Requiere PG17 race/rollback y prueba de recurso GiST.

### Carrera con cancelación concurrente

El comando de consumo ahora toma locks PostgreSQL `FOR SHARE` sobre la `SchedulingBooking` confirmada (tenant+cliente) y su `SchedulingResourceAllocation` activa, dentro de la misma transacción. Una cancelación/release concurrente debe esperar, o gana y se rechaza el consumo. **Eso no reemplaza el handler de cancelación que debe restaurar el derecho con RELEASE idempotente y causal; sigue pendiente y no es un flujo completo.** La estrategia se validará con dos conexiones PG17 y race scheduling/entitlement/refund.

## PG17 real QA contract, no production data

`qa/entitlement-booking-real-v852.test.ts` exige `CG_ENTITLEMENT_QA_ISOLATED=true`, PostgreSQL17, DB `*_v852`, sin Vercel/production y seed QA. Ejercita vía API beneficio/GRANT/replay/mismatch, lectura ledger, crea `SchedulingBooking + SchedulingResourceAllocation + CONSUME` dentro de una sola `prisma.$transaction`, reintento sin doble débito, rollback explícito y negativo tenant B. Requiere GiST #848 y RLS #845 montados. **NOT_EXECUTED** en entorno actual; estos requisitos no se reemplazan por tests de fuente. No usa un handler de cancelación/refund ni frontend Gym — DoD #852 continúa abierta.
