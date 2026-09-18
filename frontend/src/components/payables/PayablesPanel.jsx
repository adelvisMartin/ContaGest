import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgDialog, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField
} from '../ui/cg/CgPrimitives.jsx';
import { PayablesService } from '../../services/payablesService.js';

const rows=(value)=>Array.isArray(value)?value:[];
const stateTone=(value)=>value==='draft_created'?'success':value==='error'?'error':value==='review'?'warning':'primary';
const stateLabel=(value)=>({uploaded:'Recibido',parsing:'Procesando',review:'Revisión',draft_created:'Borrador creado',error:'Error'})[value]||value||'—';

function confidenceSummary(document){
  const extraction=document?.parserResult||{};
  const topScores=Object.entries(extraction).filter(([key,value])=>!['lines','warnings'].includes(key)&&value&&typeof value==='object'&&'confidence' in value).map(([,value])=>Number(value.confidence||0));
  const lineScores=(Array.isArray(extraction.lines)?extraction.lines:[]).flatMap((line)=>Object.values(line||{}).filter((value)=>value&&typeof value==='object'&&'confidence' in value).map((value)=>Number(value.confidence||0)));
  const scores=[...topScores,...lineScores];
  if(!scores.length)return{label:'Sin extracción',tone:'warning'};
  const low=scores.filter((score)=>score<.8).length;
  return low?{label:`${low} por confirmar`,tone:'warning'}:{label:'Confianza revisable',tone:'success'};
}

