import { Prisma } from '@prisma/client';

export const DECIMAL_SCALE = {
  money: 2,
  quantity: 3,
  exchangeRate: 4,
  rate: 4,
  percentage: 2
} as const;

export const DECIMAL_PRECISION = {
  money: 18,
  quantity: 18,
  exchangeRate: 18,
  rate: 18,
  percentage: 5
} as const;

export type DecimalKind = keyof typeof DECIMAL_SCALE;
export type DecimalValue = Prisma.Decimal;
export type DecimalInput = Prisma.Decimal | string | number;
export type DecimalErrorCode =
  | 'DECIMAL_INVALID'
  | 'DECIMAL_TOO_LONG'
  | 'DECIMAL_SCALE'
  | 'DECIMAL_PRECISION'
  | 'DECIMAL_NEGATIVE'
  | 'DECIMAL_NOT_POSITIVE'
  | 'DECIMAL_DIVIDE_BY_ZERO';

export class DecimalDomainError extends Error {
  constructor(public readonly code: DecimalErrorCode, message: string) {
    super(message);
    this.name = 'DecimalDomainError';
  }
}

const MAX_INPUT_LENGTH = 64;
const DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;
const ROUNDING_MODE = Prisma.Decimal.ROUND_HALF_UP;

function sourceString(value: DecimalInput): string {
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new DecimalDomainError('DECIMAL_INVALID', 'El valor decimal debe ser finito.');
    return String(value);
  }
  if (typeof value !== 'string') throw new DecimalDomainError('DECIMAL_INVALID', 'Tipo decimal no soportado.');
  return value.trim();
}

function validateShape(raw: string) {
  if (!raw || raw.length > MAX_INPUT_LENGTH) {
    throw new DecimalDomainError('DECIMAL_TOO_LONG', `El valor decimal debe contener entre 1 y ${MAX_INPUT_LENGTH} caracteres.`);
  }
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new DecimalDomainError('DECIMAL_INVALID', 'Formato decimal inválido. Usa dígitos y punto decimal, sin notación exponencial.');
  }
}

function validatePolicy(raw: string, kind: DecimalKind) {
  const unsigned = raw.replace(/^[+-]/, '');
  const [integerPart, fractionPart = ''] = unsigned.split('.');
  const integerDigits = integerPart.replace(/^0+(?=\d)/, '').length;
  const scale = DECIMAL_SCALE[kind];
  const precision = DECIMAL_PRECISION[kind];
  if (fractionPart.length > scale) {
    throw new DecimalDomainError('DECIMAL_SCALE', `${kind} admite como máximo ${scale} decimales.`);
  }
  if (integerDigits > precision - scale) {
    throw new DecimalDomainError('DECIMAL_PRECISION', `${kind} excede la precisión soportada (${precision},${scale}).`);
  }
}

export function parseDecimal(value: DecimalInput, kind: DecimalKind): DecimalValue {
  const raw = sourceString(value);
  validateShape(raw);
  validatePolicy(raw, kind);
  try {
    return new Prisma.Decimal(raw);
  } catch {
    throw new DecimalDomainError('DECIMAL_INVALID', 'No se pudo construir el valor decimal.');
  }
}

export function money(value: DecimalInput): DecimalValue {
  return parseDecimal(value, 'money');
}

export function quantity(value: DecimalInput): DecimalValue {
  return parseDecimal(value, 'quantity');
}

export function exchangeRate(value: DecimalInput): DecimalValue {
  return parseDecimal(value, 'exchangeRate');
}

export function rate(value: DecimalInput): DecimalValue {
  return parseDecimal(value, 'rate');
}

export function percentage(value: DecimalInput): DecimalValue {
  return parseDecimal(value, 'percentage');
}

export const ZERO = new Prisma.Decimal(0);
export const ONE = new Prisma.Decimal(1);
export const HUNDRED = new Prisma.Decimal(100);

export function add(...values: DecimalInput[]): DecimalValue {
  return values.reduce<DecimalValue>((sum, value) => sum.plus(sourceString(value)), ZERO);
}

export function subtract(left: DecimalInput, right: DecimalInput): DecimalValue {
  return new Prisma.Decimal(sourceString(left)).minus(sourceString(right));
}

export function multiply(left: DecimalInput, right: DecimalInput): DecimalValue {
  return new Prisma.Decimal(sourceString(left)).times(sourceString(right));
}

export function divide(left: DecimalInput, right: DecimalInput): DecimalValue {
  const divisor = new Prisma.Decimal(sourceString(right));
  if (divisor.isZero()) throw new DecimalDomainError('DECIMAL_DIVIDE_BY_ZERO', 'No se puede dividir entre cero.');
  return new Prisma.Decimal(sourceString(left)).dividedBy(divisor);
}

export function compare(left: DecimalInput, right: DecimalInput): number {
  return new Prisma.Decimal(sourceString(left)).comparedTo(sourceString(right));
}

export function quantize(value: DecimalInput, scale: number): DecimalValue {
  return new Prisma.Decimal(sourceString(value)).toDecimalPlaces(scale, ROUNDING_MODE);
}

export function quantizeMoney(value: DecimalInput): DecimalValue {
  return quantize(value, DECIMAL_SCALE.money);
}

export function percentOf(amount: DecimalInput, percentageRate: DecimalInput): DecimalValue {
  return divide(multiply(amount, percentageRate), HUNDRED);
}

export function assertNonNegative(value: DecimalValue): DecimalValue {
  if (value.isNegative()) throw new DecimalDomainError('DECIMAL_NEGATIVE', 'El valor decimal no puede ser negativo.');
  return value;
}

export function assertPositive(value: DecimalValue): DecimalValue {
  if (!value.isPositive()) throw new DecimalDomainError('DECIMAL_NOT_POSITIVE', 'El valor decimal debe ser mayor que cero.');
  return value;
}

export function serializeDecimal(value: DecimalInput, scale?: number): string {
  const decimal = new Prisma.Decimal(sourceString(value));
  return scale === undefined ? decimal.toString() : decimal.toFixed(scale);
}

/**
 * Boundary-only compatibility serializer for endpoints that historically emitted JSON numbers.
 * Never use the returned value in domain calculations. New precise contracts should prefer
 * serializeDecimal(), because Decimal(18,2) can exceed exact IEEE-754 cent representation.
 */
export function serializeLegacyNumber(value: DecimalInput): number {
  return new Prisma.Decimal(sourceString(value)).toNumber();
}
