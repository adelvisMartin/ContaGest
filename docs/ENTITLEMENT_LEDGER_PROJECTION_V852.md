# #852 — proyección exacta de ledger de derechos (incremento parcial)

El módulo puro `backend/src/modules/entitlements/entitlement-ledger-projection.mjs` reconstruye saldo y movimientos de un derecho finito a partir de eventos en orden secuencial, con milésimas BigInt. Rechaza scope cruzado tenant/beneficiary, reintentos con ID o effectKey duplicado, cantidades/orden inválidos, consumes sin saldo y releases que superen el grant. Distingue CONSUME, REFUND_REVOKE y EXPIRE de RELEASE; cada renovación debe usar un entitlement nuevo.

**No crea un entitlement ni escribe dinero, saldo, base de datos, booking, licencia SaaS o membership Gym.** Este resultado readOnly no es autoridad de consumo: el futuro handler deberá validar y escribir el evento de manera atómica e idempotente, con PostgreSQL 17 real y aislamiento entre tenants.

QA: `node --test tests/entitlement_ledger_projection_v852.test.mjs` (regresiones unitarias). Pending: Prisma schema/immutable ledger, grant/consume DB, #746/#787 bridge, concurrency and PostgreSQL/browser E2E. Rollback: revert three files sin migraciones. Issue #852 permanece abierto.

## Regla de recuperación (`RELEASE`) — protección de regresión

`RELEASE` sólo puede recuperar cantidad previamente consumida por eventos `CONSUME` del mismo entitlement. Un `REFUND_REVOKE` o `EXPIRE` reduce derechos **irreversiblemente para esta proyección**: nunca habilita `RELEASE`. Un segundo release del mismo consumo también se rechaza. Los saldos siguen derivados de eventos inmutables, BigInt con precisión de tres decimales; no se crea un contador mutable ni se modifica el contrato de salida.

Esta protección **no** resuelve por sí sola la vinculación causal entre cada release y su consumo de origen: la futura autoridad transaccional debe almacenar y verificar referencias/effect keys, fechas de expiración, política de cancelación/reembolso y el commit atómico con booking/check-in bajo PostgreSQL 17. Los tests focalizados no prueban esa integración.
