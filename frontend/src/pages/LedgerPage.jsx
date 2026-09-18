import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgMoney, CgPageHeader, CgProvider, CgSelect, CgState, CgStatusChip, CgTextField
} from '../components/ui/cg/CgPrimitives.jsx';
import { calculateLedger } from '../core/calculator.js';
import { shortDate } from '../core/formatters.js';
import { downloadText, today, uid } from '../utils/dom.js';

const docTypes=[{value:'SA',label:'SA · Asiento diario'},{value:'AB',label:'AB · Documento contable'},{value:'DZ',label:'DZ · Cobranza cliente'},{value:'KZ',label:'KZ · Pago proveedor'},{value:'PR',label:'PR · Nómina'},{value:'AJ',label:'AJ · Ajuste / reclasificación'}];
const templates=[{id:'saleVat',label:'Venta con IVA',debitAccount:'Cuentas por cobrar',creditAccount:'Ventas',description:'Venta comercial con IVA débito fiscal'},{id:'bankExpense',label:'Egreso bancario',debitAccount:'Gastos administrativos',creditAccount:'Bancos',description:'Pago operativo desde banco'},{id:'inventoryPurchase',label:'Compra inventario',debitAccount:'Inventario',creditAccount:'Cuentas por pagar',description:'Compra de inventario / mercancía'},{id:'payroll',label:'Nómina',debitAccount:'Gastos administrativos',creditAccount:'Bancos',description:'Registro de nómina y pago'}];
const normalizeAmount=(value)=>Number(value||0);
const toBs=(amount,currency,rate)=>currency==='USD'?normalizeAmount(amount)*normalizeAmount(rate):normalizeAmount(amount);
const escapePrint=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const groupDocs=(entries=[])=>entries.reduce((acc,entry)=>{const key=entry.docNo||entry.id||'SIN-DOC';(acc[key]||=[]).push(entry);return acc;},{});

function csvFromEntries(entries=[],rate=0){
  const header=['docNo','lineNo','date','docType','reference','account','description','debitME','creditME','currency','rate','debitBs','creditBs'];
  const lines=entries.map((entry,index)=>{
    const lineNo=entry.lineNo||index+1,currency=entry.currency||'VES',rowRate=entry.rate||rate;
    return [entry.docNo||'',lineNo,entry.date||'',entry.docType||'',entry.reference||'',entry.account||'',entry.description||'',entry.debit||0,entry.credit||0,currency,rowRate,toBs(entry.debit,currency,rowRate),toBs(entry.credit,currency,rowRate)]
      .map((value)=>`"${String(value??'').replaceAll('"','""')}"`).join(',');
  });
  return [header.join(','),...lines].join('\n');
}

