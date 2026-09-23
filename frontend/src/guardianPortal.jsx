import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{Box,CssBaseline,Link,Paper,Stack,Typography}from'@mui/material';
import{CgEmptyState,CgMoney,CgPageHeader,CgProvider,CgState,CgStatusChip}from'./components/ui/cg/CgPrimitives.jsx';
import{BackendApi}from'./services/backendApi.js';

const dt=v=>v?new Date(v).toLocaleString('es-VE',{dateStyle:'medium',timeStyle:'short'}):'—';
const tone=v=>['paid','completed','delivered','sent','confirmed','discharged'].includes(String(v||'').toLowerCase())?'success':['failed','cancelled','overdue','revoked'].includes(String(v||'').toLowerCase())?'error':['pending','queued','scheduled','draft','authorized','attended'].includes(String(v||'').toLowerCase())?'warning':'default';
function Section({title,description,children}){return <Paper variant="outlined" sx={{p:1.5}}><Typography variant="h6">{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography><Box mt={1}>{children}</Box></Paper>;}
function Empty({title}){return <CgEmptyState title={title} description="No hay información visible en este acceso."/>;}
function takeAccessToken(){
  const fragment=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
  const fromFragment=fragment.get('access')||'';
  if(fromFragment){
    sessionStorage.setItem('cg_veterinary_portal_access',fromFragment);
    history.replaceState(null,'',location.pathname);
    return fromFragment;
  }
  return sessionStorage.getItem('cg_veterinary_portal_access')||'';
}

function Portal(){
 const[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{
   const accessToken=takeAccessToken();
   if(!accessToken){setError('El enlace no contiene un acceso temporal.');setLoading(false);return;}
   BackendApi.request('/public/veterinary-portal/session',{method:'POST',body:{accessToken},noAuth:true})
     .then(setData)
     .catch((cause)=>{sessionStorage.removeItem('cg_veterinary_portal_access');setError(cause?.message||'El enlace no es válido, venció o fue revocado.');})
     .finally(()=>setLoading(false));
 },[]);
 if(loading)return <Shell><CgState severity="info" title="Cargando portal">Consultando únicamente la información autorizada.</CgState></Shell>;
 if(error)return <Shell><CgState severity="error" title="Acceso no disponible">{error}</CgState></Shell>;
 if(!data)return null;
 return <Shell><Stack gap={1.3}>
  <CgPageHeader eyebrow={data.clinic?.name||'Clínica veterinaria'} title={'Portal de '+(data.patient?.displayName||'tu mascota')} description={'Acceso de solo lectura. Vigente hasta '+dt(data.access?.expiresAt)+'.'}/>
  <Section title="Citas y recordatorios" description="Agenda reciente y estado de recordatorios.">{data.appointments?.length?<Stack gap={.7}>{data.appointments.map((x,i)=><Paper key={i} variant="outlined" sx={{p:1}}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Box><b>{dt(x.startsAt)}</b><Typography variant="body2">{x.reason||'Consulta veterinaria'}</Typography></Box><Stack direction="row" gap={.4}><CgStatusChip size="small" label={x.status}/><CgStatusChip size="small" label={'recordatorio: '+x.reminderStatus} tone={tone(x.reminderStatus)}/></Stack></Stack></Paper>)}</Stack>:<Empty title="Sin citas visibles"/>}</Section>
  <Section title="Alta y estancia" description="Estado de hospitalización y fecha de alta; no se muestran diagnósticos ni notas clínicas.">{data.discharges?.length?<Stack gap={.7}>{data.discharges.map((x,i)=><Paper key={i} variant="outlined" sx={{p:1}}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between"><Box><b>{x.admissionNumber||'Hospitalización'}</b><Typography variant="body2">Ingreso {dt(x.admittedAt)}{x.dischargedAt?' · alta '+dt(x.dischargedAt):''}{x.ward?' · '+x.ward:''}</Typography></Box><CgStatusChip size="small" label={x.status} tone={tone(x.status)}/></Stack></Paper>)}</Stack>:<Empty title="Sin hospitalizaciones"/>}</Section>
  <Section title="Documentos" description="Estudios publicados mediante URL HTTPS; nunca se exponen rutas internas ni resultados narrativos.">{data.documents?.length?<Stack gap={.7}>{data.documents.map((x,i)=><Paper key={i} variant="outlined" sx={{p:1}}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between"><Box><b>{x.title}</b><Typography variant="body2" color="text.secondary">{x.kind} · {dt(x.performedAt||x.scheduledAt)}</Typography></Box>{x.externalUrl?<Link href={x.externalUrl} target="_blank" rel="noreferrer noopener">Abrir documento</Link>:null}</Stack></Paper>)}</Stack>:<Empty title="Sin documentos publicados"/>}</Section>
  <Section title="Facturación y pagos" description="Estado comercial de la atención; este portal no emite, cobra ni contabiliza.">{data.billing?.length?<Stack gap={.7}>{data.billing.map((x,i)=><Paper key={i} variant="outlined" sx={{p:1}}><Stack direction="row" justifyContent="space-between" gap={1}><Box><b>{x.invoiceNumber||'Estimación veterinaria'}</b><Typography variant="body2">{x.invoiceStatus||x.caseStatus}</Typography></Box><Box textAlign="right"><CgMoney value={x.invoiceTotal||x.estimatedTotal} currency={x.currency||'VES'}/><CgStatusChip size="small" label={x.invoiceStatus||x.caseStatus} tone={tone(x.invoiceStatus||x.caseStatus)}/></Box></Stack></Paper>)}</Stack>:<Empty title="Sin facturación visible"/>}</Section>
  <Section title="Comunicaciones" description="Trazabilidad del canal y estado; los payloads internos y mensajes privados no se exponen.">{data.communications?.length?<Stack gap={.7}>{data.communications.map((x,i)=><Paper key={i} variant="outlined" sx={{p:1}}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Box><b>{String(x.event||'comunicación').replaceAll('_',' ')}</b><Typography variant="caption" color="text.secondary">{x.channel} · {dt(x.sentAt||x.scheduledAt||x.createdAt)}</Typography></Box><CgStatusChip size="small" label={x.status} tone={tone(x.status)}/></Stack></Paper>)}</Stack>:<Empty title="Sin comunicaciones"/>}</Section>
  <Typography variant="caption" color="text.secondary" textAlign="center">Enlace personal, temporal y revocable. Para cambios clínicos o administrativos, contacta a la clínica.</Typography>
 </Stack></Shell>;
}
function Shell({children}){return <CgProvider state={{settings:{theme:'light'}}}><CssBaseline/><Box sx={{minHeight:'100vh',bgcolor:'background.default',py:2}}><Box sx={{maxWidth:980,mx:'auto',px:1.5}}>{children}</Box></Box></CgProvider>;}
createRoot(document.getElementById('guardian-portal-root')).render(<Portal/>);
