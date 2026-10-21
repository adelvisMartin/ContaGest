import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const contracts = [
  {
    path: 'backend/src/modules/accounting/accounting.service.ts',
    forbidden: [/\bNumber\s*\(/, /Math\.round\s*\(/],
    required: [/assertBalanced/, /money\(/, /serializeDecimal/]
  },
  {
    path: 'backend/src/modules/accounting/accounting.routes.ts',
    forbidden: [/row\.debit\s*\+=/, /row\.credit\s*\+=/, /\bNumber\s*\(\s*line\.(?:debit|credit)/],
    required: [/debitExact/, /creditExact/, /balanceExact/]
  },
  {
    path: 'backend/src/modules/sales/sales.routes.ts',
    forbidden: [/quantity\s*\*\s*unitPrice/, /\bNumber\s*\(/],
    required: [/calculateInvoiceTotals/, /decimalSchema\('money'/]
  },
  {
    path: 'backend/src/modules/purchases/purchases.routes.ts',
    forbidden: [/quantity\s*\*\s*unitCost/, /\bNumber\s*\(/],
    required: [/calculateInvoiceTotals/, /decimalSchema\('money'/]
  },
  {
    path: 'backend/src/modules/banking/banking.routes.ts',
    forbidden: [
      /\bNumber\s*\(\s*input\.amount/,
      /\bNumber\s*\(\s*existing\.(?:credit|debit)/,
      /\bNumber\s*\(\s*(?:account|movement)\.(?:balance|credit|debit)/
    ],
    required: [/amountExact/, /balanceExact/, /movementDelta\s*=\s*\(movement:\s*any\)\s*=>\s*subtract\(movement\.credit\s*\?\?\s*ZERO,\s*movement\.debit\s*\?\?\s*ZERO\)/]
  },
  {
    path: 'backend/src/modules/payroll/payroll.routes.ts',
    forbidden: [/\bNumber\s*\(\s*totals\._sum/, /z\.coerce\.number\s*\(/],
    required: [/totalGrossExact/, /decimalSchema\('money'/]
  },
  {
    path: 'backend/src/modules/employees/employees.routes.ts',
    forbidden: [/\bNumber\s*\(\s*req\.body\.salary/, /\bNumber\s*\(\s*before\.salary/, /z\.coerce\.number\s*\(\)\.nonnegative\(\).*salary/],
    required: [/salaryExact/, /decimalSchema\('money'/]
  },
  {
    path: 'backend/src/modules/hr/hr.routes.ts',
    forbidden: [/\bNumber\s*\(\s*period\.totalNet/, /\bNumber\s*\(\s*employee\.salary/],
    required: [/averageSalaryExact/, /payrollLastPeriodsExact/]
  },
  {
    path: 'backend/src/modules/currency/currency.routes.ts',
    forbidden: [/\bNumber\s*\(\s*String\s*\(\s*value/],
    required: [/exchangeRate\(/, /rateExact/]
  },
  {
    path: 'backend/src/modules/schemas.ts',
    forbidden: [/z\.coerce\.number\s*\(/],
    required: [/decimalSchema\('money'/, /decimalSchema\('quantity'/, /decimalSchema\('percentage'/]
  }
];

test('decimal conversion guard recognizes Number calls but not document sequence allocators', () => {
  for (const path of ['backend/src/modules/sales/sales.routes.ts', 'backend/src/modules/purchases/purchases.routes.ts']) {
    const rule = contracts.find((contract) => contract.path === path)?.forbidden.find((pattern) => pattern.test('allocateDocumentNumber()'));
    assert.equal(rule, undefined, `${path}: allocateDocumentNumber must not be mistaken for financial Number()`);
    assert.ok(contracts.find((contract) => contract.path === path)?.forbidden.some((pattern) => pattern.test('Number(total)')));
  }
});

test('issue #90 critical financial paths keep Number out of domain arithmetic', () => {
  for (const contract of contracts) {
    const source = read(contract.path);
    for (const pattern of contract.forbidden) {
      assert.doesNotMatch(source, pattern, `${contract.path} reintroduced forbidden financial Number arithmetic: ${pattern}`);
    }
    for (const pattern of contract.required) {
      assert.match(source, pattern, `${contract.path} lost canonical Decimal contract: ${pattern}`);
    }
  }
});

test('issue #90 canonical Decimal policy remains centralized and documented', () => {
  const decimal = read('backend/src/shared/financial/decimal.ts');
  const invoice = read('backend/src/shared/financial/invoice.ts');
  const adr = read('docs/ADR_FINANCIAL_DECIMAL_V90.md');

  assert.match(decimal, /ROUND_HALF_UP/);
  assert.match(decimal, /money:\s*2/);
  assert.match(decimal, /quantity:\s*3/);
  assert.match(decimal, /exchangeRate:\s*4/);
  assert.match(decimal, /percentage:\s*2/);
  assert.match(invoice, /quantizeMoney\(multiply\(/);
  assert.match(adr, /serializeLegacyNumber\(\).*solo/i);
  assert.match(adr, /no se modifica el DDL/i);
});
