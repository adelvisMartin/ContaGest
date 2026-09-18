import { Badge, ErpButton, ErpDataTable, ErpSection } from '../ui/index.js';
import { escapeHtml, qsa } from '../../utils/dom.js';
import { PayablesService } from '../../services/payablesService.js';

const safe=(value)=>escapeHtml(String(value??''));
const stateTone=(value)=>value==='draft_created'?'success':value==='error'?'danger':value==='review'?'warning':'brand';
const stateLabel=(value)=>({uploaded:'Recibido',parsing:'Procesando',review:'Revisión',draft_created:'Borrador creado',error:'Error'})[value]||value||'—';
const confidenceSummary=(document)=>{
  const extraction=document?.parserResult||{};
  const topScores=Object.entries(extraction).filter(([key,value])=>!['lines','warnings'].includes(key)&&value&&typeof value==='object'&&'confidence' in value).map(([,value])=>Number(value.confidence||0));
  const lineScores=(Array.isArray(extraction.lines)?extraction.lines:[]).flatMap((line)=>Object.values(line||{}).filter((value)=>value&&typeof value==='object'&&'confidence' in value).map((value)=>Number(value.confidence||0)));
  const scores=[...topScores,...lineScores];
  if(!scores.length)return {label:'Sin extracción',tone:'warning'};
  const low=scores.filter((score)=>score<0.8).length;
  return low?{label:`${low} por confirmar`,tone:'warning'}:{label:'Confianza revisable',tone:'success'};
};

