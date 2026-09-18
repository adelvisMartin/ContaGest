import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgDialog, CgEmptyState, CgMoney, CgPageHeader, CgProvider,
  CgSelect, CgState, CgStatusChip, CgTextField
} from '../components/ui/cg/CgPrimitives.jsx';
import { calculateInventory } from '../core/calculator.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';
import { InventoryService } from '../services/inventoryService.js';
import { uid } from '../utils/dom.js';

const rows=(value)=>Array.isArray(value)?value:[];
const movementDate=(value)=>String(value||'').replace('T',' ').slice(0,19)||'—';
const movementTone=(type)=>type==='in'?'success':type==='out'?'warning':'default';

function FormCard({title,description,children}){
  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Typography variant="h6">{title}</Typography>
    <Typography variant="caption" color="text.secondary">{description}</Typography>
    <Divider sx={{my:1.2}}/>
    {children}
  </Paper>;
}

function InventoryWorkspace({state,context}){
  const Store=context.Store;
  const Toast=context.Toast;
  const navigate=context.navigate;
  const SupabaseSyncService=context.SupabaseSyncService;

  const [inventory,setInventory]=useState(rows(state.inventory));
  const [movements,setMovements]=useState(rows(state.inventoryMovements).slice().reverse().slice(0,20));
  const [syncing,setSyncing]=useState(false);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState('');
  const [reverseTarget,setReverseTarget]=useState(null);
  const [reverseReason,setReverseReason]=useState('Corrección de movimiento registrado por error');

  const [productForm,setProductForm]=useState({sku:'',name:'',category:'Inventario',min:'0',costUsd:'0',priceUsd:'0'});
  const [movementForm,setMovementForm]=useState({productId:'',type:'in',quantity:'',unitCost:'',source:'manual',reasonCode:'MANUAL',note:''});
  const [adjustmentForm,setAdjustmentForm]=useState({productId:'',targetStock:'',reasonCode:'PHYSICAL_COUNT',note:''});

  const summary=useMemo(()=>calculateInventory(inventory),[inventory]);
  const productOptions=useMemo(()=>[
    {value:'',label:inventory.length?'Seleccionar producto':'No hay productos registrados'},
    ...inventory.map((item)=>({value:item.id,label:`${item.sku} · ${item.name}`}))
  ],[inventory]);

  const notify=(message,tone='success')=>Toast?.show?.(message,tone);

  function syncFromStore(){
    const current=Store.get();
    setInventory(rows(current.inventory));
    setMovements(rows(current.inventoryMovements).slice().reverse().slice(0,20));
  }

  async function refresh({silent=false}={}){
    setSyncing(true);
    setError('');
    try{
      await SupabaseSyncService.pullProducts({Store,Toast,force:true,silent:true});
      syncFromStore();
      if(!silent)notify('Inventario sincronizado.','success');
    }catch(cause){
      const message=cause?.message||'No se pudo sincronizar inventario.';
      setError(message);
      if(!silent)notify(message,'error');
    }finally{setSyncing(false);}
  }

  async function submitProduct(event){
    event.preventDefault();
    if(!productForm.sku.trim()||!productForm.name.trim())return notify('SKU y producto son obligatorios.','warning');
    setSaving('product');
    try{
      const saved=await SupabaseSyncService.createProduct(productForm);
      Store.update((draft)=>{draft.inventory=[saved,...(draft.inventory||[]).filter((item)=>item.id!==saved.id)];});
      setInventory((current)=>[saved,...current.filter((item)=>item.id!==saved.id)]);
      setProductForm({sku:'',name:'',category:'Inventario',min:'0',costUsd:'0',priceUsd:'0'});
      notify('Producto maestro guardado. Registra el saldo inicial como movimiento.','success');
    }catch(cause){
      const decision=RuntimePolicy.handlePersistenceFailure(cause,'el producto');
      if(decision.allowFallback){
        const local={id:uid('prd'),...productForm,stock:0,reserved:0,min:Number(productForm.min||0),costUsd:Number(productForm.costUsd||0),priceUsd:Number(productForm.priceUsd||0),source:'local'};
        Store.update((draft)=>{draft.inventory.unshift(local);});
        setInventory((current)=>[local,...current]);
        notify(`Producto maestro guardado localmente sin saldo; sincronización pendiente. ${decision.message}`,'warning');
      }else notify(decision.message,'error');
    }finally{setSaving('');}
  }

  async function submitMovement(event){
    event.preventDefault();
    if(!movementForm.productId)return notify('Selecciona un producto.','warning');
    if(!String(movementForm.quantity||'').trim())return notify('Indica la cantidad.','warning');
    setSaving('movement');
    try{
      await InventoryService.createMovement(movementForm);
      setMovementForm((current)=>({...current,quantity:'',unitCost:'',note:''}));
      notify('Movimiento aplicado y auditado.','success');
      await refresh({silent:true});
    }catch(cause){notify(`No se aplicó el movimiento: ${cause?.message||'Error'}`,'error');}
    finally{setSaving('');}
  }

  async function submitAdjustment(event){
    event.preventDefault();
    if(!adjustmentForm.productId)return notify('Selecciona un producto.','warning');
    if(!String(adjustmentForm.targetStock||'').trim()||!adjustmentForm.reasonCode.trim()||!adjustmentForm.note.trim())return notify('Completa stock físico, código de motivo y evidencia.','warning');
    setSaving('adjustment');
    try{
      await InventoryService.adjust(adjustmentForm);
      setAdjustmentForm((current)=>({...current,targetStock:'',note:''}));
      notify('Ajuste físico registrado con motivo.','success');
      await refresh({silent:true});
    }catch(cause){notify(`No se aplicó el ajuste: ${cause?.message||'Error'}`,'error');}
    finally{setSaving('');}
  }

  async function confirmReverse(){
    if(!reverseTarget)return;
    const reason=reverseReason.trim();
    if(!reason)return notify('El motivo del reverso es obligatorio.','warning');
    setSaving('reverse');
    try{
      await InventoryService.reverse(reverseTarget.id,reason);
      setReverseTarget(null);
      setReverseReason('Corrección de movimiento registrado por error');
      notify('Reverso creado; el movimiento original se conserva.','success');
      await refresh({silent:true});
    }catch(cause){notify(`No se creó el reverso: ${cause?.message||'Error'}`,'error');}
    finally{setSaving('');}
  }

  function addToQuote(product){
    Store.update((draft)=>{
      const current=draft.inventory.find((item)=>item.id===product.id);
      if(current)draft.quote.items.push({id:uid('item'),productId:current.id,name:current.name,qty:1,priceUsd:current.priceUsd});
    });
    notify('Producto cargado al presupuesto.','success');
    navigate('cotizacion');
  }

  const inventoryColumns=[
    {key:'sku',label:'SKU'},
    {key:'name',label:'Producto'},
    {key:'category',label:'Categoría'},
    {key:'stock',label:'Stock',render:(item)=><Stack direction="row" gap={.6} alignItems="center"><Typography variant="body2">{item.stock}</Typography><CgStatusChip size="small" label={Number(item.stock||0)<=Number(item.min||0)?'Bajo':'OK'} tone={Number(item.stock||0)<=Number(item.min||0)?'warning':'success'}/></Stack>},
    {key:'reserved',label:'Reservado'},
    {key:'available',label:'Disponible',render:(item)=>Number(item.stock||0)-Number(item.reserved||0)},
    {key:'costUsd',label:'Costo',align:'right',render:(item)=><CgMoney value={item.costUsd} currency="USD"/>},
    {key:'priceUsd',label:'Precio',align:'right',render:(item)=><CgMoney value={item.priceUsd} currency="USD"/>},
    {key:'margin',label:'Margen',align:'right',render:(item)=><CgMoney value={Number(item.priceUsd||0)-Number(item.costUsd||0)} currency="USD"/>},
    {key:'actions',label:'Acciones',render:(item)=><CgButton size="small" variant="outlined" onClick={()=>addToQuote(item)}>Agregar al presupuesto</CgButton>}
  ];

  const movementColumns=[
    {key:'at',label:'Fecha',render:(item)=>movementDate(item.createdAt||item.at)},
    {key:'productId',label:'Producto',render:(item)=>inventory.find((product)=>product.id===item.productId)?.sku||item.productId},
    {key:'type',label:'Tipo',render:(item)=><CgStatusChip size="small" label={item.type} tone={movementTone(item.type)}/>},
    {key:'quantity',label:'Cantidad',align:'right',render:(item)=>item.quantityExact??item.qty??item.quantity},
    {key:'reason',label:'Motivo',render:(item)=>item.reason||item.note||item.reasonCode||'—'},
    {key:'actions',label:'Acciones',render:(item)=>item.reversedById?<CgStatusChip size="small" label="Reversado"/>:<CgButton size="small" variant="outlined" onClick={()=>setReverseTarget(item)}>Reversar</CgButton>}
  ];

  return <Stack className="cg-inventory-workspace" gap={1.5}>
    <CgPageHeader eyebrow="Inventario" title="Inventario y productos" description="Stock, reservas, costos y movimientos auditables. Los saldos se derivan de movimientos; la UI no reescribe Kardex." actions={<CgButton variant="outlined" onClick={()=>void refresh()} disabled={syncing}>{syncing?'Sincronizando…':'Sincronizar'}</CgButton>}/>
    {error?<CgState severity="warning" title="Sincronización incompleta">{error}</CgState>:null}
    {syncing?<CgState severity="info" title="Actualizando">Consultando productos y movimientos auditables.</CgState>:null}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:1}}>
      <Paper variant="outlined" sx={{p:1.4}}><Typography variant="caption" color="text.secondary">Costo de existencias</Typography><Typography variant="h6"><CgMoney value={summary.valueUsd} currency="USD"/></Typography></Paper>
      <Paper variant="outlined" sx={{p:1.4}}><Typography variant="caption" color="text.secondary">Venta potencial</Typography><Typography variant="h6"><CgMoney value={summary.retailUsd} currency="USD"/></Typography></Paper>
      <Paper variant="outlined" sx={{p:1.4}}><Typography variant="caption" color="text.secondary">Margen bruto</Typography><Typography variant="h6"><CgMoney value={summary.marginUsd} currency="USD"/></Typography></Paper>
      <Paper variant="outlined" sx={{p:1.4}}><Typography variant="caption" color="text.secondary">Alertas de stock</Typography><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">{summary.lowStock}</Typography><CgStatusChip label={summary.lowStock?'Revisar':'OK'} tone={summary.lowStock?'warning':'success'}/></Stack></Paper>
    </Box>

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'repeat(3,minmax(0,1fr))'},gap:1.25}}>
      <FormCard title="Producto maestro" description="SKU, descripción, costos y mínimos. Stock y reservas permanecen de solo lectura.">
        <Box component="form" onSubmit={submitProduct}><Stack gap={1}>
          <CgTextField size="small" label="SKU" required value={productForm.sku} onChange={(e)=>setProductForm({...productForm,sku:e.target.value})}/>
          <CgTextField size="small" label="Producto" required value={productForm.name} onChange={(e)=>setProductForm({...productForm,name:e.target.value})}/>
          <CgTextField size="small" label="Categoría" value={productForm.category} onChange={(e)=>setProductForm({...productForm,category:e.target.value})}/>
          <Box sx={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:1}}>
            <CgTextField size="small" label="Mínimo" type="number" inputProps={{min:0,step:.001}} value={productForm.min} onChange={(e)=>setProductForm({...productForm,min:e.target.value})}/>
            <CgTextField size="small" label="Costo USD" type="number" inputProps={{min:0,step:.01}} value={productForm.costUsd} onChange={(e)=>setProductForm({...productForm,costUsd:e.target.value})}/>
            <CgTextField size="small" label="Precio USD" type="number" inputProps={{min:0,step:.01}} value={productForm.priceUsd} onChange={(e)=>setProductForm({...productForm,priceUsd:e.target.value})}/>
          </Box>
          <CgButton type="submit" disabled={saving==='product'}>{saving==='product'?'Guardando…':'Registrar producto'}</CgButton>
        </Stack></Box>
      </FormCard>

      <FormCard title="Registrar movimiento" description="Entrada, salida, reserva, liberación o saldo de apertura. El servidor valida disponibilidad e idempotencia.">
        <Box component="form" onSubmit={submitMovement}><Stack gap={1}>
          <CgSelect label="Producto" value={movementForm.productId} onChange={(e)=>setMovementForm({...movementForm,productId:e.target.value})} options={productOptions}/>
          <CgSelect label="Tipo" value={movementForm.type} onChange={(e)=>setMovementForm({...movementForm,type:e.target.value})} options={[['in','Entrada'],['out','Salida'],['reservation','Reserva'],['release','Liberación']].map(([value,label])=>({value,label}))}/>
          <Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1}}>
            <CgTextField size="small" label="Cantidad" type="number" inputProps={{min:.001,step:.001}} required value={movementForm.quantity} onChange={(e)=>setMovementForm({...movementForm,quantity:e.target.value})}/>
            <CgTextField size="small" label="Costo unitario" type="number" inputProps={{min:0,step:.01}} value={movementForm.unitCost} onChange={(e)=>setMovementForm({...movementForm,unitCost:e.target.value})}/>
          </Box>
          <CgSelect label="Origen" value={movementForm.source} onChange={(e)=>setMovementForm({...movementForm,source:e.target.value})} options={[{value:'manual',label:'Movimiento manual'},{value:'opening',label:'Saldo de apertura'}]}/>
          <CgTextField size="small" label="Código de motivo" value={movementForm.reasonCode} onChange={(e)=>setMovementForm({...movementForm,reasonCode:e.target.value})}/>
          <CgTextField size="small" label="Nota" value={movementForm.note} onChange={(e)=>setMovementForm({...movementForm,note:e.target.value})}/>
          <CgButton type="submit" disabled={saving==='movement'||!inventory.length}>{saving==='movement'?'Aplicando…':'Registrar movimiento'}</CgButton>
        </Stack></Box>
      </FormCard>

      <FormCard title="Ajuste físico autorizado" description="Requiere permiso, código de motivo y evidencia; nunca reescribe el Kardex.">
        <Box component="form" onSubmit={submitAdjustment}><Stack gap={1}>
          <CgSelect label="Producto" value={adjustmentForm.productId} onChange={(e)=>setAdjustmentForm({...adjustmentForm,productId:e.target.value})} options={productOptions}/>
          <CgTextField size="small" label="Stock físico contado" type="number" inputProps={{min:0,step:.001}} required value={adjustmentForm.targetStock} onChange={(e)=>setAdjustmentForm({...adjustmentForm,targetStock:e.target.value})}/>
          <CgTextField size="small" label="Código de motivo" required value={adjustmentForm.reasonCode} onChange={(e)=>setAdjustmentForm({...adjustmentForm,reasonCode:e.target.value})}/>
          <CgTextField size="small" multiline minRows={2} label="Motivo / evidencia" required value={adjustmentForm.note} onChange={(e)=>setAdjustmentForm({...adjustmentForm,note:e.target.value})}/>
          <CgButton type="submit" variant="outlined" disabled={saving==='adjustment'||!inventory.length}>{saving==='adjustment'?'Aplicando…':'Ajustar inventario'}</CgButton>
        </Stack></Box>
      </FormCard>
    </Box>

    <Box>
      <Typography variant="h6" sx={{mb:.25}}>Existencias</Typography>
      <Typography variant="caption" color="text.secondary">Saldos materializados derivados de movimientos auditables.</Typography>
      <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}>{inventory.length?<CgDataTable columns={inventoryColumns} rows={inventory} empty="Sin productos"/>:<CgEmptyState title="Sin productos" description="Registra el producto maestro y luego su saldo inicial como movimiento."/ >}</Box>
    </Box>

    <Box>
      <Typography variant="h6" sx={{mb:.25}}>Historial reciente</Typography>
      <Typography variant="caption" color="text.secondary">Los movimientos no se eliminan; los errores se corrigen mediante reversos explícitos.</Typography>
      <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}>{movements.length?<CgDataTable columns={movementColumns} rows={movements} empty="Sin movimientos"/>:<CgEmptyState title="Sin movimientos" description="Los movimientos auditables aparecerán aquí."/ >}</Box>
    </Box>

    <CgDialog open={Boolean(reverseTarget)} title="Reversar movimiento" onClose={()=>setReverseTarget(null)} confirmLabel={saving==='reverse'?'Reversando…':'Crear reverso'} destructive onConfirm={()=>void confirmReverse()}>
      <Stack gap={1.2} sx={{pt:1}}>
        <CgState severity="warning" title="Operación auditable">El movimiento original se conserva y se crea su reverso explícito.</CgState>
        <CgTextField autoFocus fullWidth multiline minRows={3} label="Motivo del reverso" value={reverseReason} onChange={(e)=>setReverseReason(e.target.value)}/>
      </Stack>
    </CgDialog>
  </Stack>;
}

let activeRoot=null;
export const InventoryPage={
  render(){return '<section class="cg-page-stack"><div id="inventoryReactRoot"></div></section>';},
  mount(state,context){
    const host=document.getElementById('inventoryReactRoot');
    if(!host)return;
    try{activeRoot?.unmount();}catch{}
    activeRoot=createRoot(host);
    activeRoot.render(<CgProvider state={state}><InventoryWorkspace state={state} context={context}/></CgProvider>);
  }
};
