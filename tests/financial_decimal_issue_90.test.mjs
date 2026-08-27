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
    forbidden: [/row\.debit\s*\+=/, /row\.credit\s*\+=/, /Number\s*\(\s*line\.(?:debit|credit)/],
    required: [/debitExact/, /creditExact/, /balanceExact/]
  },
  {
    path: 'backend/src/modules/sales/sales.routes.ts',
    forbidden: [/quantity\s*\*\s*unitPrice/, /Number\s*\(/],
    required: [/calculateInvoiceTotals/, /decimalSchema\('money'/]
  },
  {
    path: 'backend/src/modules/purchases/purchases.routes.ts',
    forbidden: [/quantity\s*\*\s*unitCost/, /Number\s*\(/],
    required: [/calculateInvoiceTotals/, /decimalSchema\('money'/]
  },
  {
    path: 'backend/src/modules/banking/banking.routes.ts',
    forbidden: [
      /Number\s*\(\s*input\.amount/,
      /Number\s*\(\s*existing\.(?:credit|debit)/,
      /Number\s*\(\s*(?:account|movement)\.(?:balance|credit|debit)/
    ],
    required: [/amountExact/, /balanceExact/, /subtract\(existing\.credit, existing\.debit\)/]
  },
  {
    path: 'backend/src/modules/payroll/payroll.routes.ts',
    forbidden: [/Number\s*\(\s*totals\._sum/, /z\.coerce\.number\s*\(/],
    required: [/totalGrossExact/, /decimalSchema\('money'/]
  },
  {
    path: 'backend/src/modules/employees/employees.routes.ts',
    forbidden: [/Number\s*\(\s*req\.body\.salary/, /Number\s*\(\s*before\.salary/, /z\.coerce\.number\s*\(\)\.nonnegative\(\).*salary/],
    required: [/salaryExact/, /decimalSchema\('money'/]
  },
  {
    path: 'backend/src/modules/hr/hr.routes.ts',
    forbidden: [/Number\s*\(\s*period\.totalNet/, /Number\s*\(\s*employee\.salary/],
    required: [/averageSalaryExact/, /payrollLastPeriodsExact/]
  },
  {
    path: 'backend/src/modules/currency/currency.routes.ts',
    forbidden: [/Number\s*\(\s*String\s*\(\s*value/],
    required: [/exchangeRate\(/, /rateExact/]
  },
  {
    path: 'backend/src/modules/schemas.ts',
    forbidden: [/z\.coerce\.number\s*\(/],
    required: [/decimalSchema\('money'/, /decimalSchema\('quantity'/, /decimalSchema\('percentage'/]
  }
];

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
