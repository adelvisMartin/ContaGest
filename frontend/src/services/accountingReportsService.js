
import { today } from '../utils/dom.js';

const ACCOUNT_TYPES = [
  { type:'asset', label:'Activo', nature:'debit', keywords:['caja','banco','cuentas por cobrar','cliente','inventario','mercanc','iva crédito','credito fiscal','activo','anticipo'] },
  { type:'liability', label:'Pasivo', nature:'credit', keywords:['cuentas por pagar','proveedor','iva débito','debito fiscal','retencion','retención','islr','igtf','impuesto por pagar','pasivo','prestamo','préstamo'] },
  { type:'equity', label:'Patrimonio', nature:'credit', keywords:['capital','patrimonio','utilidad retenida','resultado acumulado','reserva'] },
  { type:'revenue', label:'Ingreso', nature:'credit', keywords:['venta','ventas','ingreso','honorario','servicio facturado'] },
  { type:'expense', label:'Egreso / Costo', nature:'debit', keywords:['compra','gasto','costo','nomina','nómina','sueldo','salario','merma','depreciacion','depreciación'] }
];

const safeNum = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const lower = (value) => String(value || '').toLowerCase();
const round2 = (value) => Math.round((safeNum(value) + Number.EPSILON) * 100) / 100;
const normalizeDate = (value) => String(value || today()).slice(0, 10);
const normAccount = (value) => String(value || 'Cuenta sin clasificar').trim() || 'Cuenta sin clasificar';

export function classifyAccount(account = '') {
  const name = lower(account);
  const match = ACCOUNT_TYPES.find((type) => type.keywords.some((kw) => name.includes(kw)));
  return match || { type:'other', label:'Otros', nature:'debit', keywords:[] };
}

export function getAccounts(state = {}) {
  const base = new Set([...(state.ledger?.accounts || []), ...(state.customAccounts || [])]);
  (state.ledger?.entries || []).forEach((entry) => base.add(normAccount(entry.account)));
  (state.accounting?.adjustments || []).forEach((entry) => base.add(normAccount(entry.account)));
  return [...base].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
}

export function normalizeLedgerEntries(state = {}) {
  const rate = safeNum(state.bcv?.rate || state.quote?.rate || 0) || 0;
  return (state.ledger?.entries || []).map((entry, index) => {
    const currency = String(entry.currency || entry.moneda || 'VES').toUpperCase();
    const rowRate = safeNum(entry.rate || entry.exchangeRate || rate || 1) || 1;
    const debit = safeNum(entry.debit ?? entry.debe);
    const credit = safeNum(entry.credit ?? entry.haber);
    const debitLocal = currency === 'USD' ? round2(debit * rowRate) : debit;
    const creditLocal = currency === 'USD' ? round2(credit * rowRate) : credit;
    const debitUsd = currency === 'USD' ? debit : (rowRate ? round2(debit / rowRate) : 0);
    const creditUsd = currency === 'USD' ? credit : (rowRate ? round2(credit / rowRate) : 0);
    return {
      ...entry,
      id: entry.id || `entry-${index}`,
      date: normalizeDate(entry.date || entry.fecha),
      docNo: entry.docNo || entry.documentNo || entry.doc || entry.reference || `DOC-${String(index + 1).padStart(4, '0')}`,
      docType: entry.docType || entry.type || 'SA',
      reference: entry.reference || entry.ref || '',
      headerText: entry.headerText || entry.description || entry.text || '',
      description: entry.description || entry.headerText || entry.text || '',
      account: normAccount(entry.account),
      currency,
      rate: rowRate,
      debit, credit, debitLocal, creditLocal, debitUsd, creditUsd,
      localBalance: round2(debitLocal - creditLocal),
      usdBalance: round2(debitUsd - creditUsd)
    };
  }).sort((a, b) => `${a.date}|${a.docNo}|${a.lineNo || 0}`.localeCompare(`${b.date}|${b.docNo}|${b.lineNo || 0}`));
}

export function filterByPeriod(entries = [], filters = {}) {
  const from = filters.from || '';
  const to = filters.to || '';
  const account = filters.account || '';
  return entries.filter((entry) => (!from || entry.date >= from) && (!to || entry.date <= to) && (!account || entry.account === account));
}

