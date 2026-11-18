import React,{useEffect,useRef,useState} from 'react';
import {Box,Divider,Paper,Stack,Typography} from '@mui/material';
import {CgButton,CgEmptyState,CgSelect,CgState,CgStatusChip} from '../ui/cg/CgPrimitives.jsx';
import {HealthVerticalService} from '../../services/verticalService.js';
import {AuthSession} from '../../services/authSession.js';

const scope=()=>{
  const session=AuthSession.get();
  return session?.tenantId&&session?.user?.id?session.tenantId+':'+session.user.id:'';
};
const label=(row)=>row.kind==='surface'
  ?'Superficie '+row.surface+' · '+row.condition
  :'Sitio '+row.site+' · '+row.probingDepthMm+' mm · '+(row.bleeding?'Sangrado':'Sin sangrado');
const date=(value)=>value?new Date(value).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'}):'Sin firma';

export function DentalChartHistoryPanel({patientId,refreshKey=''}) {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [kind,setKind]=useState('all');
  const request=useRef(0);
  useEffect(()=>{
    const next=++request.current,identity=scope();
    setData(null);setError('');
    if(!patientId||!identity){setLoading(false);return undefined;}
    setLoading(true);
    void HealthVerticalService.dentalChartHistory(patientId)
      .then((result)=>{
        if(next===request.current&&scope()===identity)
          setData(result?.data||result);
      })
      .catch((cause)=>{
        if(next===request.current&&scope()===identity)
          setError(cause?.message||'No se pudo recuperar el historial odontológico.');
      })
      .finally(()=>{if(next===request.current)setLoading(false);});
    return()=>{request.current+=1;};
  },[patientId,refreshKey]);
  useEffect(()=>{
    const reset=()=>{request.current+=1;setData(null);setError('');setLoading(false);};
    window.addEventListener('cg:pwa-session-changed',reset);
    return()=>window.removeEventListener('cg:pwa-session-changed',reset);
  },[]);
  const filter=(rows)=>Array.isArray(rows)?rows.filter((row)=>kind==='all'||row.kind===kind):[];
  const current=filter(data?.current);
  const history=filter(data?.history).slice(-50).reverse();
  const known=Boolean(data?.patientId&&data.patientId===patientId);
  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}>
      <Box><Typography variant="h6">Evolución por pieza y superficie</Typography>
        <Typography variant="caption" color="text.secondary">Lectura del expediente firmado. El estado actual excluye versiones enmendadas; el historial conserva el origen clínico.</Typography></Box>
      {known?<CgStatusChip label={data.complete?'Historia reconstruida':'Revisión histórica requerida'} tone={data.complete?'success':'warning'}/>:null}
    </Stack>
    <Divider sx={{my:1}}/>
    {!patientId?<CgEmptyState title="Selecciona un paciente" description="La historia longitudinal solo se consulta en el expediente activo."/>:null}
    {loading?<CgState severity="info" title="Verificando historial">Consultando encuentros clínicos firmados.</CgState>:null}
    {error?<CgState severity="error" title="Historial no disponible">{error}</CgState>:null}
    {known&&!data.complete?<CgState severity="warning" title="Reconstrucción incompleta">
      Existen {data.unprojectable?.length||0} encuentros históricos que no admiten una proyección segura.
      No se presenta un odontograma actual como definitivo.
    </CgState>:null}
    {known?<Stack gap={1}>
      <CgSelect label="Tipo de observación" value={kind} onChange={(event)=>setKind(event.target.value)}
        options={[{value:'all',label:'Todos'},{value:'surface',label:'Superficies dentales'},{value:'periodontal',label:'Sitios periodontales'}]}/>
      <Box>
        <Typography variant="subtitle2">Estado actual validado</Typography>
        {data.complete&&current.length?current.slice(0,80).map((entry)=>
          <Box key={entry.kind+entry.tooth+(entry.surface||entry.site)} py={.4}>
            <Typography variant="body2"><strong>{'FDI '+entry.tooth}</strong>{' · '+label(entry)}</Typography>
            <Typography variant="caption" color="text.secondary">{date(entry.signedAt)+' · Encuentro '+entry.encounterId}</Typography>
          </Box>):<CgEmptyState title="Sin estado actual confirmado" description={data.complete?'No hay lecturas firmadas de este tipo.':'Revisa primero los registros históricos ambiguos.'}/>}
        {current.length>80?<Typography variant="caption" color="text.secondary">Se muestran 80 registros; usa el expediente para consultar el resto.</Typography>:null}
      </Box>
      <Divider/>
      <Box><Typography variant="subtitle2">Historia de versiones firmadas</Typography>
        {history.length?history.map((entry,index)=>
          <Box key={entry.encounterId+':'+(entry.surface||entry.site)+':'+index} py={.4}>
            <Typography variant="body2">{'FDI '+entry.tooth+' · '+label(entry)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {date(entry.signedAt)+' · '+(entry.status==='amended'?'Versión enmendada':'Versión firmada')+' · Encuentro '+entry.encounterId}
            </Typography>
          </Box>):<CgEmptyState title="Sin encuentros firmados" description="Los borradores clínicos no se confunden con evidencia firmada."/>}
        {filter(data.history).length>50?<Typography variant="caption" color="text.secondary">Se muestran las 50 observaciones más recientes del tipo seleccionado.</Typography>:null}
      </Box>
    </Stack>:null}
  </Paper>;
}
