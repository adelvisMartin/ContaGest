import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgMoney, CgPageHeader, CgProvider, CgSelect, CgState, CgStatusChip, CgTextField
} from '../components/ui/cg/CgPrimitives.jsx';
import { shortDate } from '../core/formatters.js';
import { BackendApi } from '../services/backendApi.js';
import { acceptServerPosProduct, normalizePosLookupCode } from '../services/posProductLookup.mjs';
import { addPosCartItem, decrementPosCartItem, removePosCartItem, setPosCartQuantity } from '../services/posCartPolicy.mjs';
import { today } from '../utils/dom.js';

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
  const [posCode,setPosCode]=useState('');
  const [posLoading,setPosLoading]=useState(false);
  const [posDraftError,setPosDraftError]=useState('');
  const [posCart,setPosCart]=useState([]);
  const [posNames,setPosNames]=useState({});
  const [posQuantityInputs,setPosQuantityInputs]=useState({});
  const posCartRef=useRef([]);
  const posBusyRef=useRef(false);
  const posTenantId=BackendApi.tenantId;
  const posTenantRef=useRef(posTenantId);
  const visiblePosCart=posTenantRef.current===posTenantId?posCart:[];
  React.useEffect(()=>{
    posTenantRef.current=posTenantId;
    posCartRef.current=[];
    setPosCart([]);
    setPosNames({});
    setPosQuantityInputs({});
    setPosCode('');
    setPosDraftError('');
  },[posTenantId]);
  const saleSaveInFlight=useRef(false);
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
    if (saleSaveInFlight.current) return;
    saleSaveInFlight.current = true;
    setSaving(true);
    setError('');
    try{
      const client=clients.find((item)=>item.id===form.clientId);
      const payload={...form,client:form.client||client?.name||'Consumidor final'};
      const saved=await SupabaseSyncService.createSale(payload);
      if (!saved || typeof saved.id !== 'string' || !saved.id.trim()) {
        throw new Error('SALES_SERVER_CONFIRMATION_MISSING');
      }
      Store.update((draft)=>{draft.sales=[saved,...(draft.sales||[]).filter((item)=>item.id!==saved.id)];});
      setSales((current)=>[saved,...current.filter((item)=>item.id!==saved.id)]);
      setForm({
        date:today(),
        invoice:`FAC-${new Date().getFullYear()}-${String(sales.length+2).padStart(3,'0')}`,
        clientId:'',client:'',amount:'0',status:'Cobrada',method:'Transferencia'
      });
      notify(form.status==='Borrador'?'Borrador confirmado por el servidor.':'Venta confirmada por el servidor.','success');
    }catch{
      // A timeout may occur after the server commits. Never fabricate a sale
      // locally or recommend an immediate retry without reconciliation.
      const message='Venta no confirmada. Consulta y sincroniza Ventas antes de intentar otra vez; se conservó el formulario.';
      setError(message);
      notify(message,'warning');
    }finally{
      saleSaveInFlight.current = false;
      setSaving(false);
    }
  }

  function sendToQuote(sale){
    Store.update((draft)=>{
      draft.quote.manualAmount=sale.amount;
      draft.quote.observation=`Generado desde venta ${sale.invoice}`;
    });
    notify('Venta cargada al cotizador.','success');
    navigate('cotizacion');
  }


  // Draft only: every lookup is authenticated and tenant-scoped in sales API.
  // The client never authorizes a sale, calculates IVA or posts stock/payments.
  async function addPosDraftProduct(event){
    event.preventDefault();
    if(posBusyRef.current)return;
    posBusyRef.current=true;
    setPosLoading(true);
    setPosDraftError('');
    const tenantAtStart=BackendApi.tenantId;
    try{
      const code=normalizePosLookupCode(posCode);
      if(!code){
        setPosDraftError('Escribe un SKU o código válido (máximo 64 caracteres).');
        return;
      }
      // Server resolves SKU, barcode and ProductCode under the authenticated
      // tenant with collision rejection; no paginated client-side guesswork.
      const resolved=await BackendApi.get(`/sales/pos/product-lookup?code=${encodeURIComponent(code)}`);
      if(tenantAtStart!==BackendApi.tenantId || posTenantRef.current!==tenantAtStart){
        setPosDraftError('Cambió la empresa activa. Vuelve a consultar los productos.');
        return;
      }
      const decision=acceptServerPosProduct(resolved);
      if(decision.kind!=='found'){
        setPosDraftError('El servidor devolvió un producto no válido. No se añadió nada al carrito.');
        return;
      }
      const next=addPosCartItem(posCartRef.current,decision.product.id);
      posCartRef.current=next;
      setPosCart(next);
      setPosQuantityInputs((current)=>({...current,[decision.product.id]:next.find((line)=>line.productId===decision.product.id).quantity}));
      setPosNames((current)=>({...current,[decision.product.id]:{
        sku:decision.product.sku,name:decision.product.name
      }}));
      setPosCode('');
      notify('Producto agregado al borrador. La venta aún no está confirmada.','success');
    }catch(cause){
      if(tenantAtStart!==BackendApi.tenantId || posTenantRef.current!==tenantAtStart){
        setPosDraftError('Cambió la empresa activa. Vuelve a consultar los productos.');
      }else{
        const status=cause?.status;
        const message=status===404?'Código no encontrado en el catálogo del servidor.'
          :status===409?'Código ambiguo: pertenece a varios productos. Requiere revisión.'
          :status===400?'Código inválido para el servidor.'
          :'No se pudo consultar el producto. Comprueba la conexión y tus permisos.';
        setPosDraftError(message);
      }
    }finally{
      posBusyRef.current=false;
      setPosLoading(false);
    }
  }

  function commitPosDraftCart(next,productId){
    posCartRef.current=next;
    setPosCart(next);
    setPosQuantityInputs((current)=>{
      const updated={...current};
      const line=next.find((candidate)=>candidate.productId===productId);
      if(line)updated[productId]=line.quantity;
      else delete updated[productId];
      return updated;
    });
    setPosDraftError('');
  }

  function removePosDraftProduct(productId){
    if(posTenantRef.current!==BackendApi.tenantId)return;
    commitPosDraftCart(removePosCartItem(posCartRef.current,productId),productId);
  }

  function stepPosDraftQuantity(productId,direction){
    if(posTenantRef.current!==BackendApi.tenantId)return;
    try{
      const next=direction===1
        ?addPosCartItem(posCartRef.current,productId,'1.000')
        :decrementPosCartItem(posCartRef.current,productId);
      commitPosDraftCart(next,productId);
    }catch{
      setPosDraftError('No se pudo ajustar la cantidad. Comprueba sus límites.');
    }
  }

  function applyPosDraftQuantity(productId){
    if(posTenantRef.current!==BackendApi.tenantId)return;
    try{
      const existing=posCartRef.current.find((line)=>line.productId===productId);
      if(!existing)return;
      const proposed=posQuantityInputs[productId]??existing.quantity;
      commitPosDraftCart(setPosCartQuantity(posCartRef.current,productId,proposed),productId);
    }catch{
      setPosDraftError('Cantidad inválida: utiliza un valor mayor que cero y hasta tres decimales.');
    }
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

    <Paper component="section" variant="outlined" aria-label="Carrito POS de borrador" sx={{p:1.5}}>
      <Typography variant="h6">Venta rápida · carrito en preparación</Typography>
      <Typography variant="caption" color="text.secondary">
        Consulta productos del servidor por SKU, código de barras o alias. Este carrito no crea facturas, no reserva inventario y no procesa cobros.
      </Typography>
      <Box component="form" onSubmit={addPosDraftProduct} sx={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:1,mt:1.25}}>
        <CgTextField
          size="small"
          label="SKU o código de barras"
          placeholder="Ej. 000123456789"
          value={posCode}
          onChange={(event)=>setPosCode(event.target.value)}
          disabled={posLoading}
          sx={{flex:'1 1 220px'}}
        />
        <CgButton type="submit" disabled={posLoading||!posCode.trim()} sx={{minHeight:44}}>
          {posLoading?'Consultando…':'Agregar al borrador'}
        </CgButton>
      </Box>
      {posDraftError?<CgState severity="warning" title="Carrito no actualizado">{posDraftError}</CgState>:null}
      <Typography variant="caption" color="text.secondary" role="status" aria-live="polite" sx={{display:'block',mt:1}}>
        {visiblePosCart.length} productos distintos · Sin total fiscal ni cobro confirmado
      </Typography>
      {visiblePosCart.length?
        <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}>
          <CgDataTable rows={visiblePosCart.map((line)=>({...line,...(posNames[line.productId]||{sku:'—',name:'Producto en revisión'})}))}
            columns={[
              {key:'sku',label:'SKU'},
              {key:'name',label:'Producto'},
              {key:'quantity',label:'Cantidad',render:(line)=><Box sx={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:1,minWidth:280}}>
                <CgButton type="button" size="small" variant="outlined" aria-label={`Disminuir una unidad de ${line.name}`}
                  disabled={posLoading} onClick={()=>stepPosDraftQuantity(line.productId,-1)} sx={{minWidth:44,minHeight:44}}>−1</CgButton>
                <CgTextField size="small" label={`Cantidad de ${line.sku}`} inputProps={{inputMode:'decimal'}}
                  value={posQuantityInputs[line.productId]??line.quantity}
                  onChange={(event)=>setPosQuantityInputs((current)=>({...current,[line.productId]:event.target.value}))}
                  disabled={posLoading} sx={{width:148}}/>
                <CgButton type="button" size="small" variant="outlined" aria-label={`Aumentar una unidad de ${line.name}`}
                  disabled={posLoading} onClick={()=>stepPosDraftQuantity(line.productId,1)} sx={{minWidth:44,minHeight:44}}>+1</CgButton>
                <CgButton type="button" size="small" variant="outlined" disabled={posLoading}
                  onClick={()=>applyPosDraftQuantity(line.productId)} sx={{minHeight:44}}>Aplicar</CgButton>
              </Box>},
              {key:'actions',label:'Acciones',render:(line)=><CgButton type="button" size="small" variant="outlined"
                disabled={posLoading} onClick={()=>removePosDraftProduct(line.productId)} sx={{minHeight:44}}>Quitar</CgButton>}
            ]}/>
        </Box>
        :<CgState severity="info" title="Carrito vacío">Escanea o escribe un código para preparar líneas de venta sin efectos financieros.</CgState>}
      <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1}}>
        La confirmación de la venta y los impuestos requieren el servicio de ventas y las validaciones de caja e inventario.
      </Typography>
    </Paper>

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