export function buildGeneralLedger(state = {}, filters = {}) {
  const entries = filterByPeriod(normalizeLedgerEntries(state), filters);
  const groups = new Map();
  entries.forEach((entry) => {
    if (!groups.has(entry.account)) groups.set(entry.account, []);
    groups.get(entry.account).push(entry);
  });
  return [...groups.entries()].map(([account, rows]) => {
    let runningLocal = 0;
    let runningUsd = 0;
    const detailed = rows.map((entry) => {
      runningLocal = round2(runningLocal + entry.localBalance);
      runningUsd = round2(runningUsd + entry.usdBalance);
      return { ...entry, runningLocal, runningUsd };
    });
    return {
      account,
      meta: classifyAccount(account),
      debitLocal: round2(rows.reduce((sum, row) => sum + row.debitLocal, 0)),
      creditLocal: round2(rows.reduce((sum, row) => sum + row.creditLocal, 0)),
      debitUsd: round2(rows.reduce((sum, row) => sum + row.debitUsd, 0)),
      creditUsd: round2(rows.reduce((sum, row) => sum + row.creditUsd, 0)),
      balanceLocal: round2(runningLocal),
      balanceUsd: round2(runningUsd),
      rows: detailed
    };
  }).sort((a, b) => a.account.localeCompare(b.account, 'es'));
}

export function buildTrialBalance(state = {}, filters = {}) {
  const groups = buildGeneralLedger(state, filters);
  const rows = groups.map((group) => {
    const rawLocal = round2(group.debitLocal - group.creditLocal);
    const rawUsd = round2(group.debitUsd - group.creditUsd);
    return {
      account: group.account,
      type: group.meta.label,
      nature: group.meta.nature,
      debitMovLocal: group.debitLocal,
      creditMovLocal: group.creditLocal,
      debitMovUsd: group.debitUsd,
      creditMovUsd: group.creditUsd,
      debitBalanceLocal: rawLocal > 0 ? rawLocal : 0,
      creditBalanceLocal: rawLocal < 0 ? Math.abs(rawLocal) : 0,
      debitBalanceUsd: rawUsd > 0 ? rawUsd : 0,
      creditBalanceUsd: rawUsd < 0 ? Math.abs(rawUsd) : 0,
      rawLocal,
      rawUsd
    };
  });
  const totals = rows.reduce((acc, row) => {
    ['debitMovLocal','creditMovLocal','debitBalanceLocal','creditBalanceLocal','debitMovUsd','creditMovUsd','debitBalanceUsd','creditBalanceUsd'].forEach((key) => acc[key] = round2((acc[key] || 0) + row[key]));
    return acc;
  }, {});
  totals.isBalanced = round2(totals.debitBalanceLocal || 0) === round2(totals.creditBalanceLocal || 0);
  totals.diffLocal = round2((totals.debitBalanceLocal || 0) - (totals.creditBalanceLocal || 0));
  totals.diffUsd = round2((totals.debitBalanceUsd || 0) - (totals.creditBalanceUsd || 0));
  return { rows, totals };
}

export function normalizeAdjustments(state = {}) {
  const rate = safeNum(state.bcv?.rate || 1) || 1;
  return (state.accounting?.adjustments || []).map((entry, index) => {
    const debit = safeNum(entry.debit);
    const credit = safeNum(entry.credit);
    const currency = String(entry.currency || 'VES').toUpperCase();
    const rowRate = safeNum(entry.rate || rate) || 1;
    return {
      id: entry.id || `adj-${index}`,
      date: normalizeDate(entry.date),
      account: normAccount(entry.account),
      description: entry.description || '',
      currency,
      debitLocal: currency === 'USD' ? round2(debit * rowRate) : debit,
      creditLocal: currency === 'USD' ? round2(credit * rowRate) : credit,
      debitUsd: currency === 'USD' ? debit : round2(debit / rowRate),
      creditUsd: currency === 'USD' ? credit : round2(credit / rowRate)
    };
  });
}

