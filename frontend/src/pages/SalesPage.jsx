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
import { holdPosCart, resumePosCart, discardHeldPosCart } from '../services/posHeldCartPolicy.mjs';
import { addPosFavorite, removePosFavorite, matchesPosFavorite } from '../services/posFavoritePolicy.mjs';
import { verifyPosDraftCart } from '../services/posDraftVerification.mjs';
import { decidePosScannerKey } from '../services/posScannerKeyboard.mjs';

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
  const posScannerInputRef=useRef(null);
  const posScannerRefocusPendingRef=useRef(false);
  const [posLoading,setPosLoading]=useState(false);
  const [posDraftError,setPosDraftError]=useState('');
  const [posChecking,setPosChecking]=useState(false);
  const [posVerification,setPosVerification]=useState(null);
  const [posStockPreview,setPosStockPreview]=useState(null);
  const [posStockChecking,setPosStockChecking]=useState(false);
  const [posQuoteChecking,setPosQuoteChecking]=useState(false);
  const [posQuotePreview,setPosQuotePreview]=useState(null);
  const posQuoteBusyRef=useRef(false);
  const posStockBusyRef=useRef(false);
  const posVerifyBusyRef=useRef(false);
  const posCartRevisionRef=useRef(0);
  const [posCart,setPosCart]=useState([]);
  const [posNames,setPosNames]=useState({});
  const [posQuantityInputs,setPosQuantityInputs]=useState({});
  const [posHeld,setPosHeld]=useState([]);
  const [posFavorites,setPosFavorites]=useState([]);
  const posFavoritesRef=useRef([]);
  const posHeldRef=useRef([]);
  const posCartRef=useRef([]);
  const posBusyRef=useRef(false);
  const posTenantId=BackendApi.tenantId;
  const posTenantRef=useRef(posTenantId);
  const visiblePosCart=posTenantRef.current===posTenantId?posCart:[];
  const visiblePosVerification=posTenantRef.current===posTenantId?posVerification:null;
  const visiblePosStockPreview=posTenantRef.current===posTenantId?posStockPreview:null;
  const visiblePosQuotePreview=posTenantRef.current===posTenantId?posQuotePreview:null;
  const visiblePosHeld=posTenantRef.current===posTenantId?posHeld:[];
  const visiblePosFavorites=posTenantRef.current===posTenantId?posFavorites:[];
  React.useEffect(()=>{
    posTenantRef.current=posTenantId;
    posCartRef.current=[];
    posCartRevisionRef.current+=1;
    setPosVerification(null);
    setPosStockPreview(null);
    setPosQuotePreview(null);
    setPosCart([]);
    setPosNames({});
    setPosQuantityInputs({});
    posHeldRef.current=[];
    setPosHeld([]);
    posFavoritesRef.current=[];
    setPosFavorites([]);
    setPosCode('');
    posScannerRefocusPendingRef.current=false;
    setPosDraftError('');
  },[posTenantId]);
  React.useEffect(()=>{
    if(posLoading || !posScannerRefocusPendingRef.current)return;
    posScannerRefocusPendingRef.current=false;
    if(posTenantRef.current!==BackendApi.tenantId || typeof document==='undefined')return;
    const scanner=posScannerInputRef.current;
    if(scanner && (document.activeElement===document.body || document.activeElement===scanner)){
      scanner.focus();
    }
  },[posLoading]);
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


  function invalidatePosVerification(){
    posCartRevisionRef.current+=1;
    setPosVerification(null);
    setPosStockPreview(null);
    setPosQuotePreview(null);
  }

  // Read-only catalog estimate, never an invoice, checkout or fiscal approval.
  async function checkPosCatalogQuote(){
    if(posQuoteBusyRef.current || posStockBusyRef.current || posBusyRef.current
      || posVerifyBusyRef.current || posLoading || posChecking
      || posTenantRef.current!==BackendApi.tenantId)return;
    const snapshot=posCartRef.current;
    if(snapshot.length===0){
      setPosDraftError('Agrega productos antes de consultar los importes de catálogo.');
      return;
    }
    if(snapshot.some((line)=>(posQuantityInputs[line.productId]??line.quantity)!==line.quantity)){
      setPosDraftError('Aplica las cantidades pendientes antes de consultar los importes.');
      return;
    }
    const expectedSkus=snapshot.map((line)=>posNames[line.productId]?.sku);
    if(expectedSkus.some((sku)=>!sku || normalizePosLookupCode(sku)!==sku)){
      setPosDraftError('El carrito no tiene un SKU confirmado para todos los productos. Vuelve a escanearlos.');
      return;
    }
    const tenantAtStart=BackendApi.tenantId;
    const revision=posCartRevisionRef.current;
    const isCurrent=()=>tenantAtStart===BackendApi.tenantId
      && posTenantRef.current===tenantAtStart
      && posCartRevisionRef.current===revision
      && posCartRef.current===snapshot;
    posQuoteBusyRef.current=true;
    setPosQuoteChecking(true);
    setPosQuotePreview(null);
    setPosDraftError('');
    try{
      const result=await BackendApi.post('/sales/pos/catalog-quote-preview',{
        lines:snapshot.map((line,index)=>({productId:line.productId,quantity:line.quantity,expectedSku:expectedSkus[index]}))
      });
      if(!isCurrent())return;
      const moneyPattern=/^(?:0|[1-9]\d*)\.\d{2}$/;
      if(!result || result.readOnly!==true || result.authoritativeForCheckout!==false
        || result.currency!==null || result.fiscalLocalizationApplied!==false
        || result.priceListsApplied!==false || result.pricingBasis!=='current_product_catalog'
        || !moneyPattern.test(result.subtotal) || !moneyPattern.test(result.estimatedTax)
        || !moneyPattern.test(result.estimatedTotal)
        || !Array.isArray(result.lines) || result.lines.length!==snapshot.length
        || result.lines.some((line,index)=>line.productId!==snapshot[index].productId
          || line.quantity!==snapshot[index].quantity
          || typeof line.name!=='string' || !line.name.trim()
          || line.sku!==expectedSkus[index]
          || !moneyPattern.test(line.unitAmount) || !moneyPattern.test(line.lineSubtotal))){
        throw new Error('POS_CATALOG_QUOTE_INVALID_RESPONSE');
      }
      setPosQuotePreview(result);
    }catch{
      if(isCurrent())setPosDraftError('No se pudo obtener una estimación válida del catálogo. El carrito no se modificó.');
    }finally{
      posQuoteBusyRef.current=false;
      setPosQuoteChecking(false);
    }
  }

  async function checkPosStockPreview(){
    if(posStockBusyRef.current || posBusyRef.current || posVerifyBusyRef.current
        || posLoading || posChecking || posTenantRef.current!==BackendApi.tenantId)return;
    const snapshot=posCartRef.current;
    if(!snapshot.length){
      setPosDraftError('Agrega productos antes de consultar existencias.');
      return;
    }
    if(snapshot.some((line)=>(posQuantityInputs[line.productId]??line.quantity)!==line.quantity)){
      setPosDraftError('Aplica las cantidades pendientes antes de consultar existencias.');
      return;
    }
    const tenantAtStart=BackendApi.tenantId;
    const revision=posCartRevisionRef.current;
    const isCurrent=()=>tenantAtStart===BackendApi.tenantId
      && posTenantRef.current===tenantAtStart
      && posCartRevisionRef.current===revision
      && posCartRef.current===snapshot;
    posStockBusyRef.current=true;
    setPosStockChecking(true);
    setPosStockPreview(null);
    setPosDraftError('');
    try{
      const result=await BackendApi.post('/sales/pos/stock-preview',{
        lines:snapshot.map((line)=>({productId:line.productId,quantity:line.quantity}))
      });
      if(!isCurrent())return;
      if(!result || result.readOnly!==true || typeof result.ready!=='boolean'
        || !Array.isArray(result.lines) || result.lines.length!==snapshot.length
        || result.lines.some((line,index)=>line.productId!==snapshot[index].productId
          || line.requested!==snapshot[index].quantity
          || !['available','shortage'].includes(line.status)
          || !/^(?:0|[1-9]\d*)\.\d{3}$/.test(line.available)
          || !/^(?:0|[1-9]\d*)\.\d{3}$/.test(line.shortfall))){
        throw new Error('POS_STOCK_INVALID_PREVIEW');
      }
      setPosStockPreview(result);
    }catch{
      if(isCurrent())setPosDraftError('No se pudieron consultar las existencias del servidor. El carrito sigue sin modificar.');
    }finally{
      posStockBusyRef.current=false;
      setPosStockChecking(false);
    }
  }

  async function verifyCurrentPosDraft(){
    if(posVerifyBusyRef.current || posBusyRef.current || posLoading
        || posTenantRef.current!==BackendApi.tenantId)return;
    if(posCartRef.current.length===0){
      setPosDraftError('Agrega productos antes de comprobar el borrador.');
      return;
    }
    if(posCartRef.current.some((line)=>(posQuantityInputs[line.productId]??line.quantity)!==line.quantity)){
      setPosDraftError('Aplica las cantidades pendientes antes de comprobar el carrito.');
      return;
    }
    const tenantAtStart=BackendApi.tenantId;
    const lines=posCartRef.current;
    const revision=posCartRevisionRef.current;
    const isCurrent=()=>tenantAtStart===BackendApi.tenantId
      && posTenantRef.current===tenantAtStart
      && posCartRevisionRef.current===revision
      && posCartRef.current===lines;
    posVerifyBusyRef.current=true;
    setPosChecking(true);
    setPosVerification(null);
    setPosDraftError('');
    try{
      const outcome=await verifyPosDraftCart({
        lines,
        labels:posNames,
        resolve:(sku)=>BackendApi.get(`/sales/pos/product-lookup?code=${encodeURIComponent(sku)}`),
        isCurrent
      });
      if(!isCurrent())return;
      setPosVerification(outcome);
    }catch{
      if(isCurrent())setPosVerification({kind:'unavailable',count:0});
    }finally{
      posVerifyBusyRef.current=false;
      setPosChecking(false);
    }
  }

  // Draft only: every lookup is authenticated and tenant-scoped in sales API.
  // The client never authorizes a sale, calculates IVA or posts stock/payments.
  async function addPosDraftProduct(event){
    event.preventDefault();
    // Scanner Enter submits the existing form; no synthetic second submission.
    await lookupAndAddPosProduct(posCode,null,true);
  }

  function handlePosScannerKeyboard(event){
    const target=event.target;
    const action=decidePosScannerKey({
      key:event.key,ctrlKey:event.ctrlKey,altKey:event.altKey,metaKey:event.metaKey,
      repeat:event.repeat,isComposing:event.isComposing,
      busy:posBusyRef.current||posVerifyBusyRef.current||posLoading||posChecking||posQuoteBusyRef.current||posStockBusyRef.current,
      targetIsScanner:target===posScannerInputRef.current,
      targetIsEditable:Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"],[role="combobox"]')),
      modalOpen:Boolean(target?.closest?.('[role="dialog"],[aria-modal="true"]'))
    });
    if(action==='ignore')return;
    event.preventDefault();
    event.stopPropagation();
    if(action==='focus')posScannerInputRef.current?.focus?.();
    else if(action==='clear')setPosCode('');
  }

  async function addPosFavoriteToCart(favorite){
    if(!posFavoritesRef.current.some((item)=>item.id===favorite.id && item.sku===favorite.sku))return;
    await lookupAndAddPosProduct(favorite.sku,favorite);
  }

  async function lookupAndAddPosProduct(value,favorite=null,refocusAfterSuccess=false){
    if(posBusyRef.current || posVerifyBusyRef.current)return;
    posBusyRef.current=true;
    setPosLoading(true);
    setPosDraftError('');
    const tenantAtStart=BackendApi.tenantId;
    try{
      const code=normalizePosLookupCode(value);
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
      // A shortcut is a label only. Verify the server still resolves its SKU
      // to the exact same product before changing the current draft.
      if(favorite && (!posFavoritesRef.current.some((item)=>item.id===favorite.id && item.sku===favorite.sku)
          || !matchesPosFavorite(favorite,decision.product))){
        setPosDraftError('Favorito desactualizado: verifica el producto antes de utilizarlo.');
        return;
      }
      const next=addPosCartItem(posCartRef.current,decision.product.id);
      posCartRef.current=next;
      invalidatePosVerification();
      setPosCart(next);
      setPosQuantityInputs((current)=>({...current,[decision.product.id]:next.find((line)=>line.productId===decision.product.id).quantity}));
      setPosNames((current)=>({...current,[decision.product.id]:{
        sku:decision.product.sku,name:decision.product.name
      }}));
      if(!favorite){
        setPosCode('');
        // Focus only after React re-enables the scanner, not while disabled.
        // A later effect also checks that the operator has not moved to another field.
        if(refocusAfterSuccess && tenantAtStart===BackendApi.tenantId
          && posTenantRef.current===tenantAtStart){
          posScannerRefocusPendingRef.current=true;
        }
      }
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
    invalidatePosVerification();
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
    if(posTenantRef.current!==BackendApi.tenantId || posVerifyBusyRef.current)return;
    commitPosDraftCart(removePosCartItem(posCartRef.current,productId),productId);
  }

  function stepPosDraftQuantity(productId,direction){
    if(posTenantRef.current!==BackendApi.tenantId || posVerifyBusyRef.current)return;
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
    if(posTenantRef.current!==BackendApi.tenantId || posVerifyBusyRef.current)return;
    try{
      const existing=posCartRef.current.find((line)=>line.productId===productId);
      if(!existing)return;
      const proposed=posQuantityInputs[productId]??existing.quantity;
      commitPosDraftCart(setPosCartQuantity(posCartRef.current,productId,proposed),productId);
    }catch{
      setPosDraftError('Cantidad inválida: utiliza un valor mayor que cero y hasta tres decimales.');
    }
  }

  function togglePosFavoriteFromCart(line){
    if(posTenantRef.current!==BackendApi.tenantId || posBusyRef.current || posLoading)return;
    try{
      const existing=posFavoritesRef.current.some((item)=>item.id===line.productId);
      const label=posNames[line.productId];
      const next=existing
        ?removePosFavorite(posFavoritesRef.current,line.productId)
        :addPosFavorite(posFavoritesRef.current,{id:line.productId,sku:label?.sku,name:label?.name});
      posFavoritesRef.current=next;
      setPosFavorites(next);
      setPosDraftError('');
    }catch{
      setPosDraftError('No se pudo cambiar el favorito. Máximo doce productos con SKU válido.');
    }
  }

  function deletePosFavorite(productId){
    if(posTenantRef.current!==BackendApi.tenantId || posBusyRef.current || posLoading)return;
    try{
      const next=removePosFavorite(posFavoritesRef.current,productId);
      posFavoritesRef.current=next;
      setPosFavorites(next);
      setPosDraftError('');
    }catch{
      setPosDraftError('No se pudo quitar el favorito. Actualiza la pantalla.');
    }
  }

  // Hold/resume exists only within the mounted, authenticated Sales workspace.
  // It never writes to storage, server, inventory, payments or accounting.
  function holdCurrentPosDraft(){
    if(posTenantRef.current!==BackendApi.tenantId || posBusyRef.current || posVerifyBusyRef.current || posLoading)return;
    if(posCartRef.current.some((line)=>(posQuantityInputs[line.productId]??line.quantity)!==line.quantity)){
      setPosDraftError('Aplica las cantidades pendientes antes de poner el carrito en espera.');
      return;
    }
    try{
      const id=globalThis.crypto?.randomUUID?.();
      const next=holdPosCart(posHeldRef.current,posCartRef.current,posNames,id);
      posHeldRef.current=next;
      setPosHeld(next);
      posCartRef.current=[];
      invalidatePosVerification();
      setPosCart([]);
      setPosNames({});
      setPosQuantityInputs({});
      setPosDraftError('');
      notify('Carrito guardado en espera solo durante esta sesión.','success');
    }catch{
      setPosDraftError('No se pudo poner en espera. Límite: cinco carritos válidos; no se modificó el borrador.');
    }
  }

  function resumeHeldPosDraft(id){
    if(posTenantRef.current!==BackendApi.tenantId || posBusyRef.current || posVerifyBusyRef.current || posLoading)return;
    try{
      const result=resumePosCart(posHeldRef.current,id,posCartRef.current);
      posHeldRef.current=result.held;
      setPosHeld(result.held);
      posCartRef.current=result.cart;
      invalidatePosVerification();
      setPosCart(result.cart);
      setPosNames({...result.names});
      setPosQuantityInputs(Object.fromEntries(result.cart.map((line)=>[line.productId,line.quantity])));
      setPosDraftError('');
      notify('Carrito recuperado sin procesar ninguna venta.','success');
    }catch{
      setPosDraftError('Vacía o pon en espera el carrito activo antes de recuperar otro.');
    }
  }

  function discardHeldPosDraft(id){
    if(posTenantRef.current!==BackendApi.tenantId || posBusyRef.current || posLoading)return;
    if(typeof window.confirm!=='function' || !window.confirm('¿Descartar este borrador en espera? No existe una copia guardada.'))return;
    try{
      const next=discardHeldPosCart(posHeldRef.current,id);
      posHeldRef.current=next;
      setPosHeld(next);
      setPosDraftError('');
      notify('Borrador en espera descartado.','warning');
    }catch{
      setPosDraftError('No se pudo descartar el borrador. Actualiza la pantalla.');
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

    <Paper component="section" variant="outlined" aria-label="Carrito POS de borrador" onKeyDown={handlePosScannerKeyboard} sx={{p:1.5}}>
      <Typography variant="h6">Venta rápida · carrito en preparación</Typography>
      <Typography variant="caption" color="text.secondary">
        Consulta productos del servidor por SKU, código de barras o alias. Este carrito no crea facturas, no reserva inventario y no procesa cobros.
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:0.5}}>
        Lector de códigos: Enter agrega un producto; / enfoca el lector dentro de esta sección; Escape limpia el campo.
      </Typography>
      <Box component="form" onSubmit={addPosDraftProduct} sx={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:1,mt:1.25}}>
        <CgTextField
          size="small"
          label="SKU o código de barras"
          inputRef={posScannerInputRef}
          placeholder="Ej. 000123456789"
          value={posCode}
          onChange={(event)=>setPosCode(event.target.value)}
          disabled={posLoading||posChecking}
          sx={{flex:'1 1 220px'}}
        />
        <CgButton type="submit" disabled={posLoading||posChecking||!posCode.trim()} sx={{minHeight:44}}>
          {posLoading?'Consultando…':'Agregar al borrador'}
        </CgButton>
        <CgButton type="button" variant="outlined" disabled={posLoading||posChecking}
          onClick={()=>posScannerInputRef.current?.focus?.()} sx={{minHeight:44,mt:0.5}}>
          Enfocar lector
        </CgButton>
      </Box>
      <Box component="section" aria-label="Favoritos POS de la sesión" sx={{mt:1.25}}>
        <Typography variant="body2" sx={{fontWeight:600}}>
          Favoritos rápidos ({visiblePosFavorites.length}/12)
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Se crean desde el carrito y se vuelven a comprobar en el servidor antes de agregar. No se guardan al salir de Ventas.
        </Typography>
        {visiblePosFavorites.length?
          <Box sx={{display:'flex',flexWrap:'wrap',gap:1,mt:1}}>
            {visiblePosFavorites.map((favorite)=><Box key={favorite.id} sx={{display:'flex',alignItems:'center',gap:.5}}>
              <CgButton type="button" size="small" variant="outlined" disabled={posLoading}
                aria-label={`Consultar y agregar favorito ${favorite.name}`}
                onClick={()=>void addPosFavoriteToCart(favorite)} sx={{minHeight:44}}>
                {favorite.name} · {favorite.sku}
              </CgButton>
              <CgButton type="button" size="small" variant="outlined" disabled={posLoading}
                aria-label={`Quitar favorito ${favorite.name}`}
                onClick={()=>deletePosFavorite(favorite.id)} sx={{minHeight:44}}>×</CgButton>
            </Box>)}
          </Box>:null}
      </Box>
      {posDraftError?<CgState severity="warning" title="Carrito no actualizado">{posDraftError}</CgState>:null}
      <Typography variant="caption" color="text.secondary" role="status" aria-live="polite" sx={{display:'block',mt:1}}>
        {visiblePosCart.length} productos distintos · Sin total fiscal ni cobro confirmado
      </Typography>
      <Box component="section" aria-label="Comprobación del carrito contra el servidor" sx={{mt:1,display:'grid',gap:1}}>
        <CgButton type="button" variant="outlined" onClick={()=>void verifyCurrentPosDraft()}
          disabled={posChecking||posLoading||visiblePosCart.length===0} sx={{minHeight:44,justifySelf:'start'}}>
          {posChecking?'Comprobando productos…':'Comprobar identidad de productos'}
        </CgButton>
        {visiblePosVerification?
          <CgState severity={visiblePosVerification.kind==='verified'?'info':'warning'}
            title={visiblePosVerification.kind==='verified'?'Identidades consultadas en el servidor':'El carrito necesita revisión'}>
            {visiblePosVerification.kind==='verified'
              ?`${visiblePosVerification.count} productos coinciden por SKU e identificador. No confirma precio, existencias, impuestos ni disponibilidad para cobrar.`
              :visiblePosVerification.kind==='changed'
                ?'Algún producto cambió o ya no corresponde al mismo SKU. Verifica cada línea antes de continuar.'
                :visiblePosVerification.kind==='unavailable'
                  ?'No se pudo completar la comprobación. Revisa permisos y conexión; el borrador no ha cambiado.'
                  :'No se pudo comprobar este borrador. Revisa cantidades y productos antes de repetir.'}
          </CgState>:null}
      </Box>
      <Box component="section" aria-label="Importes orientativos del catálogo" sx={{mt:1,display:'grid',gap:1}}>
        <CgButton type="button" variant="outlined" onClick={()=>void checkPosCatalogQuote()}
          disabled={posQuoteChecking||posStockChecking||posChecking||posLoading||visiblePosCart.length===0}
          sx={{minHeight:44,justifySelf:'start'}}>
          {posQuoteChecking?'Consultando precios…':'Consultar importe del catálogo'}
        </CgButton>
        {visiblePosQuotePreview?
          <>
            <CgState severity="info" title="Estimación de catálogo, sin moneda fiscal confirmada">
              Los precios y tasas provienen del catálogo actual. No aplica listas de precios,
              promociones, reglas fiscales locales, IGTF, retenciones ni tipo de cambio.
              Esta estimación no es una factura, no confirma moneda ni autoriza cobros.
            </CgState>
            <Box sx={{maxWidth:'100%',overflowX:'auto'}}>
              <CgDataTable rows={visiblePosQuotePreview.lines} columns={[
                {key:'sku',label:'SKU'},
                {key:'quantity',label:'Cantidad'},
                {key:'unitAmount',label:'Precio catálogo'},
                {key:'taxRate',label:'Tasa catálogo (%)'},
                {key:'lineSubtotal',label:'Base estimada'}
              ]}/>
            </Box>
            <Typography variant="body2" sx={{fontVariantNumeric:'tabular-nums'}}>
              Base catálogo: {visiblePosQuotePreview.subtotal} · Impuesto estimado: {visiblePosQuotePreview.estimatedTax}
              {' · '}Total estimado: {visiblePosQuotePreview.estimatedTotal}
            </Typography>
          </>:null}
      </Box>
      <Box component="section" aria-label="Disponibilidad orientativa de stock" sx={{mt:1,display:'grid',gap:1}}>
        <CgButton type="button" variant="outlined" onClick={()=>void checkPosStockPreview()}
          disabled={posStockChecking||posChecking||posLoading||visiblePosCart.length===0}
          sx={{minHeight:44,justifySelf:'start'}}>
          {posStockChecking?'Consultando existencias…':'Consultar stock disponible'}
        </CgButton>
        {visiblePosStockPreview?
          <>
            <CgState severity={visiblePosStockPreview.ready?'info':'warning'}
              title={visiblePosStockPreview.ready?'Stock orientativo suficiente':'Hay cantidades sin disponibilidad'}>
              Consulta momentánea del inventario global descontando reservas. No bloquea stock, no valida lotes/sedes y no autoriza el cobro.
            </CgState>
            <Box sx={{maxWidth:'100%',overflowX:'auto'}}>
              <CgDataTable rows={visiblePosStockPreview.lines.map((line)=>({
                ...line,sku:posNames[line.productId]?.sku||'—'
              }))} columns={[
                {key:'sku',label:'SKU'},
                {key:'requested',label:'Solicitado'},
                {key:'available',label:'Disponible'},
                {key:'shortfall',label:'Faltante'},
                {key:'status',label:'Resultado',render:(line)=>line.status==='available'?'Orientativamente disponible':'Faltante'}
              ]}/>
            </Box>
          </>:null}
      </Box>
      <Box sx={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:1,mt:1}}>
        <CgButton type="button" variant="outlined" onClick={holdCurrentPosDraft}
          disabled={posLoading||posChecking||visiblePosCart.length===0||visiblePosHeld.length>=5} sx={{minHeight:44}}>
          Poner carrito en espera
        </CgButton>
        <Typography variant="caption" color="text.secondary">
          {visiblePosHeld.length}/5 borradores en espera · Solo memoria: se pierden al salir de Ventas, recargar o cambiar empresa
        </Typography>
      </Box>
      {visiblePosHeld.length>0?
        <Box component="section" aria-label="Carritos POS en espera" sx={{mt:1,display:'grid',gap:1}}>
          {visiblePosHeld.map((held,index)=><Paper key={held.id} variant="outlined" sx={{p:1,display:'flex',flexWrap:'wrap',alignItems:'center',gap:1}}>
            <Typography variant="body2" sx={{flex:'1 1 180px'}}>Carrito {index+1} · {held.lines.length} productos</Typography>
            <CgButton type="button" size="small" variant="outlined" disabled={posLoading||posChecking||visiblePosCart.length>0}
              onClick={()=>resumeHeldPosDraft(held.id)} sx={{minHeight:44}}>Recuperar</CgButton>
            <CgButton type="button" size="small" variant="outlined" disabled={posLoading}
              onClick={()=>discardHeldPosDraft(held.id)} sx={{minHeight:44}}>Descartar</CgButton>
          </Paper>)}
        </Box>:null}
      {visiblePosCart.length?
        <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}>
          <CgDataTable rows={visiblePosCart.map((line)=>({...line,...(posNames[line.productId]||{sku:'—',name:'Producto en revisión'})}))}
            columns={[
              {key:'sku',label:'SKU'},
              {key:'name',label:'Producto'},
              {key:'quantity',label:'Cantidad',render:(line)=><Box sx={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:1,minWidth:280}}>
                <CgButton type="button" size="small" variant="outlined" aria-label={`Disminuir una unidad de ${line.name}`}
                  disabled={posLoading||posChecking} onClick={()=>stepPosDraftQuantity(line.productId,-1)} sx={{minWidth:44,minHeight:44}}>−1</CgButton>
                <CgTextField size="small" label={`Cantidad de ${line.sku}`} inputProps={{inputMode:'decimal'}}
                  value={posQuantityInputs[line.productId]??line.quantity}
                  onChange={(event)=>{invalidatePosVerification();setPosQuantityInputs((current)=>({...current,[line.productId]:event.target.value}));}}
                  disabled={posLoading||posChecking} sx={{width:148}}/>
                <CgButton type="button" size="small" variant="outlined" aria-label={`Aumentar una unidad de ${line.name}`}
                  disabled={posLoading||posChecking} onClick={()=>stepPosDraftQuantity(line.productId,1)} sx={{minWidth:44,minHeight:44}}>+1</CgButton>
                <CgButton type="button" size="small" variant="outlined" disabled={posLoading||posChecking}
                  onClick={()=>applyPosDraftQuantity(line.productId)} sx={{minHeight:44}}>Aplicar</CgButton>
              </Box>},
              {key:'actions',label:'Acciones',render:(line)=><Box sx={{display:'flex',flexWrap:'wrap',gap:1}}>
                <CgButton type="button" size="small" variant="outlined" disabled={posLoading||posChecking}
                  onClick={()=>togglePosFavoriteFromCart(line)} sx={{minHeight:44}}>
                  {visiblePosFavorites.some((favorite)=>favorite.id===line.productId)?'Quitar favorito':'Favorito'}
                </CgButton>
                <CgButton type="button" size="small" variant="outlined"
                  disabled={posLoading||posChecking} onClick={()=>removePosDraftProduct(line.productId)} sx={{minHeight:44}}>Quitar</CgButton>
              </Box>}
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
