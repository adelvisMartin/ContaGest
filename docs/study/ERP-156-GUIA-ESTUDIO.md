# Guía de estudio — ERP #156

## Qué es un golden dataset

Un conjunto fijo de operaciones pequeñas cuyo resultado correcto se conoce de antemano. Sirve como alarma ante regresiones.

## Por qué todo está en centavos

Guardar/comparar enteros evita errores típicos de coma flotante como `0.1 + 0.2`. La conversión decimal usa una regla explícita de redondeo.

## Invariantes principales

**Inventario:** apertura + entradas − salidas = cierre.

**CxC/CxP:** documentos − cobros/pagos = saldo pendiente.

**Banco:** apertura + entradas − salidas = cierre y debe reconciliar contra el estado esperado.

**Nómina:** bruto − deducciones = neto.

**Impuesto sintético:** débito − crédito = obligación esperada.

**Partida doble:** suma de débitos = suma de créditos.

**Idempotencia:** repetir la misma operación con la misma clave no duplica su efecto.

## Importante

Los porcentajes del fixture son sintéticos. Un test determinista nunca debe presentarlos como tasa legal vigente.

## Preguntas

1. ¿Qué ventaja ofrece un golden dataset frente a datos aleatorios?
2. ¿Por qué se evitan floats para dinero?
3. ¿Qué detecta el balance débito=crédito?
4. ¿Qué significa idempotencia en una factura/pago?
5. ¿Por qué un fixture sintético no sustituye revisión fiscal real?
