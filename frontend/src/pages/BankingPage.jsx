import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgEmptyState, CgMoney, CgPageHeader, CgProvider, CgSelect, CgState, CgStatusChip, CgTextField
} from '../components/ui/cg/CgPrimitives.jsx';
import { shortDate } from '../core/formatters.js';
import { BankingService } from '../services/enterpriseOperationsService.js';
import { BankReconciliationService } from '../services/bankReconciliationService.js';
import { today } from '../utils/dom.js';

const rows=(value)=>Array.isArray(value)?value:[];
const reconTone=(status)=>status==='reconciled'?'success':status==='conflict'?'error':status==='suggested'?'primary':status==='partial'?'warning':'default';
const moneyCents=(value)=>{const raw=String(value??'').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(raw))return null;const [whole,fraction='']=raw.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));};
const centsMoney=(value)=>`${value/100n}.${(value%100n).toString().padStart(2,'0')}`;
const minExactMoney=(left,right)=>{const a=moneyCents(left),b=moneyCents(right);if(a===null||b===null)return null;return centsMoney(a<b?a:b);};
const csvCell=(value)=>{let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text=`'${text}`;return `"${text.replace(/"/g,'""')}"`;};

function Metric({label,value,hint,tone='default'}){
  return <Paper variant="outlined" sx={{p:1.35,minWidth:0}}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Stack direction="row" gap={1} alignItems="center" justifyContent="space-between">
      <Typography variant="h6" sx={{fontVariantNumeric:'tabular-nums'}}>{value}</Typography>
      {hint?<CgStatusChip size="small" label={hint} tone={tone}/>:null}
    </Stack>
  </Paper>;
}

function Section({title,description,children}){
  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Typography variant="h6">{title}</Typography>
    {description?<Typography variant="caption" color="text.secondary">{description}</Typography>:null}
    <Box mt={1.2}>{children}</Box>
  </Paper>;
}

