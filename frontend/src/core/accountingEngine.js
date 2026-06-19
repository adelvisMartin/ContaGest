import { CHART_OF_ACCOUNTS } from '../data/chartOfAccounts.js';

const accountMap = new Map(CHART_OF_ACCOUNTS.map((account) => [account.code, account]));
const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function getAccount(code) {
  return accountMap.get(String(code || '').trim()) || null;
}

export function isPostableAccount(code) {
  const account = getAccount(code);
  return Boolean(account?.allowPosting);
}

export function validateLedgerLines(lines = []) {
  const normalized = lines.map((line, index) => {
    const account = getAccount(line.accountCode);
    const debit = round2(line.debit);
    const credit = round2(line.credit);
    const errors = [];
    if (!account) errors.push(`Línea ${index + 1}: cuenta ${line.accountCode} no existe en el catálogo.`);
    if (account && !account.allowPosting) errors.push(`Línea ${index + 1}: ${account.code} ${account.name} es cuenta de agrupación, no permite movimiento.`);
    if (debit < 0 || credit < 0) errors.push(`Línea ${index + 1}: débitos/créditos no pueden ser negativos.`);
    if (debit > 0 && credit > 0) errors.push(`Línea ${index + 1}: una línea no puede tener débito y crédito simultáneamente.`);
    if (debit === 0 && credit === 0) errors.push(`Línea ${index + 1}: debe indicar débito o crédito.`);
    return { ...line, accountName: account?.name || line.accountName || '', debit, credit, account, errors };
  });
  const debit = round2(normalized.reduce((sum, line) => sum + line.debit, 0));
  const credit = round2(normalized.reduce((sum, line) => sum + line.credit, 0));
  const diff = round2(debit - credit);
  const errors = normalized.flatMap((line) => line.errors);
  if (diff !== 0) errors.push(`Asiento descuadrado: Débito ${debit.toFixed(2)} / Crédito ${credit.toFixed(2)} / Diferencia ${diff.toFixed(2)}.`);
  return { ok: errors.length === 0, errors, debit, credit, diff, lines: normalized };
}

export const JournalTemplates = {
  sale({ subtotal = 0, iva = 0, igtf = 0, total = 0 }) {
    const lines = [
      { accountCode: '1.1.03.001', debit: total, description: 'Cliente / cuentas por cobrar' },
      { accountCode: '4.1.01', credit: subtotal, description: 'Ingreso por venta gravada' },
      { accountCode: '2.1.02.001', credit: iva, description: 'IVA débito fiscal' },
      ...(Number(igtf) ? [{ accountCode: '2.1.02.005', credit: igtf, description: 'IGTF por pagar' }] : [])
    ];
    return validateLedgerLines(lines);
  },
  purchase({ subtotal = 0, iva = 0, retiva = 0, total = 0 }) {
    const payable = round2(Number(total) - Number(retiva || 0));
    const lines = [
      { accountCode: '5.1.01', debit: subtotal, description: 'Costo o compra' },
      { accountCode: '1.1.05.001', debit: iva, description: 'IVA crédito fiscal' },
      ...(Number(retiva) ? [{ accountCode: '2.1.02.003', credit: retiva, description: 'Retención IVA por enterar' }] : []),
      { accountCode: '2.1.01.001', credit: payable, description: 'Proveedor por pagar' }
    ];
    return validateLedgerLines(lines);
  },
  payroll({ gross = 0, deductions = 0, net = 0, employerCharges = 0 }) {
    const lines = [
      { accountCode: '6.1.01', debit: gross, description: 'Gasto sueldos y salarios' },
      ...(Number(employerCharges) ? [{ accountCode: '6.1.07', debit: employerCharges, description: 'Aportes patronales' }] : []),
      ...(Number(deductions) ? [{ accountCode: '2.1.03.008', credit: deductions, description: 'Retenciones nómina por enterar' }] : []),
      ...(Number(employerCharges) ? [{ accountCode: '2.1.03.005', credit: employerCharges, description: 'Parafiscales por pagar' }] : []),
      { accountCode: '2.1.03.001', credit: net, description: 'Nómina neta por pagar' }
    ];
    return validateLedgerLines(lines);
  },
  bankPayment({ amount = 0, expenseAccount = '6.2.05' }) {
    return validateLedgerLines([
      { accountCode: expenseAccount, debit: amount, description: 'Gasto / egreso bancario' },
      { accountCode: '1.1.02.001', credit: amount, description: 'Banco' }
    ]);
  },
  reversal(originalLines = []) {
    return validateLedgerLines(originalLines.map((line) => ({ accountCode: line.accountCode, debit: line.credit || 0, credit: line.debit || 0, description: `Reverso ${line.description || ''}` })));
  }
};

export function accountKpis(accounts = CHART_OF_ACCOUNTS) {
  return {
    total: accounts.length,
    postable: accounts.filter((account) => account.allowPosting).length,
    groups: accounts.filter((account) => !account.allowPosting).length,
    assets: accounts.filter((account) => account.type === 'asset').length,
    liabilities: accounts.filter((account) => account.type === 'liability').length,
    expenses: accounts.filter((account) => account.type === 'expense').length
  };
}
