# #743 — cierre bancario: igualdad aritmética no es conciliación completa

El servicio existente `bank-reconciliation.service.ts` ya procesa extractos, matching, reconciliaciones, reversos e historial con autoridad tenant/RBAC del v237. Este incremento añade campos **reconciliationReady** y **readinessReason** al resumen de cierre, sin modificar el indicador anterior **exact** (solo indica diferencia numérica igual a cero).

Un cierre queda listo únicamente si hay saldo final del extracto, la moneda coincide con la cuenta, hay líneas de extracto y ninguna permanece sin conciliar, además de que la diferencia sea cero. No se redondea ni mezcla monedas; la resta monetaria sigue en la política canónica de Prisma.Decimal ya existente. El helper puro nunca escribe conciliaciones ni asientos.

Pruebas: `node --test tests/bank_closing_readiness_v743.test.mjs`. QA pendiente: PostgreSQL 17, cuentas/tenants A/B, conciliaciones de varios import, cierres con reversos/period locks y browser. #743 OPEN hasta QA y DoD bancario completo. Rollback: revert los cuatro archivos, sin migración.
