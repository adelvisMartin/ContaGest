const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const sum = (items, selector) => items.reduce((acc, item) => acc + (Number(selector(item)) || 0), 0);

export function calculateQuote(quote = {}, bcvRate = 0) {
  const rate = Number(bcvRate) || 0;
  const itemSubtotalUsd = sum(quote.items || [], (item) => Number(item.qty || 0) * Number(item.priceUsd || 0));
  const manualAmount = Number(quote.manualAmount || 0);
  const hasItems = (quote.items || []).length > 0;
  const baseUsd = hasItems ? itemSubtotalUsd : quote.currency === 'VES' ? (rate ? manualAmount / rate : 0) : manualAmount;
  const baseBs = hasItems ? itemSubtotalUsd * rate : quote.currency === 'VES' ? manualAmount : manualAmount * rate;
  const taxes = quote.taxes || {};
  const iva = taxes.iva?.active ? baseBs * Number(taxes.iva.rate || 0) / 100 : 0;
  const igtf = taxes.igtf?.active ? baseBs * Number(taxes.igtf.rate || 0) / 100 : 0;
  const islr = taxes.islr?.active ? baseBs * Number(taxes.islr.rate || 0) / 100 : 0;
  const custom = taxes.custom?.active ? baseBs * Number(taxes.custom.rate || 0) / 100 : 0;
  const retIva = taxes.retIva?.active ? iva * Number(taxes.retIva.rate || 0) / 100 : 0;
  const retIslr = taxes.retIslr?.active ? baseBs * Number(taxes.retIslr.rate || 0) / 100 : 0;
  const taxesTotal = iva + igtf + islr + custom;
  const retentions = retIva + retIslr;
  const total = baseBs + taxesTotal - retentions;
  return {
    rate: round(rate),
    baseUsd: round(baseUsd),
    baseImponible: round(baseBs),
    iva: round(iva),
    igtf: round(igtf),
    islr: round(islr),
    custom: round(custom),
    retIva: round(retIva),
    retIslr: round(retIslr),
    taxesTotal: round(taxesTotal),
    retentions: round(retentions),
    total: round(total),
    totalUsdEquivalent: rate ? round(total / rate) : 0,
    taxBurdenPct: baseBs ? round((taxesTotal / baseBs) * 100) : 0,
    retentionPct: total ? round((retentions / total) * 100) : 0
  };
}

export function calculateLedger(entries = []) {
  const debit = round(sum(entries, (entry) => entry.debit));
  const credit = round(sum(entries, (entry) => entry.credit));
  return { debit, credit, diff: round(debit - credit), balanced: Math.abs(debit - credit) < 0.01 };
}

export function calculatePayroll(input = {}) {
  const salary = Number(input.salary || 0);
  const days = Number(input.days || 30);
  const overtimeHours = Number(input.overtimeHours || 0);
  const bonus = Number(input.bonus || 0);
  const deductionsExtra = Number(input.deductionsExtra || 0);
  const daily = salary / 30;
  const earned = daily * days;
  const overtime = (daily / 8) * 1.5 * overtimeHours;
  const gross = earned + overtime + bonus;
  const ivss = gross * 0.04;
  const faov = gross * 0.01;
  const inces = gross * 0.005;
  const totalDeductions = ivss + faov + inces + deductionsExtra;
  const net = gross - totalDeductions;
  return { daily: round(daily), earned: round(earned), overtime: round(overtime), bonus: round(bonus), gross: round(gross), ivss: round(ivss), faov: round(faov), inces: round(inces), totalDeductions: round(totalDeductions), net: round(net) };
}

export function calculateInventory(items = []) {
  const valueUsd = round(sum(items, (item) => Number(item.stock || 0) * Number(item.costUsd || 0)));
  const retailUsd = round(sum(items, (item) => Number(item.stock || 0) * Number(item.priceUsd || 0)));
  const lowStock = items.filter((item) => Number(item.stock || 0) <= Number(item.min || 0)).length;
  return { valueUsd, retailUsd, lowStock, marginUsd: round(retailUsd - valueUsd) };
}
