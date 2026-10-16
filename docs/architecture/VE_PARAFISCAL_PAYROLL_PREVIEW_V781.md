# #781 — Parafiscales de nómina: desglose sintético revisado

El nuevo helper de **previsualización** `ve-parafiscal-breakdown-preview.ts` reside en el módulo `payroll` existente y reutiliza `ve-reviewed-rule-policy.ts`, sin crear otro repositorio de nómina. A partir de aportes explícitos `FAOV`, `IVSS`, `INCES` y una clasificación de riesgo y nómina, obtiene por separado **deducciones del trabajador** y **aportes patronales** con cálculo BigInt de regla revisada. No interpreta cuáles aportes son obligatorios ni qué base/tope aplica; cada familia/side debe tener una regla distinta con proveniencia, vigencia y selector exactos. Los porcentajes de test son sintéticos, no tablas venezolanas.

Rechaza duplicados, cross-tenant, fecha vencida, reglas no activas, montos negativos o superiores a base, y descuentos mayores que el bruto. Devuelve snapshots inmutables de cada componente. **No modifica `PayrollReceipt`, `PayrollPeriod`, documentos, pagos, contabilidad ni bank ledger** y no expone API para calcular a partir de tasas enviadas por el navegador.

El DoD requiere aprobación jurídica #751, clasificación #774, rol contable #785, bases/mínimos/topes/obligaciones verificadas, transacciones nómina idempotentes y conciliación, pruebas PG17 tenant A/B y E2E. **#781 permanece OPEN/PARTIAL; no activar ni fusionar hasta validación.**
