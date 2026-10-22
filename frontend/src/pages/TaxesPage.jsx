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
  const [profilesLoading,setProfilesLoading]=useState(true);
  const [profilesError,setProfilesError]=useState('');
  const [profileSaving,setProfileSaving]=useState(false);
  const [readinessPeriod,setReadinessPeriod]=useState(currentPeriod());
  const [compliance,setCompliance]=useState(null);
  const [complianceLoading,setComplianceLoading]=useState(false);
  const [complianceError,setComplianceError]=useState('');
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

  useEffect(()=>{if(!state.fiscalGovernance?.loaded||state.fiscalDocuments===undefined)void loadFiscal({silent:true});},[]);

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

  async function loadCompliancePeriod(period=readinessPeriod){
    setComplianceLoading(true);setComplianceError('');
    try{
      const report=await FiscalService.complianceReadiness(period);
      setCompliance(report);
    }catch(cause){
      setCompliance(null);
      setComplianceError(cause?.message||'No fue posible consultar la evidencia del período.');
    }finally{setComplianceLoading(false);}
  }
  useEffect(()=>{
    if (/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(readinessPeriod)) {
      void loadCompliancePeriod(readinessPeriod);
    } else {
      setCompliance(null);
    }
  },[readinessPeriod]);

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
      notify('Documento externo registrado como NO VERIFICADO. No equivale a una factura fiscal certificada ni a una declaración ante el SENIAT.','info');
      setForm({kind:FISCAL_DOCUMENT_KINDS[0]?.value||'invoice',number:'',period:currentPeriod(),module:FISCAL_MODULES[0]?.value||'fiscal',payloadJson:'{}'});
      await loadFiscal({silent:true});
    }catch(cause){notify(`No se registró el documento: ${cause?.message||'Error'}`,'error');}
    finally{setSaving(false);}
  }

  const columns=[
    {key:'createdAt',label:'Fecha',render:(doc)=>doc.createdAt?new Date(doc.createdAt).toLocaleString('es-VE'):'—'},
    {key:'kind',label:'Tipo'},{key:'number',label:'Número'},{key:'period',label:'Período'},{key:'module',label:'Módulo'},
    {key:'status',label:'Estado',render:(doc)=>{
      const external = doc.status === 'external_unverified' ||
        doc.payload?._legalProvenance === 'UNVERIFIED_EXTERNAL';
      return <CgStatusChip size="small"
        label={external ? 'EXTERNO · SIN VERIFICAR' : 'REGISTRADO · REVISAR SOPORTE'}
        tone="warning"/>;
    }},
    {key:'hash',label:'Hash',render:(doc)=><Typography variant="caption" sx={{fontFamily:'monospace'}} title={doc.hash}>{String(doc.hash||'').slice(0,12)}{doc.hash?'…':''}</Typography>}
  ];
  const complianceColumns=[
    {key:'kind',label:'Obligación'},
    {key:'amountExact',label:'Monto registrado (no determinado)'},
    {key:'internalStatus',label:'Estado interno'},
    {key:'externalFiling',label:'Presentación externa',render:()=> <CgStatusChip size="small" label="SIN VERIFICACIÓN OFICIAL" tone="warning"/>},
    {key:'bankReconciliation',label:'Conciliación',render:()=> <CgStatusChip size="small" label="NO CERTIFICADA" tone="warning"/>}
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
      <Typography variant="h6">Centro de cumplimiento fiscal · diagnóstico por período</Typography>
      <Typography variant="body2" color="text.secondary">
        Datos internos existentes, no una declaración ante SENIAT ni una autorización de pago.
        Los saldos reflejan registros, no obligaciones legalmente determinadas.
      </Typography>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}} sx={{mt:1}}>
        <CgTextField label="Período fiscal (AAAA-MM)" value={readinessPeriod}
          inputProps={{pattern:'[0-9]{4}-(0[1-9]|1[0-2])'}}
          onChange={(event)=>{const value=event.target.value;if(value.length<=7)setReadinessPeriod(value);}}/>
        <CgButton disabled={complianceLoading||!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(readinessPeriod)}
          onClick={()=>void loadCompliancePeriod()}>{complianceLoading?'Consultando…':'Actualizar evidencia'}</CgButton>
      </Stack>
      {complianceLoading?<CgState severity="info" title="Consultando">Leyendo evidencia interna del período.</CgState>:null}
      {complianceError?<CgState severity="warning" title="Evidencia no disponible">{complianceError}</CgState>:null}
      {compliance && !complianceLoading?<>
        <CgState severity="warning" title="NO APTO PARA DECLARAR O PAGAR">
          Estado: {compliance.status}. Existen {compliance.blockers?.length||0} bloqueos de procedencia,
          presentación o conciliación. No se verificó información ante la autoridad fiscal.
        </CgState>
        <Typography variant="caption" color="text.secondary">
          Documentos fiscales registrados: {compliance.fiscalDocumentCount||0}.
          Saldos internos IVA débito: {compliance.taxPeriod?.recordedBalancesExact?.ivaDebit||'—'};
          IVA crédito: {compliance.taxPeriod?.recordedBalancesExact?.ivaCredit||'—'};
          IGTF pagado registrado: {compliance.taxPeriod?.recordedBalancesExact?.igtfPaid||'—'}.
        </Typography>
        <CgDataTable columns={complianceColumns} rows={compliance.declarations||[]}
          empty="Sin declaraciones registradas para este período"/>
      </>:null}
    </Paper>

    <Paper variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Documentos fiscales</Typography>
      <Typography variant="caption" color="text.secondary">Registro externo/manual sujeto a verificación de origen, reglas fiscales y numeración. Un hash de registro NO certifica su validez tributaria, ni equivale a una presentación ante SENIAT.</Typography>
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
            <CgButton type="submit" disabled={saving} sx={{mt:1}}>{saving?'Registrando…':'Registrar soporte externo (sin verificar)'}</CgButton>
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
