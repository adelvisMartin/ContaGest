import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgDialog, CgMoney, CgPageHeader, CgProvider, CgSelect, CgState, CgStatusChip, CgTextField
} from '../components/ui/cg/CgPrimitives.jsx';
import { PayablesPanel } from '../components/payables/PayablesPanel.jsx';
import { shortDate } from '../core/formatters.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';
import { PurchaseOperationsService } from '../services/purchaseOperationsService.js';
import { uid, today } from '../utils/dom.js';

const rows=(value)=>Array.isArray(value)?value:[];
const statusTone=(status)=>status==='Anulada'?'error':status==='Borrador'?'warning':status==='Cobrada'?'success':'primary';

function Metric({label,value,hint,tone='default'}){
  return <Paper variant="outlined" sx={{p:1.4,minWidth:0}}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Stack direction="row" gap={1} justifyContent="space-between" alignItems="center">
      <Typography variant="h6" sx={{fontVariantNumeric:'tabular-nums'}}>{value}</Typography>
      {hint?<CgStatusChip size="small" label={hint} tone={tone}/>:null}
    </Stack>
  </Paper>;
}

function PurchasesWorkspace({state,context}){
  const Store=context.Store;
  const Toast=context.Toast;
  const SupabaseSyncService=context.SupabaseSyncService;
  const [purchases,setPurchases]=useState(rows(state.purchases));
  const [syncing,setSyncing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [actionTarget,setActionTarget]=useState(null);
  const [form,setForm]=useState({date:today(),supplierId:'',reference:'',amount:'0',iva:'0'});

  const suppliers=rows(Store.get().suppliers||state.suppliers);
  const supplierOptions=useMemo(()=>[
    {value:'',label:'Proveedor no registrado'},
    ...suppliers.map((supplier)=>({value:supplier.id,label:`${supplier.name} · ${supplier.rif}`}))
  ],[suppliers]);
  const active=useMemo(()=>purchases.filter((item)=>item.status!=='Anulada'),[purchases]);
  const subtotal=useMemo(()=>active.reduce((sum,item)=>sum+Number(item.amount||0),0),[active]);
  const iva=useMemo(()=>active.reduce((sum,item)=>sum+Number(item.iva||0),0),[active]);
  const notify=(message,tone='success')=>Toast?.show?.(message,tone);

  async function sync({silent=false}={}){
    setSyncing(true);setError('');
    try{
      await SupabaseSyncService.pullPurchases({Store,Toast,force:true,silent:true});
      setPurchases(rows(Store.get().purchases));
      if(!silent)notify('Compras sincronizadas.','success');
    }catch(cause){
      const message=cause?.message||'No se pudieron sincronizar las compras.';
      setError(message);if(!silent)notify(message,'error');
    }finally{setSyncing(false);}
  }

  async function submit(event){
    event.preventDefault();
    setSaving(true);
    try{
      const saved=await SupabaseSyncService.createPurchase(form);
      Store.update((draft)=>{draft.purchases=[saved,...(draft.purchases||[]).filter((item)=>item.id!==saved.id)];});
      setPurchases((current)=>[saved,...current.filter((item)=>item.id!==saved.id)]);
      setForm({date:today(),supplierId:'',reference:'',amount:'0',iva:'0'});
      notify('Compra guardada y contabilizada en el servidor.','success');
    }catch(cause){
      const decision=RuntimePolicy.handlePersistenceFailure(cause,'la compra');
      if(decision.allowFallback){
        const local={id:uid('pur'),...form,amount:Number(form.amount||0),iva:Number(form.iva||0),status:'Borrador',source:'local'};
        Store.update((draft)=>{draft.purchases=draft.purchases||[];draft.purchases.unshift(local);});
        setPurchases((current)=>[local,...current]);
        notify(`Compra guardada localmente; la sincronización está pendiente. ${decision.message}`,'warning');
      }else notify(decision.message,'error');
    }finally{setSaving(false);}
  }

  async function confirmAction(){
    const target=actionTarget;
    if(!target)return;
    setSaving(true);
    try{
      if(target.kind==='delete'){
        if(target.purchase.source==='supabase')await PurchaseOperationsService.deleteDraft(target.purchase.id);
        Store.update((draft)=>{draft.purchases=(draft.purchases||[]).filter((item)=>item.id!==target.purchase.id);});
        setPurchases((current)=>current.filter((item)=>item.id!==target.purchase.id));
        notify('Borrador de compra eliminado.','success');
      }else{
        const result=await PurchaseOperationsService.cancel(target.purchase.id);
        Store.update((draft)=>{draft.purchases=(draft.purchases||[]).map((item)=>item.id===target.purchase.id?result.purchase:item);});
        setPurchases((current)=>current.map((item)=>item.id===target.purchase.id?result.purchase:item));
        notify(result.accountingWarning?`Compra anulada. ${result.accountingWarning}`:'Compra anulada y asiento contable revertido.',result.accountingWarning?'warning':'success');
      }
      setActionTarget(null);
    }catch(cause){notify(`No se completó la operación: ${cause?.message||'Error'}`,'error');}
    finally{setSaving(false);}
  }

  const columns=[
    {key:'date',label:'Fecha',render:(purchase)=>shortDate(purchase.date)},
    {key:'supplier',label:'Proveedor',render:(purchase)=>suppliers.find((item)=>item.id===purchase.supplierId)?.name||purchase.supplier?.name||'—'},
    {key:'reference',label:'Referencia',render:(purchase)=><strong>{purchase.reference}</strong>},
    {key:'amount',label:'Base',align:'right',render:(purchase)=><CgMoney value={purchase.amount} currency="VES"/>},
    {key:'iva',label:'IVA',align:'right',render:(purchase)=><CgMoney value={purchase.iva} currency="VES"/>},
    {key:'total',label:'Total',align:'right',render:(purchase)=><CgMoney value={Number(purchase.amount||0)+Number(purchase.iva||0)} currency="VES"/>},
    {key:'status',label:'Estado',render:(purchase)=><CgStatusChip size="small" label={purchase.status||'Pendiente'} tone={statusTone(purchase.status)}/>},
    {key:'source',label:'Sync',render:(purchase)=><CgStatusChip size="small" label={purchase.source==='supabase'?'Sincronizada':'Pendiente sync'} tone={purchase.source==='supabase'?'success':'warning'}/>},
    {key:'actions',label:'Acciones',render:(purchase)=>{
      const status=purchase.status||'Pendiente';
      if(status==='Anulada')return <Typography variant="caption" color="text.secondary">Sin acciones</Typography>;
      const kind=status==='Borrador'||purchase.source!=='supabase'?'delete':'cancel';
      return <CgButton size="small" color={kind==='delete'?'error':'primary'} variant="outlined" onClick={()=>setActionTarget({kind,purchase})}>{kind==='delete'?'Eliminar borrador':'Anular compra'}</CgButton>;
    }}
  ];

  return <Stack className="cg-purchases-workspace" gap={1.5}>
    <CgPageHeader eyebrow="Compras" title="Compras y cuentas por pagar" description="Registra compras, procesa facturas asistidas y conserva trazabilidad de borradores, anulaciones y evidencia." actions={<CgButton variant="outlined" onClick={()=>void sync()} disabled={syncing}>{syncing?'Sincronizando…':'Sincronizar'}</CgButton>}/>
    {error?<CgState severity="warning" title="Sincronización incompleta">{error}</CgState>:null}
    {syncing?<CgState severity="info" title="Actualizando">Consultando compras y documentos asociados.</CgState>:null}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:1}}>
      <Metric label="Base vigente" value={<CgMoney value={subtotal} currency="VES"/>}/>
      <Metric label="IVA crédito" value={<CgMoney value={iva} currency="VES"/>} tone="primary"/>
      <Metric label="Facturas" value={purchases.length} hint={`${purchases.filter((item)=>item.status==='Anulada').length} anuladas`} tone="warning"/>
      <Metric label="Total vigente" value={<CgMoney value={subtotal+iva} currency="VES"/>} tone="success"/>
    </Box>

    <PayablesPanel state={state} context={context} onPurchasesChanged={()=>setPurchases(rows(Store.get().purchases))}/>

    <Paper component="form" onSubmit={submit} variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Registrar compra</Typography>
      <Typography variant="caption" color="text.secondary">Proveedor, referencia y montos que alimentan compras y contabilidad.</Typography>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',lg:'repeat(5,minmax(0,1fr))'},gap:1,mt:1.25}}>
        <CgTextField size="small" label="Fecha" type="date" slotProps={{inputLabel:{shrink:true}}} value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})}/>
        <CgSelect label="Proveedor" value={form.supplierId} onChange={(e)=>setForm({...form,supplierId:e.target.value})} options={supplierOptions}/>
        <CgTextField size="small" label="Referencia" required value={form.reference} onChange={(e)=>setForm({...form,reference:e.target.value})}/>
        <CgTextField size="small" label="Base" type="number" inputProps={{step:.01,min:0}} value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})}/>
        <CgTextField size="small" label="IVA" type="number" inputProps={{step:.01,min:0}} value={form.iva} onChange={(e)=>setForm({...form,iva:e.target.value})}/>
      </Box>
      <CgButton type="submit" disabled={saving} sx={{mt:1.25}}>{saving?'Guardando…':'Registrar compra'}</CgButton>
    </Paper>

    <Box>
      <Typography variant="h6">Compras registradas</Typography>
      <Typography variant="caption" color="text.secondary">Estado, sincronización y acciones de reverso o borrador.</Typography>
      <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}><CgDataTable columns={columns} rows={purchases} empty="Sin compras registradas"/></Box>
    </Box>

    <CgDialog open={Boolean(actionTarget)} title={actionTarget?.kind==='delete'?'Eliminar borrador':'Anular compra'} onClose={()=>setActionTarget(null)} confirmLabel={saving?'Procesando…':actionTarget?.kind==='delete'?'Eliminar borrador':'Anular compra'} destructive onConfirm={()=>void confirmAction()}>
      <CgState severity="warning" title="Operación auditable">{actionTarget?.kind==='delete'?'El borrador será eliminado; si existe en servidor se usará la operación autorizada.':'Se generará el reverso contable y el documento conservará su trazabilidad.'}</CgState>
    </CgDialog>
  </Stack>;
}

let activeRoot=null;
export const PurchasesPage={
  render(){return '<section class="cg-page-stack"><div id="purchasesReactRoot"></div></section>';},
  mount(state,context){
    const host=document.getElementById('purchasesReactRoot');
    if(!host)return;
    try{activeRoot?.unmount();}catch{}
    activeRoot=createRoot(host);
    activeRoot.render(<CgProvider state={state}><PurchasesWorkspace state={state} context={context}/></CgProvider>);
  }
};
