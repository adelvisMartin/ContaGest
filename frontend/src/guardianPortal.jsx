import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{Box,CssBaseline,Link,Paper,Stack,Typography}from'@mui/material';
import{CgEmptyState,CgMoney,CgPageHeader,CgProvider,CgState,CgStatusChip}from'./components/ui/cg/CgPrimitives.jsx';
import{BackendApi}from'./services/backendApi.js';

const dt=v=>v?new Date(v).toLocaleString('es-VE',{dateStyle:'medium',timeStyle:'short'}):'—';
const tone=v=>['paid','completed','delivered','sent','confirmed','discharged'].includes(String(v||'').toLowerCase())?'success':['failed','cancelled','overdue'].includes(String(v||'').toLowerCase())?'error':['pending','queued','scheduled','draft','authorized','attended'].includes(String(v||'').toLowerCase())?'warning':'default';
function Section({title,description,children}){return <Paper variant="outlined" sx={{p:1.5}}><Typography variant="h6">{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography><Box mt={1}>{children}</Box></Paper>;}
function Empty({title}){return <CgEmptyState title={title} description="No hay información visible en este acceso."/>;}

function Portal(){
 const[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const token=new URLSearchParams(location.search).get('token')||'';
 useEffect(()=>{if(!token){setError('El enlace no contiene un token de acceso.');setLoading(false);return;}BackendApi.request('/public/veterinary-portal/'+encodeURIComponent(token),{noAuth:true}).then(setData).catch(e=>setError(e?.message||'El enlace no es válido o venció.')).finally(()=>setLoading(false));},[token]);
 if(loading)return <Shell><CgState severity="info" title="Cargando portal">Consultando información autorizada.</CgState></Shell>;
 if(error)return <Shell><CgState severity="error" title="Acceso no disponible">{error}</CgState></Shell>;
 if(!data)return null;
 const messages=(data.communications||[]).filter(x=>x.guardianText);
 return <Shell><Stack gap={1.3}>
  <CgPageHeader eyebrow={data.clinic?.name||'Clínica veterinaria'} title={'Portal de '+(data.patient?.displayName||'tu mascota')} description={'Acceso de solo lectura para '+(data.patient?.guardianName||'el tutor')+'. Vigente hasta '+dt(data.access?.expiresAt)+'.'}/>
  <Section title="Citas y recordatorios" description="Agenda reciente y próximos controles.">{data.appointments?.length?<Stack gap={.7}>{data.appointments.map((x,i)=><Paper key={i} variant="outlined" sx={{p:1}}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Box><b>{dt(x.startsAt)}</b><Typography variant="body2">{x.reason||'Consulta veterinaria'}</Typography></Box><Stack direction="row" gap={.4}><CgStatusChip size="small" label={x.status}/><CgStatusChip size="small" label={'recordatorio: '+x.reminderStatus} tone={tone(x.reminderStatus)}/></Stack></Stack></Paper>)}</Stack>:<Empty title="Sin citas visibles"/>}</Section>
  <Section title="Alta y hospitalización" description="Hospitalizaciones y altas registradas.">{data.discharges?.length?<Stack gap={.7}>{data.discharges.map((x,i)=><Paper key={i} variant="outlined" sx={{p:1}}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between"><Box><b>{x.admissionNumber||'Hospitalización'}</b><Typography variant="body2">Ingreso {dt(x.admittedAt)}{x.dischargedAt?' · alta '+dt(x.dischargedAt):''}</Typography>{x.diagnosis?<Typography variant="body2" color="text.secondary">{x.diagnosis}</Typography>:null}</Box><CgStatusChip size="small" label={x.status} tone={tone(x.status)}/></Stack></Paper>)}</Stack>:<Empty title="Sin hospitalizaciones"/>}</Section>
  <Section title="Documentos clínicos" description="Estudios publicados; nunca se exponen rutas internas de almacenamiento.">{data.documents?.length?<Stack gap={.7}>{data.documents.map((x,i)=><Paper key={i} variant="outlined" sx={{p:1}}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between"><Box><b>{x.title}</b><Typography variant="body2" color="text.secondary">{x.kind} · {dt(x.performedAt||x.scheduledAt)}</Typography>{x.impression?<Typography variant="body2">{x.impression}</Typography>:null}</Box>{x.externalUrl?<Link href={x.externalUrl} target="_blank" rel="noreferrer noopener">Abrir</Link>:null}</Stack></Paper>)}</Stack>:<Empty title="Sin documentos clínicos"/>}</Section>
  <Section title="Facturación y pagos" description="Estado comercial; este portal no emite ni contabiliza facturas.">{data.billing?.length?<Stack gap={.7}>{data.billing.map((x,i)=><Paper key={i} variant="outlined" sx={{p:1}}><Stack direction="row" justifyContent="space-between"><Box><b>{x.invoiceNumber||'Estimación veterinaria'}</b><Typography variant="body2">{x.invoiceStatus||x.caseStatus}</Typography></Box><Box textAlign="right"><CgMoney value={x.invoiceTotal||x.estimatedTotal} currency={x.currency||'VES'}/><CgStatusChip size="small" label={x.invoiceStatus||x.caseStatus} tone={tone(x.invoiceStatus||x.caseStatus)}/></Box></Stack></Paper>)}</Stack>:<Empty title="Sin facturación"/>}</Section>
  <Section title="Comunicaciones" description="Sólo mensajes marcados explícitamente para el tutor.">{messages.length?<Stack gap={.7}>{messages.map((x,i)=><Paper key={i} variant="outlined" sx={{p:1}}><b>{x.event.replaceAll('_',' ')}</b><Typography variant="body2">{x.guardianText}</Typography><Typography variant="caption" color="text.secondary">{x.channel} · {dt(x.sentAt||x.scheduledAt||x.createdAt)}</Typography></Paper>)}</Stack>:<Empty title="Sin comunicaciones"/>}</Section>
  <Typography variant="caption" color="text.secondary" textAlign="center">Enlace personal, temporal y revocable. Para cambios clínicos o administrativos, contacta a la clínica.</Typography>
 </Stack></Shell>;
}
function Shell({children}){return <CgProvider state={{settings:{theme:'light'}}}><CssBaseline/><Box sx={{minHeight:'100vh',bgcolor:'background.default',py:2}}><Box sx={{maxWidth:980,mx:'auto',px:1.5}}>{children}</Box></Box></CgProvider>;}
createRoot(document.getElementById('guardian-portal-root')).render(<Portal/>);
