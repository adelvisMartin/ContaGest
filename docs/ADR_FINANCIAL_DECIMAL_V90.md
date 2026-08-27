# ADR — Financial Decimal Core (#90)

- **Estado:** Adoptado para el primer conjunto de dominios críticos
- **Issue:** #90
- **Ámbito:** backend financiero de ContaGest VE

## Contexto

PostgreSQL/Prisma ya persiste dinero con `Decimal(18,2)`, cantidades con `Decimal(18,3)`, tasas de cambio con `Decimal(18,4)` y porcentajes fiscales habituales con `Decimal(5,2)`. El problema estaba en la capa de aplicación: distintos módulos convertían esos valores a `Number` antes de sumar, multiplicar, calcular impuestos, balancear asientos o actualizar saldos.

## Decisión

Se reutiliza `Prisma.Decimal` como primitive decimal canónico para evitar una dependencia financiera adicional. La aplicación no debe convertir importes a IEEE-754 `number` durante cálculos de dominio.

Los helpers canónicos viven en:

- `backend/src/shared/financial/decimal.ts`: parse, add/subtract, multiply/divide, compare, quantize, percent, serialize;
- `backend/src/shared/financial/zod.ts`: validación de transporte `string | number` y conversión inmediata a Decimal;
- `backend/src/shared/financial/invoice.ts`: cálculo común de líneas, subtotal, impuesto y total.

## Escalas y precisión

| Concepto | Escala | Precisión DB objetivo | Helper |
| --- | ---: | ---: | --- |
| dinero | 2 | 18 | `money()` |
| cantidad / stock | 3 | 18 | `quantity()` |
| tasa de cambio | 4 | 18 | `exchangeRate()` |
| porcentaje | 2 | 5 | `percentage()` |

Las entradas con más decimales de los permitidos se rechazan; no se truncan silenciosamente. También se rechazan `NaN`, `Infinity`, notación exponencial y valores que excedan la precisión declarada.

## Política de redondeo

La política técnica del primitive es **ROUND_HALF_UP** y todo redondeo debe ser explícito mediante `quantize`/`quantizeMoney`.

Para facturas bajo el esquema actual:

1. cantidad y precio/costo se mantienen exactos en sus escalas de entrada;
2. `cantidad × precio/costo` se redondea a 2 decimales cuando se materializa el `total` de la línea (`Decimal(18,2)`);
3. el impuesto se calcula sobre esos totales de línea persistibles y se redondea una vez, después de agregarlos, a 2 decimales;
4. el total de factura es `subtotal + impuesto`, ambos ya en escala monetaria.

Esta ADR **no redefine reglas tributarias venezolanas** ni decide cómo debe redondearse una obligación fiscal cuando una norma específica establezca otra regla. Una modificación regulatoria debe aportar su fuente y ticket propio.

## Contabilidad

`assertBalanced` suma débitos y créditos como Decimal y exige igualdad decimal exacta. No existe tolerancia floating-point ni redondeo tardío para hacer parecer balanceado un asiento.

Reversos copian e intercambian los `Decimal` persistidos; no pasan por `Number`.

## API y compatibilidad

### Entrada

Durante la transición se aceptan:

- string decimal, recomendado: `"1234.56"`;
- JSON number, por compatibilidad con clientes actuales.

El backend convierte inmediatamente la entrada al primitive Decimal. Para cifras grandes o cuando el valor exacto de transporte importe, el cliente debe enviar string; un JSON number puede haber perdido precisión antes de llegar al servidor.

### Salida

Los objetos Prisma conservan su serialización decimal. En endpoints que históricamente devolvían números (`banking`, `payroll`, `trial-balance`) se mantiene temporalmente el campo numérico legacy y se agrega su equivalente exacto `*Exact` como string decimal.

Ejemplos:

```json
{
  "amount": 0.2,
  "amountExact": "0.20"
}
```

```json
{
  "debit": 0.3,
  "debitExact": "0.30"
}
```

`serializeLegacyNumber()` está permitido **solo en la frontera de respuesta**. Nunca debe alimentar cálculos, persistencia, balances o decisiones de negocio. Un ticket posterior puede retirar los campos numéricos legacy después de migrar consumidores.

## Persistencia

No se modifica el DDL en #90 porque la auditoría del schema actual confirmó escalas suficientes para este cambio. Los Decimal se mantienen hasta Prisma/PostgreSQL.

## Módulos cubiertos

- contabilidad: entrada, `assertBalanced`, posting y trial balance;
- ventas: líneas, subtotal, IVA, total, posting y reversos;
- compras: líneas, subtotal, IVA, total, posting y reversos;
- bancos: movimientos, deltas, balance y borrado de movimiento;
- nómina: entradas y agregados de período;
- CRUD financiero: producto/costo/precio/stock, cuenta bancaria, salario y períodos fiscales.

La ruta fiscal inspeccionada no realiza aritmética monetaria, por lo que no se alteró.

## Pruebas obligatorias

- primitive: `0.1 + 0.2`, suma/resta/multiplicación/división, límites de escala/precisión, positivos/negativos y `x.xx5`;
- golden invoices con cantidades, porcentajes fraccionarios y tasa de cambio;
- ledger exacto `0.10 + 0.20 == 0.30`;
- PostgreSQL real: venta → factura → asiento, compra → asiento, banco antes/después, trial balance y agregados de nómina;
- casos inválidos: `NaN`, `Infinity`, notación exponencial, escala excesiva y precisión fuera de rango.

## Migración desde `Number`

1. validar la entrada con `decimalSchema`;
2. mantener Decimal dentro del servicio/transacción;
3. usar helpers canónicos en lugar de operadores `+ - * /` sobre importes;
4. redondear solo en el límite documentado del concepto;
5. persistir Decimal directamente;
6. para compatibilidad pública, serializar únicamente al final y exponer variante exacta en string;
7. agregar un golden test antes de retirar el camino anterior.

## Rollback

No hay migración de datos. El rollback consiste en revertir los commits de #90. Los valores persistidos siguen usando las mismas columnas Decimal existentes; por tanto no se requiere backfill ni restauración de schema.
