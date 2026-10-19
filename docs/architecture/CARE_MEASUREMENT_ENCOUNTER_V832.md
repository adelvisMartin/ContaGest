# #832 · Vínculos de medición clínica

El POST `health/measurements` comprueba la propiedad del paciente y, cuando se proporciona `encounterId`, ahora también comprueba que el encuentro pertenece **al mismo tenant y paciente** antes de insertar. Se mantiene el permiso `health.manage`, el SQL parametrizado y el ámbito de tenant resuelto en el backend. `encounterId` ausente conserva el comportamiento anterior.

Las pruebas de contrato comprueban el predicado de tres claves y el orden previo a la escritura. **PostgreSQL 17, HTTP E2E y pruebas de tenant A/B NOT_EXECUTED**; este incremento no certifica el programa de privacidad clínica completo #832 y el issue permanece abierto. No migraciones ni cambios en datos históricos.