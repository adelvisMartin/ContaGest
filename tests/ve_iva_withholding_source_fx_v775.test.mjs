import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRetivaVesSource } from '../backend/src/modules/fiscal/ve-iva-withholding-application.ts';

const rate = (value) => Object.freeze({ eq: (other) => value === other });
const valid = Object.freeze({
  functionalCurrency: 'VES',
  invoiceCurrency: 'VES',
  totalPositive: true,
  lines: Object.freeze([
    Object.freeze({ currency: 'VES', exchangeRate: rate(1) }),
    Object.freeze({ currency: 'VES', exchangeRate: rate(1) }),
  ]),
});
const denied = (input) => assert.throws(
  () => assertRetivaVesSource(input), /RETIVA_CURRENCY_UNSUPPORTED/,
);

test('#775 only posted VES ledger lines with exact FX 1 authorize internal RETIVA', () => {
  assert.doesNotThrow(() => assertRetivaVesSource(valid));
  denied({ ...valid, functionalCurrency: 'USD' });
  denied({ ...valid, invoiceCurrency: 'USD' });
  denied({ ...valid, totalPositive: false });
  denied({ ...valid, lines: [] });
  denied({ ...valid, lines: valid.lines.slice(0, 1) });
});

test('#775 reject cross-currency, non-unit, missing or spoofed FX without client defaults', () => {
  denied({ ...valid, lines: [
    valid.lines[0], { currency: 'USD', exchangeRate: rate(1) },
  ] });
  denied({ ...valid, lines: [
    valid.lines[0], { currency: 'VES', exchangeRate: rate(1.2) },
  ] });
  denied({ ...valid, lines: [
    valid.lines[0], { currency: 'VES' },
  ] });
  denied({ ...valid, lines: [
    valid.lines[0], { currency: 'VES', exchangeRate: { eq: 'true' } },
  ] });
  denied({ ...valid, lines: [
    valid.lines[0], null,
  ] });
});
