import React,{useEffect,useRef,useState} from 'react';
import {Box,Divider,Paper,Stack,Typography} from '@mui/material';
import {CgEmptyState,CgState,CgStatusChip} from '../ui/cg/CgPrimitives.jsx';
import {HealthVerticalService} from '../../services/verticalService.js';
import {AuthSession} from '../../services/authSession.js';
import {projectDentalClinicalAlerts} from './dental-clinical-alerts.mjs';

const labels={allergy:'Alergia declarada',medication:'Medicamento registrado',problem:'Problema de salud registrado'};
const scope=()=>{
  const session=AuthSession.get();
  return session?.tenantId&&session?.user?.id?session.tenantId+':'+session.user.id:'';
};
const safeDate=(value)=>{
  const time=Date.parse(value);
  return Number.isFinite(time)?new Date(time).toLocaleDateString('es-VE'):'Sin fecha verificada';
};

export function DentalClinicalAlertsPanel({patientId}){
  const [page,setPage]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const seq=useRef(0);
  useEffect(()=>{
    const version=++seq.current,identity=scope();
    setPage(null);setError('');
    if(!patientId||!identity){setLoading(false);return undefined;}
    setLoading(true);
    void HealthVerticalService.clinicalFacts(patientId)
      .then((response)=>{
        if(version===seq.current&&scope()===identity)
          setPage(response?.data||response);
      })
      .catch((cause)=>{
        if(version===seq.current&&scope()===identity)
          setError(cause?.message||'No se pudo verificar el historial clínico.');
      })
      .finally(()=>{if(version===seq.current)setLoading(false);});
    return()=>{seq.current+=1;};
  },[patientId]);
  useEffect(()=>{
    const reset=()=>{seq.current+=1;setPage(null);setError('');setLoading(false);};
    window.addEventListener('cg:pwa-session-changed',reset);
    return()=>window.removeEventListener('cg:pwa-session-changed',reset);
  },[]);
  const snapshot=projectDentalClinicalAlerts(page);
  const hasData=page!==null&&Boolean(patientId);
  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}>
      <Box><Typography variant="h6">Antecedentes y alertas revisadas</Typography>
        <Typography variant="caption" color="text.secondary">
          Proyección de los hechos clínicos con revisión profesional. No reemplaza la anamnesis ni emite diagnósticos automáticos.
        </Typography></Box>
      {hasData?<CgStatusChip label={snapshot.complete?'Consulta verificada':'Revisión requerida'}
        tone={snapshot.complete?'success':'warning'}/>:null}
    </Stack>
    <Divider sx={{my:1}}/>
    {!patientId?<CgEmptyState title="Selecciona un paciente" description="Consulta antecedentes solo desde el expediente activo."/>:null}
    {loading?<CgState severity="info" title="Cargando antecedentes">Verificando el registro clínico.</CgState>:null}
    {error?<CgState severity="error" title="Antecedentes no disponibles">{error}</CgState>:null}
    {hasData&&!snapshot.complete?<CgState severity="warning" title="Historial incompleto">
      Existe otra página de hechos clínicos o una respuesta no verificable. No se declara ausencia de alertas.
    </CgState>:null}
    {hasData&&snapshot.complete?<Stack gap={.8}>
      {snapshot.unverified>0?<CgState severity="warning" title="Registros sin revisión">
        Existen {snapshot.unverified} hechos declarados o enmendados aún no revisados; no se presentan como alertas confirmadas.
      </CgState>:null}
      {snapshot.alerts.length?snapshot.alerts.map((item)=>
        <Box key={item.id} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'minmax(0,1fr) auto'},gap:.5,py:.4}}>
          <Box><Typography variant="body2" fontWeight={700}>{labels[item.kind]||'Antecedente'}: {item.descriptor}</Typography>
            <Typography variant="caption" color="text.secondary">
              {'Fecha efectiva '+safeDate(item.effectiveAt)+' · Revisión '+safeDate(item.reviewedAt)}
              {item.sourceId?' · Referencia a encuentro '+item.sourceId:''}
            </Typography></Box>
          <CgStatusChip label={item.status==='resolved'?'Resolución declarada':'Revisado; vigencia por confirmar'}
            tone={item.status==='resolved'?'info':'warning'}/>
        </Box>
      ):<CgEmptyState title="Sin hechos revisados de estas categorías"
        description="Esta consulta no sustituye la verificación de alergias, medicamentos y antecedentes con el paciente."/>}
      <Typography variant="caption" color="text.secondary">
        Fuente: CareClinicalFact. Los registros en borrador y versiones sustituidas no se muestran como vigentes.
      </Typography>
    </Stack>:null}
  </Paper>;
}