export const PayablesPanel={
  render(state){
    const documents=state.payableDocuments||[];
    const table=ErpDataTable({
      caption:'Documentos de cuentas por pagar',
      columns:[
        {key:'file',label:'Documento',render:(item)=>`<strong>${safe(item.fileName)}</strong><div class="cg-ui-muted">${safe(item.mimeType)} · ${(Number(item.sizeBytes||0)/1024).toFixed(0)} KB</div>`},
        {key:'reference',label:'Referencia',render:(item)=>safe(item.supplierReference||'Pendiente')},
        {key:'state',label:'Estado',render:(item)=>Badge(stateLabel(item.state),stateTone(item.state))},
        {key:'match',label:'Match',render:(item)=>Badge(item.matchMode==='3-way'?'3-way':item.matchMode==='2-way'?'2-way':'Sin match',item.matchMode==='3-way'?'success':item.matchMode==='2-way'?'brand':'neutral')},
        {key:'confidence',label:'Revisión',render:(item)=>{const summary=confidenceSummary(item);return Badge(summary.label,summary.tone);}},
        {key:'duplicate',label:'Dedupe',render:(item)=>item.suspectedDuplicate?Badge('Posible duplicado','danger'):Badge('Único','success')},
        {key:'actions',label:'Acciones',render:(item)=>`<div class="cg-inline-actions">
          ${ErpButton('Ver original',{variant:'secondary',icon:'fa-solid fa-eye',iconOnly:true,data:{'payable-open':item.id}})}
          ${item.state==='review'||item.state==='error'?ErpButton('Reprocesar',{variant:'secondary',icon:'fa-solid fa-rotate',iconOnly:true,data:{'payable-reprocess':item.id}}):''}
          ${item.state==='review'&&!item.suspectedDuplicate?ErpButton('Confirmar revisión',{variant:'primary',icon:'fa-solid fa-check',iconOnly:true,data:{'payable-review':item.id}}):''}
          ${item.reviewStatus!=='rejected'&&item.state!=='draft_created'?ErpButton('Rechazar',{variant:'danger',icon:'fa-solid fa-xmark',iconOnly:true,data:{'payable-reject':item.id}}):''}
        </div>`}
      ],rows:documents
    });
    const upload=`<form id="payableUploadForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">
      <label class="cg-field"><span>Factura proveedor</span><input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></label>
      <div class="cg-ui-muted">PDF/JPG/PNG/WebP · máximo 8 MiB. El original se conserva como evidencia y nunca se contabiliza automáticamente.</div>
    </div><div class="cg-record-actions">${ErpButton('Analizar documento',{variant:'primary',icon:'fa-solid fa-file-arrow-up',attrs:'type="submit"'})}</div></form>`;
    return ErpSection({title:'Captura asistida de facturas proveedor',description:'Documento → extracción con confianza por campo → match PO/recepción → revisión humana → borrador. Nunca auto-post.',content:`${upload}<div class="cg-ui-spacer"></div>${table}`});
  },

  mount(state,{Store,Toast,SupabaseSyncService}){
    const refresh=async()=>{
      try{
        const documents=await PayablesService.list();
        Store.update((draft)=>{draft.payableDocuments=documents;draft.payableDocumentsLoaded=true;});
      }catch(error){Toast.show(`No se cargaron documentos por pagar: ${error.message}`,'error');}
    };
    if(!state.payableDocumentsLoaded) refresh();

    document.getElementById('payableUploadForm')?.addEventListener('submit',async(event)=>{
      event.preventDefault();
      const form=event.currentTarget;
      const file=form.elements.file?.files?.[0];
      if(!file)return;
      if(file.size>8*1024*1024){Toast.show('El archivo supera el máximo de 8 MiB.','error');return;}
      const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');
      try{
        const result=await PayablesService.upload(file);
        const document=PayablesService.normalize(result);
        Store.update((draft)=>{draft.payableDocuments=[document,...(draft.payableDocuments||[]).filter((item)=>item.id!==document.id)];draft.payableDocumentsLoaded=true;});
        form.reset();
        Toast.show(result.duplicate?'El documento ya existía: no se creó una segunda obligación.':'Documento recibido. Revisa los campos y diferencias antes de crear el borrador.',result.duplicate?'warning':'success');
      }catch(error){Toast.show(`No se procesó el documento: ${error.message}`,'error');}
      finally{submit?.removeAttribute('disabled');}
    });

    qsa('[data-payable-open]').forEach((button)=>button.addEventListener('click',async()=>{
      button.setAttribute('disabled','disabled');
      try{await PayablesService.openOriginal(button.dataset.payableOpen);}catch(error){Toast.show(`No se abrió el original: ${error.message}`,'error');}
      finally{button.removeAttribute('disabled');}
    }));

    qsa('[data-payable-reprocess]').forEach((button)=>button.addEventListener('click',async()=>{
      button.setAttribute('disabled','disabled');
      try{
        const document=await PayablesService.reprocess(button.dataset.payableReprocess,'2.0.0');
        Store.update((draft)=>{draft.payableDocuments=(draft.payableDocuments||[]).map((item)=>item.id===document.id?document:item);});
        Toast.show('Reprocesado con una nueva ejecución versionada; el resultado histórico original se conservó.','success');
      }catch(error){Toast.show(`No se reprocesó: ${error.message}`,'error');}
      finally{button.removeAttribute('disabled');}
    }));

    qsa('[data-payable-review]').forEach((button)=>button.addEventListener('click',async()=>{
      const id=button.dataset.payableReview;button.setAttribute('disabled','disabled');
      try{
        const detail=await PayablesService.get(id);
        const required=detail.requiredConfirmations||[];
        if(required.length&&!window.confirm(`Hay ${required.length} campos de baja confianza (${required.join(', ')}). Al continuar confirmas que los revisaste; corrige el número de factura si falta.`))return;
        const extraction=detail.parserRuns?.find((run)=>run.status==='success')?.result||detail.parserResult||{};
        const poDifferences=detail.matchResult?.purchaseOrder?.differences||[];
        const receiptDifferences=detail.matchResult?.receipt?.differences||[];
        const differenceCount=poDifferences.length+receiptDifferences.length;
        if(differenceCount&&!window.confirm(`El match detectó ${differenceCount} diferencia(s) entre factura, PO o recepción. Las diferencias se conservarán sin autocorrección. Líneas extraídas: ${Array.isArray(extraction.lines)?extraction.lines.length:0}. ¿Continuar con la revisión?`))return;
        const corrections={};
        if(!extraction.invoiceNumber?.value){const value=window.prompt('Número de factura confirmado');if(!value)return;corrections.invoiceNumber=value.trim();}
        if(!extraction.currency?.value){const value=window.prompt('Moneda confirmada (VES, USD o EUR)','VES');if(!value)return;corrections.currency=value.trim().toUpperCase();}
        const result=await PayablesService.review(id,{confirmedFields:required,corrections});
        Store.update((draft)=>{draft.payableDocuments=(draft.payableDocuments||[]).map((item)=>item.id===id?result.document:item);});
        await SupabaseSyncService.pullPurchases({Store,Toast,force:true,silent:true}).catch(()=>{});
        Toast.show('Revisión confirmada. Se creó únicamente un borrador de compra; no fue contabilizado.','success');
      }catch(error){Toast.show(`No se confirmó la revisión: ${error.message}`,'error');}
      finally{button.removeAttribute('disabled');}
    }));

    qsa('[data-payable-reject]').forEach((button)=>button.addEventListener('click',async()=>{
      const reason=window.prompt('Motivo del rechazo del documento');if(!reason)return;
      button.setAttribute('disabled','disabled');
      try{
        const document=await PayablesService.reject(button.dataset.payableReject,reason);
        Store.update((draft)=>{draft.payableDocuments=(draft.payableDocuments||[]).map((item)=>item.id===document.id?document:item);});
        Toast.show('Documento rechazado conservando su evidencia y auditoría.','success');
      }catch(error){Toast.show(`No se rechazó: ${error.message}`,'error');}
      finally{button.removeAttribute('disabled');}
    }));
  }
};