export function PayablesPanel({state,context,onPurchasesChanged}){
  const Store=context.Store,Toast=context.Toast,SupabaseSyncService=context.SupabaseSyncService;
  const [documents,setDocuments]=useState(rows(state.payableDocuments));
  const [loading,setLoading]=useState(!state.payableDocumentsLoaded);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [reviewTarget,setReviewTarget]=useState(null);
  const [reviewDetail,setReviewDetail]=useState(null);
  const [reviewForm,setReviewForm]=useState({invoiceNumber:'',currency:'VES'});
  const [rejectTarget,setRejectTarget]=useState(null);
  const [rejectReason,setRejectReason]=useState('');
  const fileRef=useRef(null);

  const notify=(message,tone='success')=>Toast?.show?.(message,tone);
  const setCanonical=(next)=>{
    setDocuments(next);
    Store.update((draft)=>{draft.payableDocuments=next;draft.payableDocumentsLoaded=true;});
  };

  async function refresh(){
    setLoading(true);setError('');
    try{setCanonical(rows(await PayablesService.list()));}
    catch(cause){const message=cause?.message||'No se cargaron documentos por pagar.';setError(message);notify(message,'error');}
    finally{setLoading(false);}
  }

  useEffect(()=>{if(!state.payableDocumentsLoaded)void refresh();},[]);

  async function upload(event){
    event.preventDefault();
    const file=fileRef.current?.files?.[0];
    if(!file)return notify('Selecciona una factura proveedor.','warning');
    if(file.size>8*1024*1024)return notify('El archivo supera el máximo de 8 MiB.','error');
    setBusy('upload');
    try{
      const result=await PayablesService.upload(file);
      const document=PayablesService.normalize(result);
      setCanonical([document,...documents.filter((item)=>item.id!==document.id)]);
      if(fileRef.current)fileRef.current.value='';
      notify(result.duplicate?'El documento ya existía: no se creó una segunda obligación.':'Documento recibido. Revisa campos y diferencias antes de crear el borrador.',result.duplicate?'warning':'success');
    }catch(cause){notify(`No se procesó el documento: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function openOriginal(item){
    setBusy(`open:${item.id}`);
    try{await PayablesService.openOriginal(item.id);}
    catch(cause){notify(`No se abrió el original: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function reprocess(item){
    setBusy(`reprocess:${item.id}`);
    try{
      const document=await PayablesService.reprocess(item.id,'2.0.0');
      setCanonical(documents.map((row)=>row.id===document.id?document:row));
      notify('Reprocesado con una nueva ejecución versionada; el resultado histórico original se conservó.','success');
    }catch(cause){notify(`No se reprocesó: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function prepareReview(item){
    setBusy(`detail:${item.id}`);
    try{
      const detail=await PayablesService.get(item.id);
      const extraction=detail.parserRuns?.find((run)=>run.status==='success')?.result||detail.parserResult||{};
      setReviewForm({invoiceNumber:extraction.invoiceNumber?.value||'',currency:extraction.currency?.value||'VES'});
      setReviewDetail(detail);setReviewTarget(item);
    }catch(cause){notify(`No se preparó la revisión: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function confirmReview(){
    if(!reviewTarget||!reviewDetail)return;
    const extraction=reviewDetail.parserRuns?.find((run)=>run.status==='success')?.result||reviewDetail.parserResult||{};
    const required=reviewDetail.requiredConfirmations||PayablesService.requiredConfirmations(reviewDetail);
    const corrections={};
    if(!extraction.invoiceNumber?.value){
      if(!reviewForm.invoiceNumber.trim())return notify('Confirma el número de factura.','warning');
      corrections.invoiceNumber=reviewForm.invoiceNumber.trim();
    }
    if(!extraction.currency?.value){
      if(!reviewForm.currency.trim())return notify('Confirma la moneda.','warning');
      corrections.currency=reviewForm.currency.trim().toUpperCase();
    }
    setBusy(`review:${reviewTarget.id}`);
    try{
      const result=await PayablesService.review(reviewTarget.id,{confirmedFields:required,corrections});
      setCanonical(documents.map((item)=>item.id===reviewTarget.id?result.document:item));
      await SupabaseSyncService.pullPurchases({Store,Toast,force:true,silent:true}).catch(()=>{});
      await onPurchasesChanged?.();
      setReviewTarget(null);setReviewDetail(null);
      notify('Revisión confirmada. Se creó únicamente un borrador de compra; no fue contabilizado.','success');
    }catch(cause){notify(`No se confirmó la revisión: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function reject(){
    if(!rejectTarget||!rejectReason.trim())return notify('El motivo del rechazo es obligatorio.','warning');
    setBusy(`reject:${rejectTarget.id}`);
    try{
      const document=await PayablesService.reject(rejectTarget.id,rejectReason.trim());
      setCanonical(documents.map((item)=>item.id===document.id?document:item));
      setRejectTarget(null);setRejectReason('');
      notify('Documento rechazado conservando su evidencia y auditoría.','success');
    }catch(cause){notify(`No se rechazó: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  const columns=useMemo(()=>[
    {key:'fileName',label:'Documento',render:(item)=><Box><Typography variant="body2" fontWeight={700}>{item.fileName}</Typography><Typography variant="caption" color="text.secondary">{item.mimeType} · {(Number(item.sizeBytes||0)/1024).toFixed(0)} KB</Typography></Box>},
    {key:'supplierReference',label:'Referencia',render:(item)=>item.supplierReference||'Pendiente'},
    {key:'state',label:'Estado',render:(item)=><CgStatusChip size="small" label={stateLabel(item.state)} tone={stateTone(item.state)}/>},
    {key:'match',label:'Match',render:(item)=><CgStatusChip size="small" label={item.matchMode==='3-way'?'3-way':item.matchMode==='2-way'?'2-way':'Sin match'} tone={item.matchMode==='3-way'?'success':item.matchMode==='2-way'?'primary':'default'}/>},
    {key:'confidence',label:'Revisión',render:(item)=>{const value=confidenceSummary(item);return <CgStatusChip size="small" label={value.label} tone={value.tone}/>;}},
    {key:'duplicate',label:'Dedupe',render:(item)=><CgStatusChip size="small" label={item.suspectedDuplicate?'Posible duplicado':'Único'} tone={item.suspectedDuplicate?'error':'success'}/>},
    {key:'actions',label:'Acciones',render:(item)=><Stack direction="row" gap={.6} flexWrap="wrap">
      <CgButton size="small" variant="outlined" disabled={busy===`open:${item.id}`} onClick={()=>void openOriginal(item)}>Original</CgButton>
      {item.state==='review'||item.state==='error'?<CgButton size="small" variant="outlined" disabled={busy===`reprocess:${item.id}`} onClick={()=>void reprocess(item)}>Reprocesar</CgButton>:null}
      {item.state==='review'&&!item.suspectedDuplicate?<CgButton size="small" onClick={()=>void prepareReview(item)}>Revisar</CgButton>:null}
      {item.reviewStatus!=='rejected'&&item.state!=='draft_created'?<CgButton size="small" color="error" variant="outlined" onClick={()=>{setRejectTarget(item);setRejectReason('');}}>Rechazar</CgButton>:null}
    </Stack>}
  ],[documents,busy]);

  const extraction=reviewDetail?.parserRuns?.find((run)=>run.status==='success')?.result||reviewDetail?.parserResult||{};
  const required=reviewDetail?.requiredConfirmations||PayablesService.requiredConfirmations(reviewDetail||{});
  const poDifferences=reviewDetail?.matchResult?.purchaseOrder?.differences||[];
  const receiptDifferences=reviewDetail?.matchResult?.receipt?.differences||[];
  const differenceCount=poDifferences.length+receiptDifferences.length;

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Typography variant="h6">Captura asistida de facturas proveedor</Typography>
    <Typography variant="caption" color="text.secondary">Documento → extracción → match PO/recepción → revisión humana → borrador. Nunca auto-post.</Typography>
    {error?<Box mt={1}><CgState severity="warning" title="Carga incompleta">{error}</CgState></Box>:null}
    <Box component="form" onSubmit={upload} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'minmax(0,1fr) auto'},gap:1,alignItems:'end',my:1.25}}>
      <Box>
        <Typography variant="caption" component="label" htmlFor="payable-file" sx={{display:'block',mb:.5,fontWeight:700}}>Factura proveedor</Typography>
        <input id="payable-file" ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required/>
        <Typography variant="caption" color="text.secondary" display="block">PDF/JPG/PNG/WebP · máximo 8 MiB. El original se conserva.</Typography>
      </Box>
      <CgButton type="submit" disabled={busy==='upload'}>{busy==='upload'?'Analizando…':'Analizar documento'}</CgButton>
    </Box>
    {loading?<CgState severity="info" title="Cargando">Consultando documentos por pagar.</CgState>:documents.length?<Box sx={{maxWidth:'100%',overflowX:'auto'}}><CgDataTable columns={columns} rows={documents} empty="Sin documentos"/></Box>:<CgEmptyState title="Sin documentos por pagar" description="Carga una factura para iniciar revisión asistida."/>}

    <CgDialog open={Boolean(reviewTarget)} title="Confirmar revisión humana" onClose={()=>{setReviewTarget(null);setReviewDetail(null);}} confirmLabel={busy.startsWith('review:')?'Confirmando…':'Crear borrador'} onConfirm={()=>void confirmReview()}>
      <Stack gap={1.2} pt={1}>
        {required.length?<CgState severity="warning" title="Baja confianza">{required.length} campo(s) requieren confirmación: {required.join(', ')}.</CgState>:<CgState severity="success" title="Confianza">No hay campos superiores al umbral de revisión obligatoria.</CgState>}
        {differenceCount?<CgState severity="warning" title="Diferencias de match">{differenceCount} diferencia(s) entre factura, purchaseOrder o receipt. Se conservarán sin autocorrección. Líneas extraídas: {Array.isArray(extraction.lines)?extraction.lines.length:0}.</CgState>:null}
        {!extraction.invoiceNumber?.value?<CgTextField label="Número de factura confirmado" value={reviewForm.invoiceNumber} onChange={(e)=>setReviewForm({...reviewForm,invoiceNumber:e.target.value})}/>:null}
        {!extraction.currency?.value?<CgSelect label="Moneda confirmada" value={reviewForm.currency} onChange={(e)=>setReviewForm({...reviewForm,currency:e.target.value})} options={['VES','USD','EUR'].map((value)=>({value,label:value}))}/>:null}
        <Typography variant="body2" color="text.secondary">La confirmación crea sólo un borrador de compra; no contabiliza automáticamente.</Typography>
      </Stack>
    </CgDialog>

    <CgDialog open={Boolean(rejectTarget)} title="Rechazar documento" onClose={()=>setRejectTarget(null)} confirmLabel={busy.startsWith('reject:')?'Rechazando…':'Rechazar'} destructive onConfirm={()=>void reject()}>
      <Box pt={1}><CgTextField autoFocus fullWidth multiline minRows={3} label="Motivo del rechazo" value={rejectReason} onChange={(e)=>setRejectReason(e.target.value)}/></Box>
    </CgDialog>
  </Paper>;
}
