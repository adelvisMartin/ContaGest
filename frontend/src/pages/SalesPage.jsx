import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgMoney, CgPageHeader, CgProvider, CgSelect, CgState, CgStatusChip, CgTextField
} from '../components/ui/cg/CgPrimitives.jsx';
import { shortDate } from '../core/formatters.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';
import { uid, today } from '../utils/dom.js';

const rows=(value)=>Array.isArray(value)?value:[];
const statusTone=(status)=>status==='Cobrada'?'success':status==='Anulada'?'error':'warning';

function Metric({label,value,hint,tone='default'}){
  return <Paper variant="outlined" sx={{p:1.4,minWidth:0}}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Stack direction="row" gap={1} justifyContent="space-between" alignItems="center">
      <Typography variant="h6" sx={{fontVariantNumeric:'tabular-nums'}}>{value}</Typography>
      {hint?<CgStatusChip size="small" label={hint} tone={tone}/>:null}
    </Stack>
  </Paper>;
}

function SalesWorkspace({state,context}){
  const Store=context.Store;
  const Toast=context.Toast;
  const navigate=context.navigate;
  const SupabaseSyncService=context.SupabaseSyncService;
  const [sales,setSales]=useState(rows(state.sales));
  const [syncing,setSyncing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const clientRef=useRef(null);
  const [form,setForm]=useState({
    date:today(),
    invoice:`FAC-${new Date().getFullYear()}-${String(rows(state.sales).length+1).padStart(3,'0')}`,
    clientId:'',client:'',amount:'0',status:'Cobrada',method:'Transferencia'
  });

  const clients=rows(Store.get().clients||state.clients);
  const clientOptions=useMemo(()=>[
    {value:'',label:'Consumidor final / sin cliente'},
    ...clients.map((client)=>({value:client.id,label:`${client.name} · ${client.rif}`}))
  ],[clients]);
  const total=useMemo(()=>sales.reduce((sum,item)=>sum+Number(item.amount||0),0),[sales]);
  const pending=useMemo(()=>sales.filter((item)=>String(item.status).toLowerCase().includes('pend')).length,[sales]);
  const pendingAmount=useMemo(()=>sales.filter((item)=>item.status!=='Cobrada'&&item.status!=='Anulada').reduce((sum,item)=>sum+Number(item.amount||0),0),[sales]);

  const notify=(message,tone='success')=>Toast?.show?.(message,tone);

  async function sync({silent=false}={}){
    setSyncing(true);setError('');
    try{
      await SupabaseSyncService.pullSales({Store,Toast,force:true,silent:true});
      setSales(rows(Store.get().sales));
      if(!silent)notify('Ventas sincronizadas.','success');
    }catch(cause){
      const message=cause?.message||'No se pudieron sincronizar las ventas.';
      setError(message);if(!silent)notify(message,'error');
    }finally{setSyncing(false);}
  }

  async function submit(event){
    event.preventDefault();
    setSaving(true);
    try{
      const client=clients.find((item)=>item.id===form.clientId);
      const payload={...form,client:form.client||client?.name||'Consumidor final'};
      const saved=await SupabaseSyncService.createSale(payload);
      Store.update((draft)=>{draft.sales=[saved,...(draft.sales||[]).filter((item)=>item.id!==saved.id)];});
      setSales((current)=>[saved,...current.filter((item)=>item.id!==saved.id)]);
      setForm({
        date:today(),
        invoice:`FAC-${new Date().getFullYear()}-${String(sales.length+2).padStart(3,'0')}`,
        clientId:'',client:'',amount:'0',status:'Cobrada',method:'Transferencia'
      });
      notify('Venta guardada y contabilizada.','success');
    }catch(cause){
      const decision=RuntimePolicy.handlePersistenceFailure(cause,'la venta');
      if(decision.allowFallback){
        const local={id:uid('sale'),...form,amount:Number(form.amount||0),source:'local'};
        Store.update((draft)=>{
          draft.sales=draft.sales||[];
          draft.sales.unshift(local);
          draft.auditLog=draft.auditLog||[];
          draft.auditLog.unshift({id:uid('log'),module:'sales',action:'create-sale-offline-fallback',at:new Date().toISOString()});
        });
        setSales((current)=>[local,...current]);
        notify(`Venta guardada localmente; la sincronización está pendiente. ${decision.message}`,'warning');
      }else notify(decision.message,'error');
    }finally{setSaving(false);}
  }

  function sendToQuote(sale){
    Store.update((draft)=>{
      draft.quote.manualAmount=sale.amount;
      draft.quote.observation=`Generado desde venta ${sale.invoice}`;
    });
    notify('Venta cargada al cotizador.','success');
    navigate('cotizacion');
  }

  const columns=[
    {key:'invoice',label:'Factura',render:(sale)=>sale.invoice||sale.id},
    {key:'date',label:'Fecha',render:(sale)=>shortDate(sale.date)},
    {key:'client',label:'Cliente'},
    {key:'amount',label:'Monto',align:'right',render:(sale)=><CgMoney value={sale.amount} currency="VES"/>},
    {key:'method',label:'Método',render:(sale)=>sale.method||'VES'},
    {key:'status',label:'Estado',render:(sale)=><CgStatusChip size="small" label={sale.status||'Pendiente'} tone={statusTone(sale.status)}/>},
    {key:'source',label:'Sync',render:(sale)=><CgStatusChip size="small" label={sale.source==='supabase'?'Sincronizada':'Pendiente sync'} tone={sale.source==='supabase'?'success':'warning'}/>},
    {key:'actions',label:'Acciones',render:(sale)=><CgButton size="small" variant="outlined" onClick={()=>sendToQuote(sale)}>Cargar al cotizador</CgButton>}
  ];

  return <Stack className="cg-sales-workspace" gap={1.5}>
    <CgPageHeader
      eyebrow="Ventas"
      title="Ventas y cobranza"
      description="Registra documentos comerciales, revisa cobranza pendiente y conserva el flujo seguro hacia cotizaciones."
      actions={<>
        <CgButton onClick={()=>clientRef.current?.focus()}>Nueva venta</CgButton>
        <CgButton variant="outlined" onClick={()=>void sync()} disabled={syncing}>{syncing?'Sincronizando…':'Sincronizar'}</CgButton>
      </>}
    />
    {error?<CgState severity="warning" title="Sincronización incompleta">{error}</CgState>:null}
    {syncing?<CgState severity="info" title="Actualizando">Consultando ventas registradas.</CgState>:null}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:1}}>
      <Metric label="Ventas del período" value={<CgMoney value={total} currency="VES"/>} hint={`${sales.length} documentos`} tone="success"/>
      <Metric label="Documentos pendientes" value={pending} hint="Pendiente" tone={pending?'warning':'success'}/>
      <Metric label="Cobranza pendiente" value={<CgMoney value={pendingAmount} currency="VES"/>} tone={pendingAmount?'warning':'success'}/>
      <Metric label="Ticket promedio" value={<CgMoney value={total/Math.max(sales.length,1)} currency="VES"/>} tone="primary"/>
    </Box>

    <Paper component="form" onSubmit={submit} variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Registrar venta</Typography>
      <Typography variant="caption" color="text.secondary">Una venta registrada no se elimina desde esta vista; las anulaciones deben conservar trazabilidad.</Typography>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:1,mt:1.25}}>
        <CgTextField size="small" label="Fecha" type="date" slotProps={{inputLabel:{shrink:true}}} value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})}/>
        <CgTextField size="small" label="Factura" value={form.invoice} onChange={(e)=>setForm({...form,invoice:e.target.value})}/>
        <CgSelect label="Cliente registrado" value={form.clientId} onChange={(e)=>setForm({...form,clientId:e.target.value})} options={clientOptions}/>
        <CgTextField inputRef={clientRef} size="small" label="Cliente libre" placeholder="Nombre libre si no está registrado" value={form.client} onChange={(e)=>setForm({...form,client:e.target.value})}/>
        <CgTextField size="small" label="Monto" type="number" inputProps={{step:.01,min:0}} value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})}/>
        <CgSelect label="Estado" value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} options={[{value:'Cobrada',label:'Cobrada'},{value:'Pendiente',label:'Pendiente'},{value:'Borrador',label:'Borrador'}]}/>
        <CgSelect label="Método" value={form.method} onChange={(e)=>setForm({...form,method:e.target.value})} options={['Transferencia','Punto','Efectivo','Crédito'].map((value)=>({value,label:value}))}/>
        <CgButton type="submit" disabled={saving} sx={{minHeight:44}}>{saving?'Guardando…':'Registrar venta'}</CgButton>
      </Box>
    </Paper>

    <Box>
      <Typography variant="h6">Ventas registradas</Typography>
      <Typography variant="caption" color="text.secondary">Estado de cobro, sincronización y acciones seguras disponibles.</Typography>
      <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}>
        <CgDataTable columns={columns} rows={sales} empty="Sin ventas registradas"/>
      </Box>
    </Box>
  </Stack>;
}

let activeRoot=null;
export const SalesPage={
  render(){return '<section class="cg-page-stack"><div id="salesReactRoot"></div></section>';},
  mount(state,context){
    const host=document.getElementById('salesReactRoot');
    if(!host)return;
    try{activeRoot?.unmount();}catch{}
    activeRoot=createRoot(host);
    activeRoot.render(<CgProvider state={state}><SalesWorkspace state={state} context={context}/></CgProvider>);
  }
};
