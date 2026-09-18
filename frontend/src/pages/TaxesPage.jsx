import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, FormControlLabel, Paper, Stack, Switch, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgPageHeader, CgProvider, CgSelect, CgState, CgStatusChip, CgTextField
} from '../components/ui/cg/CgPrimitives.jsx';
import { FiscalService, FISCAL_MODULES, FISCAL_DOCUMENT_KINDS } from '../services/fiscalService.js';

const currentPeriod=()=>new Date().toISOString().slice(0,7);
const taxLabel=(key,item)=>({iva:'IVA',igtf:'IGTF',islr:'ISLR',retIva:'Retención IVA',retIslr:'Retención ISLR',custom:item.label||'Otro tributo'}[key]||key);

function TaxesWorkspace({state,context}){
  const Store=context.Store,Toast=context.Toast;
  const [taxes,setTaxes]=useState(()=>structuredClone(state.quote?.taxes||{}));
  const [governance,setGovernance]=useState(state.fiscalGovernance||{capabilities:{}});
  const [documents,setDocuments]=useState(Array.isArray(state.fiscalDocuments)?state.fiscalDocuments:[]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [form,setForm]=useState({kind:FISCAL_DOCUMENT_KINDS[0]?.value||'invoice',number:'',period:currentPeriod(),module:FISCAL_MODULES[0]?.value||'fiscal',payloadJson:'{}'});
  const notify=(message,tone='success')=>Toast?.show?.(message,tone);

  function saveTaxes(){
    Store.update((draft)=>{
      draft.quote=draft.quote||{};
      draft.quote.taxes=structuredClone(taxes);
    });
    notify('Tributos actualizados.','success');
  }

  async function loadFiscal({silent=true}={}){
    if(!silent)setLoading(true);setError('');
    try{
      const status=await FiscalService.periods();
      const docs=await FiscalService.documents();
      const next={...status,denied:false,loaded:true};
      setGovernance(next);setDocuments(docs||[]);
      Store.set({fiscalGovernance:next,fiscalDocuments:docs||[]});
    }catch(cause){
      if(cause?.status===403){
        const denied={periods:[],capabilities:{},denied:true,loaded:true};
        setGovernance(denied);setDocuments([]);
        Store.set({fiscalGovernance:denied,fiscalDocuments:[]});
        return;
      }
      const message=cause?.message||'No se cargaron documentos fiscales.';
      setError(message);notify(message,'error');
    }finally{if(!silent)setLoading(false);}
  }

  useEffect(()=>{if(!state.fiscalGovernance?.loaded||state.fiscalDocuments===undefined)void loadFiscal({silent:true});},[]);

  async function submitDocument(event){
    event.preventDefault();setSaving(true);
    try{
      let payload={};
      if(String(form.payloadJson||'').trim())payload=JSON.parse(form.payloadJson);
      if(!payload||Array.isArray(payload)||typeof payload!=='object')throw new Error('El payload debe ser un objeto JSON.');
      await FiscalService.createDocument({kind:form.kind,number:form.number,period:form.period,module:form.module,payload});
      notify('Documento fiscal registrado y auditado.','success');
      setForm({kind:FISCAL_DOCUMENT_KINDS[0]?.value||'invoice',number:'',period:currentPeriod(),module:FISCAL_MODULES[0]?.value||'fiscal',payloadJson:'{}'});
      await loadFiscal({silent:true});
    }catch(cause){notify(`No se registró el documento: ${cause?.message||'Error'}`,'error');}
    finally{setSaving(false);}
  }

  const columns=[
    {key:'createdAt',label:'Fecha',render:(doc)=>doc.createdAt?new Date(doc.createdAt).toLocaleString('es-VE'):'—'},
    {key:'kind',label:'Tipo'},{key:'number',label:'Número'},{key:'period',label:'Período'},{key:'module',label:'Módulo'},
    {key:'status',label:'Estado',render:(doc)=><CgStatusChip size="small" label={String(doc.status||'issued').toUpperCase()} tone="success"/>},
    {key:'hash',label:'Hash',render:(doc)=><Typography variant="caption" sx={{fontFamily:'monospace'}} title={doc.hash}>{String(doc.hash||'').slice(0,12)}{doc.hash?'…':''}</Typography>}
  ];

  return <Stack gap={1.5}>
    <CgPageHeader eyebrow="Tributos" title="Configuración tributaria y documentos fiscales" description="Alícuotas operativas separadas del registro fiscal tenant-scoped y auditable." actions={<CgButton onClick={saveTaxes}>Guardar</CgButton>}/>
    {error?<CgState severity="warning" title="Carga fiscal incompleta">{error}</CgState>:null}
    {loading?<CgState severity="info" title="Actualizando">Cargando documentos fiscales.</CgState>:null}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',lg:'repeat(3,minmax(0,1fr))'},gap:1}}>
      {Object.entries(taxes).map(([key,item])=><Paper key={key} variant="outlined" sx={{p:1.4}}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Box><Typography variant="h6">{taxLabel(key,item)}</Typography><Typography variant="caption" color="text.secondary">Alícuota aplicada en operaciones compatibles.</Typography></Box>
          <FormControlLabel control={<Switch checked={Boolean(item.active)} onChange={(e)=>setTaxes((current)=>({...current,[key]:{...current[key],active:e.target.checked}}))}/>} label={<CgStatusChip size="small" label={item.active?'Activo':'Inactivo'} tone={item.active?'success':'default'}/>}/>
        </Stack>
        <CgTextField sx={{mt:1}} fullWidth label="Alícuota %" type="number" inputProps={{step:.01,min:0}} value={item.rate||0} onChange={(e)=>setTaxes((current)=>({...current,[key]:{...current[key],rate:Number(e.target.value||0)}}))}/>
      </Paper>)}
    </Box>

    <Paper variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Documentos fiscales</Typography>
      <Typography variant="caption" color="text.secondary">Registro tenant-scoped con hash, RBAC y bloqueo por período fiscal cerrado. Esta ingeniería no constituye certificación regulatoria SENIAT.</Typography>
      <Box mt={1.2}>
        {governance.capabilities?.manageDocuments?
          <Box component="form" onSubmit={submitDocument}>
            <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:1}}>
              <CgSelect label="Tipo documento" value={form.kind} onChange={(e)=>setForm({...form,kind:e.target.value})} options={FISCAL_DOCUMENT_KINDS}/>
              <CgTextField label="Número" required value={form.number} onChange={(e)=>setForm({...form,number:e.target.value})}/>
              <CgTextField label="Período" required inputProps={{pattern:'\\d{4}-\\d{2}'}} value={form.period} onChange={(e)=>setForm({...form,period:e.target.value})}/>
              <CgSelect label="Módulo fiscal" value={form.module} onChange={(e)=>setForm({...form,module:e.target.value})} options={FISCAL_MODULES}/>
            </Box>
            <CgTextField sx={{mt:1}} fullWidth label="Payload JSON opcional" multiline minRows={2} value={form.payloadJson} onChange={(e)=>setForm({...form,payloadJson:e.target.value})}/>
            <CgButton type="submit" disabled={saving} sx={{mt:1}}>{saving?'Registrando…':'Registrar documento fiscal'}</CgButton>
          </Box>
          :<CgState severity={governance.denied?'error':'info'} title={governance.denied?'PERMISSION DENIED':'SOLO LECTURA'}>El servidor no habilitó <code>fiscal.manage_documents</code> para esta sesión.</CgState>}
      </Box>
    </Paper>

    <Box sx={{maxWidth:'100%',overflowX:'auto'}}>
      <CgDataTable columns={columns} rows={documents} empty="Sin documentos fiscales registrados"/>
    </Box>
  </Stack>;
}

let activeRoot=null;
export const TaxesPage={
  render(){return '<section class="cg-page-stack"><div id="taxesReactRoot"></div></section>';},
  mount(state,context){
    const host=document.getElementById('taxesReactRoot');
    if(!host)return;
    try{activeRoot?.unmount();}catch{}
    activeRoot=createRoot(host);
    activeRoot.render(<CgProvider state={state}><TaxesWorkspace state={state} context={context}/></CgProvider>);
  }
};