export function buildWorksheet(state = {}, filters = {}) {
  const trial = buildTrialBalance(state, filters);
  const adjustments = normalizeAdjustments(state);
  const adjByAccount = new Map();
  adjustments.forEach((adj) => {
    const prev = adjByAccount.get(adj.account) || { debitLocal:0, creditLocal:0, debitUsd:0, creditUsd:0 };
    prev.debitLocal = round2(prev.debitLocal + adj.debitLocal);
    prev.creditLocal = round2(prev.creditLocal + adj.creditLocal);
    prev.debitUsd = round2(prev.debitUsd + adj.debitUsd);
    prev.creditUsd = round2(prev.creditUsd + adj.creditUsd);
    adjByAccount.set(adj.account, prev);
  });
  const accountSet = new Set([...trial.rows.map((row) => row.account), ...adjustments.map((row) => row.account)]);
  const rows = [...accountSet].sort((a, b) => a.localeCompare(b, 'es')).map((account) => {
    const tb = trial.rows.find((row) => row.account === account) || { debitBalanceLocal:0, creditBalanceLocal:0, debitBalanceUsd:0, creditBalanceUsd:0 };
    const adj = adjByAccount.get(account) || { debitLocal:0, creditLocal:0, debitUsd:0, creditUsd:0 };
    const adjustedRawLocal = round2((tb.debitBalanceLocal - tb.creditBalanceLocal) + (adj.debitLocal - adj.creditLocal));
    const adjustedRawUsd = round2((tb.debitBalanceUsd - tb.creditBalanceUsd) + (adj.debitUsd - adj.creditUsd));
    const meta = classifyAccount(account);
    const isIncome = ['revenue','expense'].includes(meta.type);
    const adjustedDebitLocal = adjustedRawLocal > 0 ? adjustedRawLocal : 0;
    const adjustedCreditLocal = adjustedRawLocal < 0 ? Math.abs(adjustedRawLocal) : 0;
    const adjustedDebitUsd = adjustedRawUsd > 0 ? adjustedRawUsd : 0;
    const adjustedCreditUsd = adjustedRawUsd < 0 ? Math.abs(adjustedRawUsd) : 0;
    return {
      account, type: meta.label, accountType: meta.type,
      tbDebitLocal: tb.debitBalanceLocal, tbCreditLocal: tb.creditBalanceLocal,
      adjDebitLocal: adj.debitLocal, adjCreditLocal: adj.creditLocal,
      adjustedDebitLocal, adjustedCreditLocal,
      incomeDebitLocal: isIncome ? adjustedDebitLocal : 0,
      incomeCreditLocal: isIncome ? adjustedCreditLocal : 0,
      balanceDebitLocal: !isIncome ? adjustedDebitLocal : 0,
      balanceCreditLocal: !isIncome ? adjustedCreditLocal : 0,
      tbDebitUsd: tb.debitBalanceUsd, tbCreditUsd: tb.creditBalanceUsd,
      adjDebitUsd: adj.debitUsd, adjCreditUsd: adj.creditUsd,
      adjustedDebitUsd, adjustedCreditUsd
    };
  });
  const total = (key) => round2(rows.reduce((sum, row) => sum + safeNum(row[key]), 0));
  const totals = {
    tbDebitLocal: total('tbDebitLocal'), tbCreditLocal: total('tbCreditLocal'),
    adjDebitLocal: total('adjDebitLocal'), adjCreditLocal: total('adjCreditLocal'),
    adjustedDebitLocal: total('adjustedDebitLocal'), adjustedCreditLocal: total('adjustedCreditLocal'),
    incomeDebitLocal: total('incomeDebitLocal'), incomeCreditLocal: total('incomeCreditLocal'),
    balanceDebitLocal: total('balanceDebitLocal'), balanceCreditLocal: total('balanceCreditLocal')
  };
  totals.netIncomeLocal = round2(totals.incomeCreditLocal - totals.incomeDebitLocal);
  totals.checkLocal = round2(totals.adjustedDebitLocal - totals.adjustedCreditLocal);
  return { rows, totals, adjustments };
}

export function buildFinancialStatements(state = {}, filters = {}) {
  const worksheet = buildWorksheet(state, filters);
  const incomeRows = worksheet.rows.filter((row) => ['revenue','expense'].includes(row.accountType));
  const balanceRows = worksheet.rows.filter((row) => !['revenue','expense'].includes(row.accountType));
  const sum = (rows, key) => round2(rows.reduce((acc, row) => acc + safeNum(row[key]), 0));
  const revenue = sum(incomeRows.filter((row) => row.accountType === 'revenue'), 'incomeCreditLocal');
  const expenses = sum(incomeRows.filter((row) => row.accountType === 'expense'), 'incomeDebitLocal');
  const netIncome = round2(revenue - expenses);
  const assets = sum(balanceRows.filter((row) => row.accountType === 'asset' || row.accountType === 'other'), 'balanceDebitLocal');
  const liabilities = sum(balanceRows.filter((row) => row.accountType === 'liability'), 'balanceCreditLocal');
  const equity = sum(balanceRows.filter((row) => row.accountType === 'equity'), 'balanceCreditLocal');
  return { worksheet, incomeRows, balanceRows, revenue, expenses, netIncome, assets, liabilities, equity, balanceCheck: round2(assets - (liabilities + equity + netIncome)) };
}

export function rowsToCsv(rows = [], headers = []) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [headers.map((h) => escape(h.label)).join(','), ...rows.map((row) => headers.map((h) => escape(typeof h.value === 'function' ? h.value(row) : row[h.key])).join(','))].join('\n');
}
