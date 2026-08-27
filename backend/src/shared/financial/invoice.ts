import {
  add,
  money,
  multiply,
  percentOf,
  percentage,
  quantity,
  quantizeMoney,
  type DecimalInput,
  type DecimalValue
} from './decimal.js';

export type InvoiceCalculationLine = {
  quantity: DecimalInput;
  unitAmount: DecimalInput;
  taxRate: DecimalInput;
};

export type CalculatedInvoiceLine = {
  quantity: DecimalValue;
  unitAmount: DecimalValue;
  taxRate: DecimalValue;
  total: DecimalValue;
};

export type InvoiceTotals = {
  lines: CalculatedInvoiceLine[];
  subtotal: DecimalValue;
  tax: DecimalValue;
  total: DecimalValue;
};

/**
 * Canonical invoice policy for the current schema:
 * 1. quantity is Decimal(18,3), unit amount is Decimal(18,2), tax rate is Decimal(5,2);
 * 2. each persisted line total is rounded HALF_UP to money scale (2);
 * 3. invoice tax is calculated from persisted line totals and rounded once after aggregation;
 * 4. invoice total is subtotal + rounded tax, both already at money scale.
 *
 * This deliberately does not encode Venezuela-specific tax law. It only makes the existing
 * ContaGest persistence boundaries deterministic; fiscal-rule changes belong to their own ticket.
 */
export function calculateInvoiceTotals(inputLines: InvoiceCalculationLine[]): InvoiceTotals {
  const lines = inputLines.map((line) => {
    const parsedQuantity = quantity(line.quantity);
    const parsedUnitAmount = money(line.unitAmount);
    const parsedTaxRate = percentage(line.taxRate);
    return {
      quantity: parsedQuantity,
      unitAmount: parsedUnitAmount,
      taxRate: parsedTaxRate,
      total: quantizeMoney(multiply(parsedQuantity, parsedUnitAmount))
    };
  });

  const subtotal = quantizeMoney(add(...lines.map((line) => line.total)));
  const tax = quantizeMoney(add(...lines.map((line) => percentOf(line.total, line.taxRate))));
  const total = quantizeMoney(add(subtotal, tax));
  return { lines, subtotal, tax, total };
}
