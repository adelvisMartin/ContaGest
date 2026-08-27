import { z } from 'zod';
import {
  assertNonNegative,
  assertPositive,
  DecimalDomainError,
  parseDecimal,
  type DecimalInput,
  type DecimalKind,
  type DecimalValue
} from './decimal.js';

type DecimalSchemaOptions = {
  defaultValue?: DecimalInput;
  nonnegative?: boolean;
  positive?: boolean;
};

const decimalTransport = z.union([
  z.string().trim().min(1).max(64),
  z.number().finite()
]);

export function decimalSchema(kind: DecimalKind, options: DecimalSchemaOptions = {}) {
  const input = z.preprocess((value) => {
    if (value === undefined && options.defaultValue !== undefined) return options.defaultValue;
    return value;
  }, decimalTransport);

  return input.transform((value, ctx): DecimalValue => {
    try {
      const parsed = parseDecimal(value, kind);
      if (options.positive) return assertPositive(parsed);
      if (options.nonnegative) return assertNonNegative(parsed);
      return parsed;
    } catch (error) {
      const message = error instanceof DecimalDomainError ? error.message : 'Valor decimal inválido.';
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
  });
}
