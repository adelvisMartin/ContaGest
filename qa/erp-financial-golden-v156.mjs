import fs from 'node:fs';

export function roundMinorUnits(decimalText){
  const raw=String(decimalText).trim();
  const match=raw.match(/^(-?)(\d+)(?:\.(\d*))?$/);
  if(!match)throw new Error(`INVALID_DECIMAL:${raw}`);
  const sign=match[1]==='-'?-1:1;
  const whole=BigInt(match[2]);
  const fraction=(match[3]||'').padEnd(3,'0');
  const cents=whole*100n+BigInt(fraction.slice(0,2)||'0');
  const third=Number(fraction[2]||'0');
  return Number((cents+(third>=5?1n:0n))*BigInt(sign));
}

export function sumLedger(entries){
  let debit=0,credit=0;
  for(const entry of entries){
    for(const line of entry.lines||[]){debit+=Number(line.debitCents||0);credit+=Number(line.creditCents||0);}
  }
  return {debitCents:debit,creditCents:credit,balanced:debit===credit};
}

export function dedupeEntries(entries){
  const seen=new Set();
  return entries.filter((entry)=>{const key=String(entry.idempotencyKey||'');if(!key||seen.has(key))return false;seen.add(key);return true;});
}

export function evaluateGoldenDataset(data){
  const checks=[];
  const add=(id,actual,expected)=>checks.push({id,actual,expected,pass:actual===expected});
  const inv=data.inventory;
  const closingQty=Number(inv.openingQuantityMilli)+Number(inv.purchasesQuantityMilli)-Number(inv.salesQuantityMilli);
  add('inventory.quantity',closingQty,Number(inv.expectedClosingQuantityMilli));
  add('inventory.value',Math.round((closingQty/1000)*Number(inv.standardCostCents)),Number(inv.expectedClosingValueCents));
  add('receivables',Number(data.receivables.salesGrossCents)-Number(data.receivables.collectionsCents),Number(data.receivables.expectedClosingCents));
  add('payables',Number(data.payables.purchasesGrossCents)-Number(data.payables.paymentsCents),Number(data.payables.expectedClosingCents));
  add('bank.closing',Number(data.bank.openingCents)+Number(data.bank.inflowsCents)-Number(data.bank.outflowsCents),Number(data.bank.expectedClosingCents));
  add('bank.reconciliation',Number(data.bank.expectedClosingCents)-Number(data.bank.statementClosingCents),Number(data.bank.expectedUnreconciledCents));
  add('payroll.net',Number(data.payroll.grossCents)-Number(data.payroll.deductionsCents),Number(data.payroll.expectedNetCents));
  add('tax.vatPayable',Number(data.tax.outputVatCents)-Number(data.tax.inputVatCents),Number(data.tax.expectedVatPayableCents));
  const ledger=sumLedger(dedupeEntries(data.ledgerEntries||[]));
  add('ledger.debit-credit',ledger.debitCents,ledger.creditCents);
  const keys=(data.ledgerEntries||[]).map((entry)=>entry.idempotencyKey);
  add('idempotency.keysUnique',new Set(keys).size,keys.length);
  const source=String(data.fiscalRates?.source||'');
  checks.push({id:'rates.synthetic',actual:source,expected:'SYNTHETIC_TEST_ONLY',pass:data.synthetic===true&&source==='SYNTHETIC_TEST_ONLY'});
  return {datasetVersion:data.datasetVersion,pass:checks.every((item)=>item.pass),checks,ledger};
}

export function loadGoldenDataset(file='qa/fixtures/erp-financial-golden-v156.json'){
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