function htmlBook(state){
  const rate=Number(state.bcv?.rate||0),entries=state.ledger.entries||[];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Libro diario ContaGest</title><link rel="stylesheet" href="/print/ledger-book.css"></head><body><h1>Libro Diario · ${escapePrint(state.settings?.companyTradeName||state.settings?.companyName||'ContaGest')}</h1><p>RIF ${escapePrint(state.settings?.companyRif||'')} · Tasa referencial ${rate} VES/USD · Generado ${new Date().toLocaleString('es-VE')}</p><table><thead><tr><th>Doc.</th><th>Fecha</th><th>Tipo</th><th>Cuenta</th><th>Texto</th><th>Debe Bs</th><th>Haber Bs</th></tr></thead><tbody>${entries.map((entry)=>`<tr><td class="doc">${escapePrint(entry.docNo||'')}</td><td>${escapePrint(shortDate(entry.date))}</td><td>${escapePrint(entry.docType||'SA')}</td><td>${escapePrint(entry.account||'')}</td><td>${escapePrint(entry.description||'')}</td><td class="num">${toBs(entry.debit,entry.currency||'VES',entry.rate||rate).toFixed(2)}</td><td class="num">${toBs(entry.credit,entry.currency||'VES',entry.rate||rate).toFixed(2)}</td></tr>`).join('')}</tbody></table></body></html>`;
}

function Metric({label,value,hint,tone='default'}){
  return <Paper variant="outlined" sx={{p:1.35,minWidth:0}}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Stack direction="row" gap={1} justifyContent="space-between" alignItems="center">
      <Typography variant="h6">{value}</Typography>
      {hint?<CgStatusChip size="small" label={hint} tone={tone}/>:null}
    </Stack>
  </Paper>;
}

function LedgerWorkspace({state,context}){
  const Store=context.Store,Toast=context.Toast,SupabaseSyncService=context.SupabaseSyncService;
  const rate=Number(state.bcv?.rate||0);
  const [entries,setEntries]=useState(state.ledger.entries||[]);
  const [syncing,setSyncing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({
    date:today(),docNo:`DI-${new Date().getFullYear()}-${String((state.ledger.entries||[]).length+1).padStart(4,'0')}`,
    docType:'SA',reference:'',currency:'VES',rate:String(rate||0),headerText:'',account:'',counterAccount:'',description:'',side:'debit',amount:'0'
  });
  const accounts=state.ledger.accounts||[];
  const accountOptions=accounts.map((name)=>({value:name,label:name}));
  const totals=useMemo(()=>calculateLedger(entries.map((entry)=>({debit:toBs(entry.debit,entry.currency||'VES',entry.rate||rate),credit:toBs(entry.credit,entry.currency||'VES',entry.rate||rate)}))),[entries,rate]);
  const amount=normalizeAmount(form.amount),rowRate=normalizeAmount(form.rate||rate);
  const preview=[
    {account:form.account||'—',debit:form.side==='debit'?amount:0,credit:form.side==='credit'?amount:0},
    {account:form.counterAccount||'—',debit:form.side==='credit'?amount:0,credit:form.side==='debit'?amount:0}
  ];
  const notify=(message,tone='success')=>Toast?.show?.(message,tone);

  function applyTemplate(template){
    setForm((current)=>({...current,account:template.debitAccount,counterAccount:template.creditAccount,description:template.description,headerText:template.description,side:'debit'}));
    notify(`Plantilla aplicada: ${template.label}`,'success');
  }

  async function sync(){
    setSyncing(true);
    try{
      await SupabaseSyncService.pullLedger({Store,Toast,force:true,silent:true});
      setEntries(Store.get().ledger.entries||[]);
      notify('Libro sincronizado.','success');
    }catch(cause){notify(`No se sincronizó el libro: ${cause?.message||'Error'}`,'error');}
    finally{setSyncing(false);}
  }

  async function submit(event){
    event.preventDefault();
    if(!amount)return notify('Indica un monto mayor a cero.','warning');
    if(!form.account||!form.counterAccount)return notify('Selecciona cuenta principal y contrapartida.','warning');
    if(form.account===form.counterAccount)return notify('La cuenta principal y la contrapartida no pueden ser iguales.','warning');
    setSaving(true);
    const docNo=form.docNo||uid('doc');
    const base={date:form.date||today(),docNo,docType:form.docType||'SA',reference:form.reference||'',headerText:form.headerText||form.description||'',currency:form.currency||'VES',rate:rowRate,source:'local'};
    const lineA={id:uid('entry'),...base,lineNo:1,account:form.account,description:form.description,debit:form.side==='debit'?amount:0,credit:form.side==='credit'?amount:0};
    const lineB={id:uid('entry'),...base,lineNo:2,account:form.counterAccount,description:`Contrapartida: ${form.description}`,debit:form.side==='credit'?amount:0,credit:form.side==='debit'?amount:0};
    try{
      const savedA=await SupabaseSyncService.createLedgerEntry(lineA);
      const savedB=await SupabaseSyncService.createLedgerEntry(lineB);
      Store.update((draft)=>{draft.ledger.entries=[savedB,savedA,...(draft.ledger.entries||[])];});
      setEntries((current)=>[savedB,savedA,...current]);
      notify('Documento contable guardado en Supabase.','success');
    }catch(cause){
      Store.update((draft)=>{
        draft.ledger.entries=[lineB,lineA,...(draft.ledger.entries||[])];
        draft.auditLog=draft.auditLog||[];
        draft.auditLog.unshift({id:uid('log'),module:'ledger',action:'create-balanced-document-local',at:new Date().toISOString(),docNo});
      });
      setEntries((current)=>[lineB,lineA,...current]);
      notify(`Documento balanceado guardado localmente. Backend: ${cause?.message||'Error'}`,'warning');
    }finally{
      const nextCount=(Store.get().ledger.entries||[]).length+1;
      setForm({date:today(),docNo:`DI-${new Date().getFullYear()}-${String(nextCount).padStart(4,'0')}`,docType:'SA',reference:'',currency:'VES',rate:String(Store.get().bcv?.rate||0),headerText:'',account:'',counterAccount:'',description:'',side:'debit',amount:'0'});
      setSaving(false);
    }
  }

  function exportCsv(){
    downloadText(`libro-diario-${today()}.csv`,csvFromEntries(entries,Store.get().bcv?.rate||0),'text/csv;charset=utf-8');
  }

  function printBook(){
    const win=window.open('','_blank','noopener,noreferrer');
    if(!win)return notify('Permite ventanas emergentes para imprimir el libro.','warning');
    win.document.write(htmlBook({...Store.get(),ledger:{...Store.get().ledger,entries}}));
    win.document.close();
    setTimeout(()=>win.print(),250);
  }

  const columns=[
    {key:'docNo',label:'Nº doc.',render:(entry,index)=><Box><Typography variant="body2" fontWeight={700}>{entry.docNo||'—'}</Typography><Typography variant="caption">{String(entry.lineNo||index+1).padStart(3,'0')}</Typography></Box>},
    {key:'date',label:'Fecha',render:(entry)=>shortDate(entry.date)},
    {key:'type',label:'Clase / Referencia',render:(entry)=><Box><Typography variant="body2">{entry.docType||'SA'}</Typography><Typography variant="caption">{entry.reference||entry.id||'—'}</Typography></Box>},
    {key:'account',label:'Cuenta'},
    {key:'description',label:'Texto'},
    {key:'debit',label:'Debe ME',align:'right',render:(entry)=>normalizeAmount(entry.debit)||'—'},
    {key:'currency',label:'Mon.'},
    {key:'debitBs',label:'Debe ML',align:'right',render:(entry)=>normalizeAmount(entry.debit)?<Stack alignItems="flex-end"><CgMoney value={toBs(entry.debit,entry.currency||'VES',entry.rate||rate)} currency="VES"/>{rate?<Typography variant="caption"><CgMoney value={toBs(entry.debit,entry.currency||'VES',entry.rate||rate)/rate} currency="USD"/></Typography>:null}</Stack>:'—'},
    {key:'creditBs',label:'Haber ML',align:'right',render:(entry)=>normalizeAmount(entry.credit)?<Stack alignItems="flex-end"><CgMoney value={toBs(entry.credit,entry.currency||'VES',entry.rate||rate)} currency="VES"/>{rate?<Typography variant="caption"><CgMoney value={toBs(entry.credit,entry.currency||'VES',entry.rate||rate)/rate} currency="USD"/></Typography>:null}</Stack>:'—'},
    {key:'source',label:'Origen',render:(entry)=><CgStatusChip size="small" label={entry.source==='supabase'?'Registrado':'Local pendiente'} tone={entry.source==='supabase'?'success':'warning'}/>}
  ];

  return <Stack gap={1.5}>
    <CgPageHeader eyebrow="Contabilidad" title="Libro diario" description="Documentos balanceados, doble partida, exportación y libro imprimible." actions={<Stack direction="row" gap={.7} flexWrap="wrap"><CgButton variant="outlined" onClick={exportCsv}>Descargar CSV</CgButton><CgButton variant="outlined" onClick={printBook}>Vista / imprimir libro</CgButton><CgButton onClick={()=>applyTemplate(templates[0])}>Plantilla venta</CgButton><CgButton variant="outlined" onClick={()=>void sync()} disabled={syncing}>{syncing?'Sincronizando…':'Sincronizar'}</CgButton></Stack>}/>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(5,minmax(0,1fr))'},gap:1}}>
      <Metric label="Documentos" value={Object.keys(groupDocs(entries)).length} hint="Documentos contables"/>
      <Metric label="Líneas" value={entries.length} hint="Movimientos registrados"/>
      <Metric label="Debe" value={<CgMoney value={totals.debit} currency="VES"/>} hint={rate?`≈ USD ${(totals.debit/rate).toFixed(2)}`:'USD pendiente'} tone="primary"/>
      <Metric label="Haber" value={<CgMoney value={totals.credit} currency="VES"/>} hint={rate?`≈ USD ${(totals.credit/rate).toFixed(2)}`:'USD pendiente'} tone="primary"/>
      <Metric label="Estado" value={totals.balanced?'Balanceado':'Descuadre'} hint={totals.balanced?'Partida doble OK':`Diferencia ${totals.diff.toFixed(2)}`} tone={totals.balanced?'success':'error'}/>
    </Box>

    {!totals.balanced?<CgState severity="warning" title="Libro descuadrado">La diferencia debe revisarse antes de cierre.</CgState>:null}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'minmax(0,1.2fr) minmax(0,.8fr)'},gap:1.2}}>
      <Paper component="form" onSubmit={submit} variant="outlined" sx={{p:1.5,minWidth:0}}>
        <Stack direction="row" justifyContent="space-between" gap={1}><Box><Typography variant="h6">Documento contable</Typography><Typography variant="caption" color="text.secondary">Captura guiada con contrapartida automática Debe/Haber.</Typography></Box><CgStatusChip label={totals.balanced?'Libro balanceado':'Requiere revisión'} tone={totals.balanced?'success':'error'}/></Stack>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',lg:'repeat(3,minmax(0,1fr))'},gap:1,mt:1.2}}>
          <CgTextField label="Fecha contable" type="date" slotProps={{inputLabel:{shrink:true}}} value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})}/>
          <CgTextField label="Nº documento" value={form.docNo} onChange={(e)=>setForm({...form,docNo:e.target.value})}/>
          <CgSelect label="Clase doc." value={form.docType} onChange={(e)=>setForm({...form,docType:e.target.value})} options={docTypes}/>
          <CgTextField label="Referencia" value={form.reference} onChange={(e)=>setForm({...form,reference:e.target.value})}/>
          <CgSelect label="Moneda" value={form.currency} onChange={(e)=>setForm({...form,currency:e.target.value})} options={[{value:'VES',label:'Bs / VES'},{value:'USD',label:'USD'}]}/>
          <CgTextField label="Tasa" type="number" inputProps={{step:.0001}} value={form.rate} onChange={(e)=>setForm({...form,rate:e.target.value})}/>
        </Box>
        <CgTextField fullWidth sx={{mt:1}} label="Texto cabecera" value={form.headerText} onChange={(e)=>setForm({...form,headerText:e.target.value})}/>
        <Paper variant="outlined" sx={{p:1.2,mt:1.2}}>
          <Typography fontWeight={700}>Línea y contrapartida</Typography>
          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:1,mt:1}}>
            <CgSelect label="Cuenta principal" value={form.account} onChange={(e)=>setForm({...form,account:e.target.value})} options={[{value:'',label:'Seleccionar'},...accountOptions]}/>
            <CgSelect label="Cuenta contrapartida" value={form.counterAccount} onChange={(e)=>setForm({...form,counterAccount:e.target.value})} options={[{value:'',label:'Seleccionar'},...accountOptions]}/>
            <CgTextField label="Texto línea" required value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/>
            <CgSelect label="Naturaleza principal" value={form.side} onChange={(e)=>setForm({...form,side:e.target.value})} options={[{value:'debit',label:'Debe'},{value:'credit',label:'Haber'}]}/>
            <CgTextField label="Monto" type="number" inputProps={{step:.01,min:0}} value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})}/>
          </Box>
        </Paper>
        <CgButton type="submit" disabled={saving} sx={{mt:1.2}}>{saving?'Guardando…':'Agregar documento balanceado'}</CgButton>
      </Paper>

      <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
        <Typography variant="h6">Vista previa</Typography>
        <Typography variant="caption" color="text.secondary">Contrapartida calculada antes de registrar.</Typography>
        <Stack gap={.7} mt={1}>{preview.map((line,index)=><Paper key={index} variant="outlined" sx={{p:1}}><Stack direction="row" justifyContent="space-between"><Typography>{line.account}</Typography><Box textAlign="right"><Typography variant="caption" display="block">Debe {line.debit||'—'} · Haber {line.credit||'—'}</Typography><CgMoney value={toBs(line.debit||line.credit,form.currency,rowRate)} currency="VES"/></Box></Stack></Paper>)}</Stack>
        <Typography variant="subtitle2" mt={1.5}>Plantillas</Typography>
        <Stack direction="row" flexWrap="wrap" gap={.7} mt={.7}>{templates.map((template)=><CgButton key={template.id} size="small" variant="outlined" onClick={()=>applyTemplate(template)}>{template.label}</CgButton>)}</Stack>
      </Paper>
    </Box>

    <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
      <Stack direction="row" justifyContent="space-between"><Box><Typography variant="h6">Diario de documentos</Typography><Typography variant="caption" color="text.secondary">Los asientos no se eliminan desde la interfaz; correcciones requieren reverso o ajuste auditable.</Typography></Box><CgStatusChip label={totals.balanced?'Libro balanceado':'Libro descuadrado'} tone={totals.balanced?'success':'error'}/></Stack>
      <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}><CgDataTable columns={columns} rows={entries} empty="Sin asientos registrados"/></Box>
    </Paper>
  </Stack>;
}

let activeRoot=null;
export const LedgerPage={
  render(){return '<section class="cg-page-stack"><div id="ledgerReactRoot"></div></section>';},
  mount(state,context){
    const host=document.getElementById('ledgerReactRoot');
    if(!host)return;
    try{activeRoot?.unmount();}catch{}
    activeRoot=createRoot(host);
    activeRoot.render(<CgProvider state={state}><LedgerWorkspace state={state} context={context}/></CgProvider>);
  }
};