function BankingWorkspace({state,context}){
  const Store=context.Store,Toast=context.Toast;
  const initialBanking=state.banking||{accounts:[],movements:[]};
  const [accounts,setAccounts]=useState(rows(initialBanking.accounts));
  const [movements,setMovements]=useState(rows(initialBanking.movements));
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');
  const [search,setSearch]=useState(context.query?.search||'');
  const [status,setStatus]=useState(context.query?.status||'all');

  const [accountForm,setAccountForm]=useState({bank:'',account:'',accountType:'Corriente',accountCurrency:'VES',openingBalance:'0'});
  const [movementForm,setMovementForm]=useState({date:today(),accountId:'',description:'',reference:'',type:'income',currency:'VES',amount:'0'});
  const [correctionForm,setCorrectionForm]=useState({movementId:'',correctionAction:'reverse',reason:'',type:'income',amount:'0',description:'',reference:''});
  const correctionRef=useRef(null);

  const [reconAccount,setReconAccount]=useState(initialBanking.accounts?.[0]?.id||'');
  const [reconStatus,setReconStatus]=useState('unmatched');
  const [reconLines,setReconLines]=useState([]);
  const [imports,setImports]=useState([]);
  const [models,setModels]=useState([]);
  const [closing,setClosing]=useState(null);
  const [selectedLineId,setSelectedLineId]=useState('');
  const [candidates,setCandidates]=useState([]);
  const [modelSuggestions,setModelSuggestions]=useState([]);
  const [history,setHistory]=useState([]);
  const [candidatesLoading,setCandidatesLoading]=useState(false);
  const [writeoffForm,setWriteoffForm]=useState({amount:'0',fiscalPeriod:'',writeoffAccountCode:'',bankLedgerAccountCode:'',reason:'',approvalRequestId:''});
  const [reverseReconForm,setReverseReconForm]=useState({reconciliationId:'',reason:'',fiscalPeriod:''});
  const [modelForm,setModelForm]=useState({name:'',memoPattern:'',accountCode:'',reasonCode:'',minConfidence:'0.95',autoApply:'false'});
  const statementRef=useRef(null);

  const notify=(message,tone='success')=>Toast?.show?.(message,tone);
  const commitMovementQuery=(patch)=>context.UrlStateService?.setParams?.(patch,{replace:true});
  const selectedLine=useMemo(()=>reconLines.find((line)=>line.id===selectedLineId)||reconLines[0]||null,[reconLines,selectedLineId]);

  const filteredMovements=useMemo(()=>movements.filter((movement)=>{
    const account=accounts.find((item)=>item.id===movement.accountId)||{};
    const term=search.trim().toLowerCase();
    const matches=!term||[movement.description,movement.reference,account.bank,account.account].some((value)=>String(value||'').toLowerCase().includes(term));
    return matches&&(status==='all'||(status==='reconciled'?movement.reconciled:!movement.reconciled));
  }),[movements,accounts,search,status]);

  const totalVes=useMemo(()=>accounts.filter((item)=>item.currency==='VES').reduce((sum,item)=>sum+Number(item.balance||0),0),[accounts]);
  const totalUsd=useMemo(()=>accounts.filter((item)=>item.currency==='USD').reduce((sum,item)=>sum+Number(item.balance||0),0),[accounts]);
  const pending=useMemo(()=>movements.filter((item)=>!item.reconciled).length,[movements]);
  const reconciledPct=movements.length?Math.round(((movements.length-pending)/movements.length)*100):100;
  const accountOptions=useMemo(()=>accounts.map((item)=>({value:item.id,label:`${item.bank} · ${item.account} · ${item.currency}`})),[accounts]);
  const correctionOptions=useMemo(()=>movements.filter((item)=>item.lifecycle!=='reversal'&&!item.reversedById).map((item)=>({value:item.id,label:`${shortDate(item.date)} · ${item.description} · ${item.amount} ${item.currency}`})),[movements]);
  const activeReconciliations=useMemo(()=>[...new Map(history.filter((event)=>event.reconciliationId&&event.reconciliationStatus==='confirmed').map((event)=>[event.reconciliationId,event])).values()],[history]);

  async function loadBanking({silent=false}={}){
    if(!silent)setLoading(true);setError('');
    try{
      const summary=await BankingService.summary();
      const nextAccounts=rows(summary.accounts),nextMovements=rows(summary.movements);
      setAccounts(nextAccounts);setMovements(nextMovements);
      Store.set({banking:{accounts:nextAccounts,movements:nextMovements},bankingLoadedAt:new Date().toISOString()});
      if(!reconAccount&&nextAccounts[0]?.id)setReconAccount(nextAccounts[0].id);
    }catch(cause){const message=cause?.message||'No se pudo cargar tesorería.';setError(message);notify(message,'error');}
    finally{if(!silent)setLoading(false);}
  }

  async function loadReconciliation(accountId=reconAccount,nextStatus=reconStatus,{silent=false}={}){
    if(!accountId){setReconLines([]);return;}
    if(!silent)setLoading(true);
    try{
      const [linesResult,importsResult,modelsResult,closingResult]=await Promise.all([
        BankReconciliationService.lines({accountId,status:nextStatus,take:300}),
        BankReconciliationService.imports({accountId,take:30}),
        BankReconciliationService.models(),
        BankReconciliationService.closingBalance(accountId).catch(()=>null)
      ]);
      const nextLines=rows(linesResult);
      setReconLines(nextLines);setImports(rows(importsResult));setModels(rows(modelsResult));setClosing(closingResult);
      const nextSelected=nextLines.some((line)=>line.id===selectedLineId)?selectedLineId:(nextLines[0]?.id||'');
      setSelectedLineId(nextSelected);setCandidates([]);setModelSuggestions([]);setHistory([]);
      const nextLine=nextLines.find((line)=>line.id===nextSelected);
      if(nextLine)setWriteoffForm((current)=>({...current,amount:String(nextLine.remaining||nextLine.amount||'0'),fiscalPeriod:String(nextLine.bookedAt||'').slice(0,7)}));
      if(nextSelected)await selectLine(nextSelected);
    }catch(cause){notify(`No se pudo cargar conciliación: ${cause?.message||'Error'}`,'error');}
    finally{if(!silent)setLoading(false);}
  }

  async function selectLine(lineId){
    if(!lineId)return;
    setSelectedLineId(lineId);setCandidatesLoading(true);setCandidates([]);setModelSuggestions([]);setHistory([]);
    try{
      const [result,historyResult]=await Promise.all([BankReconciliationService.candidates(lineId),BankReconciliationService.history(lineId)]);
      setCandidates(rows(result.candidates));setModelSuggestions(rows(result.modelSuggestions));setHistory(rows(historyResult));
      setReconLines((current)=>current.map((line)=>line.id===lineId?{...line,status:result.status||line.status}:line));
      const line=reconLines.find((item)=>item.id===lineId);
      if(line)setWriteoffForm((current)=>({...current,amount:String(line.remaining||line.amount||'0'),fiscalPeriod:String(line.bookedAt||'').slice(0,7)}));
    }catch(cause){notify(`No se calcularon candidatos: ${cause?.message||'Error'}`,'error');}
    finally{setCandidatesLoading(false);}
  }

  useEffect(()=>{if(!state.bankingLoadedAt)void loadBanking({silent:true});},[]);
  useEffect(()=>{if(reconAccount)void loadReconciliation(reconAccount,reconStatus,{silent:true});},[reconAccount,reconStatus]);

  async function submitAccount(event){
    event.preventDefault();setBusy('account');
    try{
      const payload={bank:accountForm.bank,account:accountForm.account,type:accountForm.accountType,currency:accountForm.accountCurrency,openingBalance:accountForm.openingBalance};
      await BankingService.createAccount(payload);
      setAccountForm({bank:'',account:'',accountType:'Corriente',accountCurrency:'VES',openingBalance:'0'});
      notify('Cuenta y saldo de apertura registrados.','success');await loadBanking({silent:true});
    }catch(cause){notify(`No se creó la cuenta: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function submitMovement(event){
    event.preventDefault();if(!movementForm.accountId)return notify('Selecciona una cuenta.','warning');setBusy('movement');
    try{
      await BankingService.createMovement(movementForm);
      setMovementForm({...movementForm,date:today(),description:'',reference:'',amount:'0'});
      notify('Movimiento registrado y saldo actualizado.','success');await loadBanking({silent:true});
    }catch(cause){notify(`No se registró el movimiento: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function submitCorrection(event){
    event.preventDefault();
    if(!correctionForm.movementId)return notify('Selecciona el movimiento original.','warning');
    if(correctionForm.reason.trim().length<5)return notify('Indica un motivo de al menos 5 caracteres.','warning');
    setBusy('correction');
    try{
      if(correctionForm.correctionAction==='reverse')await BankingService.reverse(correctionForm.movementId,correctionForm.reason);
      else{
        if(!correctionForm.description||Number(correctionForm.amount||0)<=0)throw new Error('La corrección requiere descripción y monto mayor que cero.');
        await BankingService.correct(correctionForm.movementId,{reason:correctionForm.reason,type:correctionForm.type,amount:correctionForm.amount,description:correctionForm.description,reference:correctionForm.reference});
      }
      notify(correctionForm.correctionAction==='reverse'?'Movimiento reversado con trazabilidad.':'Movimiento corregido mediante reverso y sustitución.','success');
      setCorrectionForm({movementId:'',correctionAction:'reverse',reason:'',type:'income',amount:'0',description:'',reference:''});
      await loadBanking({silent:true});
    }catch(cause){notify(`No se aplicó la corrección: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function toggleReconcile(movement){
    setBusy(`toggle:${movement.id}`);
    try{
      const updated=await BankingService.reconcile(movement.id,!movement.reconciled);
      setMovements((current)=>current.map((item)=>item.id===updated.id?updated:item));
      Store.update((draft)=>{draft.banking.movements=(draft.banking?.movements||[]).map((item)=>item.id===updated.id?updated:item);});
      notify(updated.reconciled?'Movimiento conciliado.':'Conciliación revertida.','success');
    }catch(cause){notify(`No se actualizó la conciliación: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  function prepareCorrection(movement){
    setCorrectionForm((current)=>({...current,movementId:movement.id}));
    correctionRef.current?.scrollIntoView({behavior:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
  }

  async function reconcileCandidate(candidate){
    if(!selectedLine)return;
    const amount=minExactMoney(selectedLine.remaining,candidate.remaining);
    if(!amount||moneyCents(amount)===0n)return notify('No existe saldo conciliable.','warning');
    setBusy(`candidate:${candidate.targetId}`);
    try{
      await BankReconciliationService.reconcile(selectedLine.id,[{targetType:candidate.targetType,targetId:candidate.targetId,amount}],{reasons:['human_confirmed_candidate']});
      notify('Conciliación confirmada con trazabilidad.','success');await loadReconciliation(reconAccount,reconStatus,{silent:true});
    }catch(cause){notify(`No se confirmó la conciliación: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  function applyModel(model){
    setWriteoffForm((current)=>({...current,writeoffAccountCode:model.accountCode||'',reason:`Modelo ${model.name||'recurrente'}: ${model.reasonCode||'AJUSTE'}`}));
    notify('Modelo aplicado al write-off; revisa cuenta banco, monto y aprobación antes de confirmar.','info');
  }

  async function submitWriteoff(event){
    event.preventDefault();if(!selectedLine)return;setBusy('writeoff');
    try{
      await BankReconciliationService.writeOff(selectedLine.id,{
        amount:String(writeoffForm.amount),writeoffAccountCode:writeoffForm.writeoffAccountCode,bankLedgerAccountCode:writeoffForm.bankLedgerAccountCode,
        reason:writeoffForm.reason,fiscalPeriod:writeoffForm.fiscalPeriod,approvalRequestId:writeoffForm.approvalRequestId||undefined
      },{approvalRequestId:writeoffForm.approvalRequestId||undefined});
      notify('Write-off contabilizado y conciliado.','success');await loadReconciliation(reconAccount,reconStatus,{silent:true});
    }catch(cause){
      const code=cause?.payload?.code;
      notify(code==='APPROVAL_REQUIRED'?'El write-off requiere aprobación maker-checker antes de ejecutarse.':`No se registró el write-off: ${cause?.message||'Error'}`,'error');
    }finally{setBusy('');}
  }

  async function submitReconReverse(event){
    event.preventDefault();if(!reverseReconForm.reconciliationId)return;setBusy('recon-reverse');
    try{
      await BankReconciliationService.reverse(reverseReconForm.reconciliationId,{reason:reverseReconForm.reason,fiscalPeriod:reverseReconForm.fiscalPeriod||undefined});
      notify('Conciliación reversada sin borrar el historial original.','success');await loadReconciliation(reconAccount,reconStatus,{silent:true});
    }catch(cause){notify(`No se reversó la conciliación: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function submitModel(event){
    event.preventDefault();setBusy('model');
    try{
      await BankReconciliationService.createModel({name:modelForm.name,memoPattern:modelForm.memoPattern,accountCode:modelForm.accountCode,reasonCode:modelForm.reasonCode,minConfidence:String(modelForm.minConfidence||'0.95'),autoApply:modelForm.autoApply==='true'});
      setModelForm({name:'',memoPattern:'',accountCode:'',reasonCode:'',minConfidence:'0.95',autoApply:'false'});
      notify('Nueva versión del modelo guardada y auditable.','success');await loadReconciliation(reconAccount,reconStatus,{silent:true});
    }catch(cause){notify(`No se creó el modelo: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function importStatement(event){
    const file=event.target.files?.[0];if(!file)return;
    if(!reconAccount){event.target.value='';return notify('Selecciona una cuenta bancaria.','warning');}
    setBusy('import');
    try{
      const result=await BankReconciliationService.importStatement(reconAccount,file);
      notify(result.duplicate?'El extracto ya estaba importado; no se duplicaron líneas.':`${result.inserted} líneas importadas; ${result.deduplicated} deduplicadas.`,'success');
      await loadReconciliation(reconAccount,reconStatus,{silent:true});
    }catch(cause){notify(`No se pudo importar: ${cause?.message||'Error'}`,'error');}
    finally{event.target.value='';setBusy('');}
  }

  function exportCsv(){
    const csv=['date,accountId,description,reference,type,currency,amount,reconciled',...movements.map((row)=>[row.date,row.accountId,row.description||'',row.reference||'',row.type,row.currency,row.amount,row.reconciled].map(csvCell).join(','))].join('\n');
    const href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    const link=document.createElement('a');link.href=href;link.download='movimientos-bancarios.csv';link.click();URL.revokeObjectURL(href);
    notify('Extracto exportado con celdas protegidas.','success');
  }

  function reconKeyDown(event){
    if(!['ArrowDown','ArrowUp','j','k','Enter'].includes(event.key)||!reconLines.length)return;
    const index=Math.max(0,reconLines.findIndex((line)=>line.id===selectedLineId));
    if(event.key==='Enter'){event.preventDefault();void selectLine(reconLines[index]?.id);return;}
    event.preventDefault();
    const delta=event.key==='ArrowDown'||event.key==='j'?1:-1;
    const next=Math.max(0,Math.min(reconLines.length-1,index+delta));
    void selectLine(reconLines[next].id);
  }

  const movementColumns=[
    {key:'date',label:'Fecha',render:(item)=>shortDate(item.date)},
    {key:'account',label:'Cuenta',render:(item)=>{const account=accounts.find((a)=>a.id===item.accountId)||{};return <Box><Typography variant="body2" fontWeight={700}>{account.bank||'—'}</Typography><Typography variant="caption">{account.account||''}</Typography></Box>;}},
    {key:'description',label:'Descripción'},{key:'reference',label:'Referencia',render:(item)=>item.reference||'—'},
    {key:'type',label:'Tipo',render:(item)=><CgStatusChip size="small" label={item.type==='income'?'Ingreso':'Egreso'} tone={item.type==='income'?'success':'warning'}/>},
    {key:'amount',label:'Monto',align:'right',render:(item)=><CgMoney value={item.amount} currency={item.currency||'VES'}/>},
    {key:'status',label:'Estado',render:(item)=><CgStatusChip size="small" label={item.lifecycle==='reversal'?'Reverso':item.lifecycle==='correction'?'Corrección':item.reversedById?'Reversado':item.reconciled?'Conciliado':'Pendiente'} tone={item.reconciled?'success':item.reversedById?'default':'warning'}/>},
    {key:'actions',label:'Acciones',render:(item)=><Stack direction="row" gap={.5} flexWrap="wrap"><CgButton size="small" variant="outlined" onClick={()=>void toggleReconcile(item)}>{item.reconciled?'Desconciliar':'Conciliar'}</CgButton>{item.lifecycle==='normal'&&!item.reversedById?<CgButton size="small" variant="outlined" onClick={()=>prepareCorrection(item)}>Reversar/corregir</CgButton>:null}</Stack>}
  ];

  const reconColumns=[
    {key:'bookedAt',label:'Fecha',render:(line)=>shortDate(line.bookedAt)},
    {key:'reference',label:'Referencia',render:(line)=><Box><Typography variant="body2" fontWeight={700}>{line.reference||'—'}</Typography><Typography variant="caption">{line.counterparty||line.memo||'Sin contraparte'}</Typography></Box>},
    {key:'amount',label:'Monto',align:'right',render:(line)=><CgMoney value={line.amount} currency={line.currency||'VES'}/>},
    {key:'remaining',label:'Pendiente',align:'right',render:(line)=><CgMoney value={line.remaining} currency={line.currency||'VES'}/>},
    {key:'status',label:'Estado',render:(line)=><CgStatusChip size="small" label={line.status} tone={reconTone(line.status)}/>},
    {key:'action',label:'',render:(line)=><CgButton size="small" variant={line.id===selectedLineId?'contained':'outlined'} onClick={()=>void selectLine(line.id)}>Revisar</CgButton>}
  ];

  const historyColumns=[
    {key:'createdAt',label:'Fecha',render:(event)=>shortDate(event.createdAt)},{key:'type',label:'Evento'},{key:'kind',label:'Tipo',render:(event)=>event.kind||'—'},
    {key:'matchedAmount',label:'Monto',align:'right',render:(event)=>event.matchedAmount??'—'},
    {key:'reconciliationStatus',label:'Estado',render:(event)=>event.reconciliationStatus?<CgStatusChip size="small" label={event.reconciliationStatus} tone={event.reconciliationStatus==='reversed'?'default':'success'}/>: '—'}
  ];

  const importColumns=[
    {key:'fileName',label:'Archivo',render:(item)=><Box><Typography variant="body2" fontWeight={700}>{item.fileName}</Typography><Typography variant="caption">{item.format}</Typography></Box>},
    {key:'parserVersion',label:'Parser',render:(item)=><Box>{item.parserName}<Typography variant="caption" display="block">{item.parserVersion}</Typography></Box>},
    {key:'lineCount',label:'Líneas',align:'right'},{key:'createdAt',label:'Importado',render:(item)=>shortDate(item.createdAt)},
    {key:'sourceHash',label:'SHA-256',render:(item)=><Typography variant="caption" title={item.sourceHash} sx={{fontFamily:'monospace'}}>{String(item.sourceHash||'').slice(0,12)}…</Typography>}
  ];

  return <Stack gap={1.5}>
    <CgPageHeader eyebrow="Bancos" title="Tesorería y conciliación" description="Movimientos auditables, conciliación explicable, write-offs con maker-checker y modelos versionados." actions={<Stack direction="row" gap={.7} flexWrap="wrap"><CgButton variant="outlined" onClick={()=>{void loadBanking();void loadReconciliation(reconAccount,reconStatus);}}>Actualizar</CgButton><CgButton variant="outlined" onClick={()=>statementRef.current?.click()} disabled={!accounts.length||busy==='import'}>Importar extracto</CgButton><CgButton variant="outlined" onClick={exportCsv}>Exportar CSV</CgButton><input ref={statementRef} hidden type="file" accept=".csv,.ofx,.qfx,.xml,.camt,text/csv,application/xml" onChange={(e)=>void importStatement(e)}/></Stack>}/>
    {error?<CgState severity="warning" title="Carga incompleta">{error}</CgState>:null}
    {loading?<CgState severity="info" title="Actualizando">Cargando tesorería y conciliación.</CgState>:null}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:1}}>
      <Metric label="Saldo Bs" value={<CgMoney value={totalVes} currency="VES"/>}/>
      <Metric label="Saldo USD" value={<CgMoney value={totalUsd} currency="USD"/>} tone="primary"/>
      <Metric label="Pendientes" value={pending} tone={pending?'warning':'success'}/>
      <Metric label="Conciliado" value={`${reconciledPct}%`} tone={reconciledPct===100?'success':'primary'}/>
    </Box>

    {accounts.length?<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',xl:'repeat(4,minmax(0,1fr))'},gap:1}}>{accounts.map((account)=><Paper key={account.id} variant="outlined" sx={{p:1.4}}><Typography variant="caption" color="text.secondary">{account.bank}</Typography><Typography variant="h6"><CgMoney value={account.balance} currency={account.currency}/></Typography><Typography variant="caption" display="block">{account.account} · {account.type||'Cuenta bancaria'}</Typography><CgStatusChip size="small" label={account.integrity==='mismatch'?'Revisar integridad':account.integrity==='legacy-baseline-required'?'Baseline legacy':'Conciliable'} tone={account.integrity==='mismatch'?'error':account.integrity==='legacy-baseline-required'?'warning':'success'}/></Paper>)}</Box>:<CgEmptyState title="Sin cuentas bancarias" description="Registra la primera cuenta para iniciar tesorería."/>}

    <Section title="Conciliación de extractos" description="Raw inmutable → candidatos explicables → match/write-off → confirmado.">
      <Stack direction={{xs:'column',md:'row'}} gap={1} mb={1.2}>
        <CgSelect label="Cuenta" value={reconAccount} onChange={(e)=>setReconAccount(e.target.value)} options={accountOptions}/>
        <CgSelect label="Estado" value={reconStatus} onChange={(e)=>setReconStatus(e.target.value)} options={['unmatched','suggested','partial','reconciled','conflict','all'].map((value)=>({value,label:value}))}/>
        <CgButton variant="outlined" onClick={()=>void loadReconciliation(reconAccount,reconStatus)}>Actualizar conciliación</CgButton>
      </Stack>
      {closing?<CgState severity={closing.exact?'success':'warning'} title="Cierre bancario">Cierre {closing.closingBalance??'N/D'} {closing.currency||''} · saldo ContaGest {closing.ledgerBalance??'N/D'} · diferencia {closing.difference??'N/D'}</CgState>:null}
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(0,1.15fr) minmax(0,.85fr)'},gap:1.2,mt:1.2}}>
        <Box tabIndex={0} onKeyDown={reconKeyDown} aria-label="Líneas de conciliación">{reconLines.length?<Box sx={{maxWidth:'100%',overflowX:'auto'}}><CgDataTable columns={reconColumns} rows={reconLines} empty="Sin líneas"/></Box>:<CgEmptyState title="Sin líneas en este filtro" description="Importa un extracto o cambia el estado."/>}</Box>
        <Stack gap={1}>
          {selectedLine?<Paper variant="outlined" sx={{p:1.25}}><Typography fontWeight={700}>{selectedLine.reference||selectedLine.memo||'Línea sin referencia'}</Typography><Typography variant="caption">Monto {selectedLine.amount} {selectedLine.currency} · pendiente {selectedLine.remaining}</Typography></Paper>:<CgEmptyState title="Selecciona una línea" description="Usa los controles o teclado para revisar candidatos."/>}
          {candidatesLoading?<CgState severity="info" title="Buscando candidatos">Calculando coincidencias explicables.</CgState>:null}
          {candidates.map((candidate)=><Paper key={`${candidate.targetType}:${candidate.targetId}`} variant="outlined" sx={{p:1.1}}><Stack direction="row" justifyContent="space-between" gap={1}><Typography fontWeight={700}>{candidate.label}</Typography><CgStatusChip size="small" label={`${Math.round(Number(candidate.confidence||0)*100)}%`} tone={candidate.blockedReason?'error':Number(candidate.confidence)>=.95?'success':Number(candidate.confidence)>=.7?'warning':'default'}/></Stack><Typography variant="caption" display="block">{(candidate.reasons||[]).join(' · ')||'Sin coincidencias fuertes'}</Typography><Typography variant="caption" display="block">{candidate.currency} · pendiente {candidate.remaining}{candidate.blockedReason?` · ${candidate.blockedReason}`:''}</Typography>{!candidate.blockedReason?<CgButton size="small" variant="outlined" sx={{mt:.7}} onClick={()=>void reconcileCandidate(candidate)}>Conciliar con candidato</CgButton>:null}</Paper>)}
          {modelSuggestions.map((model)=><Paper key={model.modelId} variant="outlined" sx={{p:1.1}}><Typography fontWeight={700}>{model.name} · v{model.version}</Typography><Typography variant="caption" display="block">{model.accountCode} · {model.accountName}</Typography><CgButton size="small" variant="outlined" sx={{mt:.7}} onClick={()=>applyModel(model)}>Usar modelo en write-off</CgButton></Paper>)}

          {selectedLine?<Paper component="form" onSubmit={submitWriteoff} variant="outlined" sx={{p:1.2}}><Typography fontWeight={700}>Write-off auditable</Typography><Typography variant="caption" color="text.secondary">Genera asiento contable; si maker-checker aplica, requiere aprobación.</Typography><Stack gap={1} mt={1}><Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1}}><CgTextField label="Monto" type="number" inputProps={{step:.01,min:.01}} value={writeoffForm.amount} onChange={(e)=>setWriteoffForm({...writeoffForm,amount:e.target.value})}/><CgTextField label="Período fiscal" value={writeoffForm.fiscalPeriod} onChange={(e)=>setWriteoffForm({...writeoffForm,fiscalPeriod:e.target.value})}/></Box><CgTextField label="Cuenta write-off" required value={writeoffForm.writeoffAccountCode} onChange={(e)=>setWriteoffForm({...writeoffForm,writeoffAccountCode:e.target.value})}/><CgTextField label="Cuenta contable banco" required value={writeoffForm.bankLedgerAccountCode} onChange={(e)=>setWriteoffForm({...writeoffForm,bankLedgerAccountCode:e.target.value})}/><CgTextField label="Motivo" required value={writeoffForm.reason} onChange={(e)=>setWriteoffForm({...writeoffForm,reason:e.target.value})}/><CgTextField label="ID aprobación (si aplica)" value={writeoffForm.approvalRequestId} onChange={(e)=>setWriteoffForm({...writeoffForm,approvalRequestId:e.target.value})}/><CgButton type="submit" disabled={busy==='writeoff'}>{busy==='writeoff'?'Registrando…':'Registrar write-off'}</CgButton></Stack></Paper>:null}

          {activeReconciliations.length?<Paper component="form" onSubmit={submitReconReverse} variant="outlined" sx={{p:1.2}}><Typography fontWeight={700}>Deshacer conciliación</Typography><Stack gap={1} mt={1}><CgSelect label="Conciliación" value={reverseReconForm.reconciliationId} onChange={(e)=>setReverseReconForm({...reverseReconForm,reconciliationId:e.target.value})} options={[{value:'',label:'Seleccionar'},...activeReconciliations.map((event)=>({value:event.reconciliationId,label:`${event.kind||'match'} · ${event.matchedAmount||''} · ${String(event.reconciliationId).slice(0,8)}`}))]}/><CgTextField label="Motivo" required value={reverseReconForm.reason} onChange={(e)=>setReverseReconForm({...reverseReconForm,reason:e.target.value})}/><CgTextField label="Período fiscal" value={reverseReconForm.fiscalPeriod} onChange={(e)=>setReverseReconForm({...reverseReconForm,fiscalPeriod:e.target.value})}/><CgButton type="submit" variant="outlined">Reversar conciliación</CgButton></Stack></Paper>:null}
        </Stack>
      </Box>
      {history.length?<Box sx={{mt:1.2,maxWidth:'100%',overflowX:'auto'}}><CgDataTable columns={historyColumns} rows={history} empty="Sin historial"/></Box>:null}
      <Box sx={{mt:1.2,maxWidth:'100%',overflowX:'auto'}}>{imports.length?<CgDataTable columns={importColumns} rows={imports} empty="Sin extractos"/>:<CgEmptyState title="Sin extractos importados" description="CSV, OFX/QFX y CAMT se conservan con parser, versión y hash."/>}</Box>
    </Section>

    <Section title="Modelos recurrentes de conciliación" description="Versionados, explicables y auditables; una nueva versión conserva las anteriores.">
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1fr 1fr'},gap:1.2}}>
        <Box component="form" onSubmit={submitModel}><Stack gap={1}><CgTextField label="Nombre del modelo" required value={modelForm.name} onChange={(e)=>setModelForm({...modelForm,name:e.target.value})}/><CgTextField label="Texto recurrente de memo/referencia" required value={modelForm.memoPattern} onChange={(e)=>setModelForm({...modelForm,memoPattern:e.target.value})}/><CgTextField label="Cuenta write-off" required value={modelForm.accountCode} onChange={(e)=>setModelForm({...modelForm,accountCode:e.target.value})}/><CgTextField label="Código de motivo" required value={modelForm.reasonCode} onChange={(e)=>setModelForm({...modelForm,reasonCode:e.target.value})}/><CgTextField label="Confianza mínima" type="number" inputProps={{min:0,max:1,step:.01}} value={modelForm.minConfidence} onChange={(e)=>setModelForm({...modelForm,minConfidence:e.target.value})}/><CgSelect label="Elegible por regla" value={modelForm.autoApply} onChange={(e)=>setModelForm({...modelForm,autoApply:e.target.value})} options={[{value:'false',label:'No'},{value:'true',label:'Sí, pero confirmar siempre'}]}/><CgButton type="submit">Crear nueva versión</CgButton></Stack></Box>
        <Stack gap={.7}>{models.length?models.map((model)=><Paper key={model.id||`${model.name}:${model.version}`} variant="outlined" sx={{p:1}}><Stack direction="row" justifyContent="space-between"><Typography fontWeight={700}>{model.name} · v{model.version}</Typography><CgStatusChip size="small" label={model.active?'Activo':'Histórico'} tone={model.active?'success':'default'}/></Stack><Typography variant="caption" display="block">Patrón: {model.memoPattern}</Typography><Typography variant="caption">{model.accountCode} · {model.accountName} · {model.reasonCode}</Typography></Paper>):<CgEmptyState title="Sin modelos recurrentes" description="Crea modelos para comisiones y ajustes repetitivos."/>}</Stack>
      </Box>
    </Section>

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1fr 1fr'},gap:1.2}}>
      <Section title="Nueva cuenta" description="El saldo de apertura se registra en workflow auditable."><Box component="form" onSubmit={submitAccount}><Stack gap={1}><CgTextField label="Banco" required value={accountForm.bank} onChange={(e)=>setAccountForm({...accountForm,bank:e.target.value})}/><CgTextField label="Número de cuenta" required value={accountForm.account} onChange={(e)=>setAccountForm({...accountForm,account:e.target.value})}/><CgSelect label="Tipo" value={accountForm.accountType} onChange={(e)=>setAccountForm({...accountForm,accountType:e.target.value})} options={['Corriente','Ahorro','Caja','Pasarela'].map((value)=>({value,label:value}))}/><CgSelect label="Moneda" value={accountForm.accountCurrency} onChange={(e)=>setAccountForm({...accountForm,accountCurrency:e.target.value})} options={[{value:'VES',label:'Bolívares'},{value:'USD',label:'Dólares'}]}/><CgTextField label="Saldo inicial controlado" type="number" inputProps={{step:.01}} value={accountForm.openingBalance} onChange={(e)=>setAccountForm({...accountForm,openingBalance:e.target.value})}/><CgButton type="submit">Crear cuenta</CgButton></Stack></Box></Section>
      <Section title="Nuevo movimiento" description="El saldo se actualiza en una transacción auditable."><Box component="form" onSubmit={submitMovement}><Stack gap={1}><CgTextField label="Fecha" type="date" slotProps={{inputLabel:{shrink:true}}} value={movementForm.date} onChange={(e)=>setMovementForm({...movementForm,date:e.target.value})}/><CgSelect label="Cuenta" value={movementForm.accountId} onChange={(e)=>setMovementForm({...movementForm,accountId:e.target.value})} options={[{value:'',label:'Seleccionar'},...accountOptions]}/><CgTextField label="Descripción" required value={movementForm.description} onChange={(e)=>setMovementForm({...movementForm,description:e.target.value})}/><CgTextField label="Referencia" value={movementForm.reference} onChange={(e)=>setMovementForm({...movementForm,reference:e.target.value})}/><Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1}}><CgSelect label="Tipo" value={movementForm.type} onChange={(e)=>setMovementForm({...movementForm,type:e.target.value})} options={[{value:'income',label:'Ingreso'},{value:'expense',label:'Egreso'}]}/><CgSelect label="Moneda" value={movementForm.currency} onChange={(e)=>setMovementForm({...movementForm,currency:e.target.value})} options={[{value:'VES',label:'VES'},{value:'USD',label:'USD'}]}/></Box><CgTextField label="Monto" type="number" inputProps={{step:.01,min:.01}} value={movementForm.amount} onChange={(e)=>setMovementForm({...movementForm,amount:e.target.value})}/><CgButton type="submit">Registrar movimiento</CgButton></Stack></Box></Section>
    </Box>

    <Box ref={correctionRef}><Section title="Reversar o corregir" description="Conserva el original y crea evidencia relacionada con motivo.">{correctionOptions.length?<Box component="form" onSubmit={submitCorrection}><Stack gap={1}><CgSelect label="Movimiento original" value={correctionForm.movementId} onChange={(e)=>setCorrectionForm({...correctionForm,movementId:e.target.value})} options={[{value:'',label:'Seleccionar'},...correctionOptions]}/><CgSelect label="Acción" value={correctionForm.correctionAction} onChange={(e)=>setCorrectionForm({...correctionForm,correctionAction:e.target.value})} options={[{value:'reverse',label:'Reversar'},{value:'correct',label:'Corregir con movimiento sustituto'}]}/><CgTextField label="Motivo" required value={correctionForm.reason} onChange={(e)=>setCorrectionForm({...correctionForm,reason:e.target.value})}/><Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1}}><CgSelect label="Tipo corregido" value={correctionForm.type} onChange={(e)=>setCorrectionForm({...correctionForm,type:e.target.value})} options={[{value:'income',label:'Ingreso'},{value:'expense',label:'Egreso'}]}/><CgTextField label="Monto corregido" type="number" inputProps={{step:.01,min:.01}} value={correctionForm.amount} onChange={(e)=>setCorrectionForm({...correctionForm,amount:e.target.value})}/></Box><CgTextField label="Descripción corregida" value={correctionForm.description} onChange={(e)=>setCorrectionForm({...correctionForm,description:e.target.value})}/><CgTextField label="Referencia corregida" value={correctionForm.reference} onChange={(e)=>setCorrectionForm({...correctionForm,reference:e.target.value})}/><CgButton type="submit" variant="outlined">Aplicar reverso/corrección</CgButton></Stack></Box>:<CgEmptyState title="Sin movimientos corregibles" description="Registra un movimiento para habilitar este flujo."/>}</Section></Box>

    <Section title="Movimientos" description="No existe borrado económico normal. Reversos y correcciones quedan enlazados al original.">
      <Stack direction={{xs:'column',md:'row'}} gap={1} mb={1}><CgTextField fullWidth label="Buscar banco, referencia o descripción" value={search} onChange={(e)=>setSearch(e.target.value)} onBlur={()=>commitMovementQuery({search})}/><CgSelect label="Estado" value={status} onChange={(e)=>{const value=e.target.value;setStatus(value);commitMovementQuery({status:value});}} options={[{value:'all',label:'Todos'},{value:'pending',label:'Pendientes'},{value:'reconciled',label:'Conciliados'}]}/><CgButton variant="outlined" onClick={()=>{setSearch('');setStatus('all');context.UrlStateService?.clearParams?.(['search','status'],{replace:true});}}>Limpiar</CgButton></Stack>
      <Box sx={{maxWidth:'100%',overflowX:'auto'}}><CgDataTable columns={movementColumns} rows={filteredMovements} empty="Sin movimientos"/></Box>
    </Section>
  </Stack>;
}

let activeRoot=null;
export const BankingPage={
  render(){return '<section class="cg-page-stack"><div id="bankingReactRoot"></div></section>';},
  mount(state,context){
    const host=document.getElementById('bankingReactRoot');
    if(!host)return;
    try{activeRoot?.unmount();}catch{}
    activeRoot=createRoot(host);
    activeRoot.render(<CgProvider state={state}><BankingWorkspace state={state} context={context}/></CgProvider>);
  }
};
