import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, FormControlLabel, Paper, Stack, Switch, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgPageHeader, CgProvider, CgSelect, CgState, CgStatusChip, CgTextField
} from '../components/ui/cg/CgPrimitives.jsx';
import { FiscalService, FISCAL_MODULES, FISCAL_DOCUMENT_KINDS } from '../services/fiscalService.js';
import { buildTaxpayerDraftSubmission } from '../services/taxpayerDraftForm.js';

const currentPeriod=()=>new Date().toISOString().slice(0,7);
const taxLabel=(key,item)=>({iva:'IVA',igtf:'IGTF',islr:'ISLR',retIva:'Retención IVA',retIslr:'Retención ISLR',custom:item.label||'Otro tributo'}[key]||key);

function TaxesWorkspace({state,context}){
  const Store=context.Store,Toast=context.Toast;
  const [taxes,setTaxes]=useState(()=>structuredClone(state.quote?.taxes||{}));
  const [governance,setGovernance]=useState(state.fiscalGovernance||{capabilities:{}});
  const [documents,setDocuments]=useState(Array.isArray(state.fiscalDocuments)?state.fiscalDocuments:[]);
  const [loading,setLoading]=useState(!state.fiscalGovernance?.loaded||state.fiscalDocuments===undefined);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [profiles,setProfiles]=useState([]);
  const [legalSources,setLegalSources]=useState([]);
  const [fiscalRules,setFiscalRules]=useState([]);
  const [ruleEvidenceLoading,setRuleEvidenceLoading]=useState(true);
  const [ruleEvidenceError,setRuleEvidenceError]=useState('');
  const [decisionReason,setDecisionReason]=useState('');
  const [decisionBusy,setDecisionBusy]=useState('');
  const [profilesLoading,setProfilesLoading]=useState(true);
  const [profilesError,setProfilesError]=useState('');
  const [profileSaving,setProfileSaving]=useState(false);
  const [profileDraft,setProfileDraft]=useState({
    effectiveFrom:new Date().toISOString().slice(0,10),effectiveTo:'',jurisdiction:'',
    taxpayerCategory:'',activityCodes:'',sourceReference:'',sourceContentSha256:''
  });
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
    setLoading(true);setError('');
    try{
      const status=await FiscalService.periods();
      const docs=await FiscalService.documents();
      const next={...status,denied:false,loaded:true};
      setGovernance(next);setDocuments(docs||[]);
      Store.set({fiscalGovernance:next,fiscalDocuments:docs||[]});
    }catch(error){
      if(error.status===403){
        const denied={periods:[],capabilities:{},denied:true,loaded:true};
        setGovernance(denied);setDocuments([]);
        Store.set({fiscalGovernance:denied,fiscalDocuments:[]});
        return;
      }
      const message=error?.message||'No se cargaron documentos fiscales.';
      setError(message);notify(message,'error');
    }finally{setLoading(false);}
  }

  useEffect(()=>{void loadFiscal({silent:true});},[]);

  async function loadProfiles(){
    setProfilesLoading(true);setProfilesError('');
    try{
      const records=await FiscalService.taxpayerProfiles();
      setProfiles(Array.isArray(records)?records:[]);
    }catch(cause){
      setProfiles([]);
      setProfilesError(cause.status===403?'PERMISSION DENIED: el perfil requiere fiscal.read.':cause.message||'No fue posible cargar los perfiles.');
    }finally{setProfilesLoading(false);}
  }
  useEffect(()=>{void loadProfiles();},[]);

  async function loadRuleEvidence(){
    setRuleEvidenceLoading(true);setRuleEvidenceError('');
    try{
      const [sources,rules]=await Promise.all([FiscalService.legalSources(),FiscalService.rules()]);
      setLegalSources(Array.isArray(sources)?sources:[]);
      setFiscalRules(Array.isArray(rules)?rules:[]);
    }catch(cause){
      setLegalSources([]);setFiscalRules([]);
      setRuleEvidenceError(cause?.status===403?'No autorizado para consultar fuentes o reglas fiscales.':cause?.message||'No se pudo cargar la evidencia fiscal.');
    }finally{setRuleEvidenceLoading(false);}
  }
  useEffect(()=>{void loadRuleEvidence();},[]);

  async function decideLegalEvidence(id,action){
    if(!decisionReason.trim()||decisionReason.trim().length<15)return notify('Documenta la decisión con al menos 15 caracteres.','error');
    if(decisionBusy)return;
    const key=`${action}:${id}`;
    setDecisionBusy(key);
    try{
      if(action==='review-source')await FiscalService.reviewLegalSource(id,true,decisionReason.trim());
      else if(action==='review-rule')await FiscalService.reviewRule(id,decisionReason.trim());
      else if(action==='activate-rule')await FiscalService.activateRule(id,decisionReason.trim());
      else throw new Error('Acción de gobernanza no autorizada.');
      setDecisionReason('');
      await loadRuleEvidence();
      notify('Decisión auditada por el servidor. Verifica el estado persistido.','success');
    }catch(cause){notify(cause?.message||'Operación fiscal rechazada.','error');}
    finally{setDecisionBusy('');}
  }

  async function submitProfileDraft(event){
    event.preventDefault();
    if(!governance.capabilities?.close)return notify('El servidor no habilitó fiscal.close.','error');
    setProfileSaving(true);
    try{
      const payload=buildTaxpayerDraftSubmission(profileDraft);
      const saved=await FiscalService.captureTaxpayerProfileDraft(payload);
      if(saved?.status!=='DRAFT')throw new Error('Respuesta fiscal inesperada; no se confirmó el borrador.');
      await loadProfiles();
      notify('Perfil tributario guardado como BORRADOR, sin activar reglas fiscales.','success');
    }catch(cause){notify(`No se guardó el borrador tributario: ${cause.message}`,'error');}
    finally{setProfileSaving(false);}
  }

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
  const legalSourceColumns=[
    {key:'reference',label:'Referencia normativa'},
    {key:'sourceType',label:'Tipo'},
    {key:'status',label:'Revisión',render:(row)=><CgStatusChip size="small" label={row.status} tone={row.status==='REVIEWED'?'success':'warning'}/>},
    {key:'contentSha256',label:'Huella SHA-256',render:(row)=><Typography variant="caption" sx={{fontFamily:'monospace'}} title={row.contentSha256}>{String(row.contentSha256||'').slice(0,16)}…</Typography>},
    {key:'reviewedBy',label:'Revisor',render:(row)=>row.reviewedBy||'Pendiente'},
    {key:'action',label:'Acción auditada',render:(row)=>row.status==='DRAFT'&&governance.capabilities?.close?
      <CgButton disabled={Boolean(decisionBusy)||decisionReason.trim().length<15} onClick={()=>decideLegalEvidence(row.id,'review-source')}>Revisar fuente</CgButton>:'—'}
  ];
  const fiscalRuleColumns=[
    {key:'ruleKey',label:'Regla/selector'},
    {key:'version',label:'Versión'},
    {key:'status',label:'Estado',render:(row)=><CgStatusChip size="small" label={row.status||'DRAFT'} tone={row.status==='ACTIVE'?'success':'warning'}/>},
    {key:'legalSourceSha256',label:'Fuente',render:(row)=><Typography variant="caption" sx={{fontFamily:'monospace'}}>{row.legalSourceSha256?String(row.legalSourceSha256).slice(0,16)+'…':'Sin fuente revisada'}</Typography>},
    {key:'effectiveFrom',label:'Desde UTC',render:(row)=>String(row.effectiveFrom||'').slice(0,10)},
    {key:'action',label:'Acción auditada',render:(row)=>{
      if(row.status==='DRAFT'&&governance.capabilities?.close)return <CgButton disabled={Boolean(decisionBusy)||decisionReason.trim().length<15} onClick={()=>decideLegalEvidence(row.id,'review-rule')}>Revisar regla</CgButton>;
      if(row.status==='REVIEWED'&&governance.capabilities?.activateRules)return <CgButton disabled={Boolean(decisionBusy)||decisionReason.trim().length<15} onClick={()=>decideLegalEvidence(row.id,'activate-rule')}>Activar regla</CgButton>;
      return '—';
    }}
  ];
  const profileColumns=[
    {key:'version',label:'Versión'},
    {key:'rifSnapshot',label:'RIF de captura'},
    {key:'jurisdiction',label:'Jurisdicción'},
    {key:'taxpayerCategory',label:'Categoría propuesta'},
    {key:'activityCodes',label:'Actividades',render:(record)=>Array.isArray(record.activityCodes)?record.activityCodes.join(', '):'—'},
    {key:'effectiveFrom',label:'Vigente desde (propuesto)',render:(record)=>String(record.effectiveFrom||'').slice(0,10)},
    {key:'status',label:'Estado',render:(record)=><CgStatusChip size="small" label={String(record.status||'DRAFT')} tone="warning"/>},
    {key:'sourceReference',label:'Referencia de origen'}
  ];
  const updateProfile=(key)=>(event)=>setProfileDraft((current)=>({...current,[key]:event.target.value}));

  return <Stack gap={1.5}>
    <CgPageHeader eyebrow="Tributos" title="Configuración tributaria y documentos fiscales" description="Alícuotas operativas separadas del registro fiscal tenant-scoped y auditable." actions={<CgButton onClick={saveTaxes}>Guardar</CgButton>}/>
    {error?<CgState severity="warning" title="Carga fiscal incompleta">{error}</CgState>:null}
    {loading?<CgState severity="info" title="Actualizando">Cargando documentos fiscales.</CgState>:null}

    <Paper variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Perfil tributario · BORRADOR</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mb:1}}>
        Sólo candidatos versionados y auditados para el tenant. El registro de un borrador no activa reglas fiscales, ni determina por sí solo la clasificación legal del contribuyente.
      </Typography>
      {profilesLoading?<CgState severity="info" title="Cargando perfiles">Consultando los borradores del servidor.</CgState>:null}
      {profilesError?<CgState severity="error" title="Sin acceso a perfiles">{profilesError}</CgState>:null}
      {!profilesError&&!profilesLoading?<CgDataTable columns={profileColumns} rows={profiles} empty="Sin perfiles tributarios capturados"/>:null}
      {governance.capabilities?.close?
        <Box component="form" onSubmit={submitProfileDraft} sx={{mt:1.5}}>
          <Typography variant="subtitle1">Capturar candidato documentado</Typography>
          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1,mt:1}}>
            <CgTextField label="Inicio de vigencia propuesta (UTC)" type="date" required InputLabelProps={{shrink:true}} value={profileDraft.effectiveFrom} onChange={updateProfile('effectiveFrom')}/>
            <CgTextField label="Fin de vigencia propuesta (opcional, UTC)" type="date" InputLabelProps={{shrink:true}} value={profileDraft.effectiveTo} onChange={updateProfile('effectiveTo')}/>
            <CgTextField label="Jurisdicción documentada" required inputProps={{minLength:3,maxLength:120}} value={profileDraft.jurisdiction} onChange={updateProfile('jurisdiction')}/>
            <CgTextField label="Categoría tributaria propuesta" required inputProps={{minLength:3,maxLength:80}} value={profileDraft.taxpayerCategory} onChange={updateProfile('taxpayerCategory')}/>
            <CgTextField label="Códigos de actividad (separados por coma)" required value={profileDraft.activityCodes} onChange={updateProfile('activityCodes')}/>
            <CgTextField label="Referencia de fuente verificable" required inputProps={{minLength:3,maxLength:240}} value={profileDraft.sourceReference} onChange={updateProfile('sourceReference')}/>
            <CgTextField label="SHA-256 del contenido de la fuente (64 hex)" required inputProps={{minLength:64,maxLength:64,pattern:'[A-Fa-f0-9]{64}'}} value={profileDraft.sourceContentSha256} onChange={updateProfile('sourceContentSha256')}/>
          </Box>
          <CgButton type="submit" disabled={profileSaving} sx={{mt:1}}>{profileSaving?'Guardando borrador…':'Guardar perfil como BORRADOR'}</CgButton>
        </Box>
        :<CgState severity="info" title="Captura restringida">Se necesita el permiso fiscal.close para registrar borradores tributarios.</CgState>}
    </Paper>

    <Paper variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Fuentes legales y reglas versionadas · auditoría</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mb:1}}>
        La captura de una fuente no certifica una tasa. Sólo reglas con fuente revisada, aprobación independiente y activación del servidor pueden alimentar documentos. No se precargan porcentajes legales.
      </Typography>
      {ruleEvidenceError?<CgState severity="error" title="Evidencia fiscal no disponible">{ruleEvidenceError}</CgState>:null}
      {ruleEvidenceLoading?<CgState severity="info" title="Consultando gobernanza">Cargando fuentes y reglas del servidor.</CgState>:null}
      {!ruleEvidenceLoading&&!ruleEvidenceError?<>
        <CgTextField fullWidth label="Motivo de revisión o activación (15–500 caracteres)" value={decisionReason}
          inputProps={{minLength:15,maxLength:500}} onChange={(event)=>setDecisionReason(event.target.value)}/>
        <Typography variant="subtitle1" sx={{mt:1}}>Fuentes legales capturadas</Typography>
        <Box sx={{maxWidth:'100%',overflowX:'auto'}}><CgDataTable columns={legalSourceColumns} rows={legalSources} empty="No hay fuentes legales capturadas"/></Box>
        <Typography variant="subtitle1" sx={{mt:1}}>Versiones fiscales</Typography>
        <Box sx={{maxWidth:'100%',overflowX:'auto'}}><CgDataTable columns={fiscalRuleColumns} rows={fiscalRules} empty="No hay reglas fiscales versionadas"/></Box>
      </>:null}
    </Paper>

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
