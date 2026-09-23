import React, { useEffect, useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgDataTable, CgEmptyState, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { HealthVerticalService } from '../../services/verticalService.js';
import { reportVeterinaryError } from './veterinaryError.js';

export const measurementKinds=[
  {kind:'weight',label:'Peso',unit:'kg'},
  {kind:'temperature',label:'Temperatura',unit:'°C'},
  {kind:'heart_rate',label:'Frecuencia cardíaca',unit:'lpm'},
  {kind:'respiratory_rate',label:'Frecuencia respiratoria',unit:'rpm'}
];

const toNumber=(value)=>Number(value||0);
const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const nextVitalBatchId=()=>{
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const template='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g,(token)=>{
    const value=Math.floor(Math.random()*16);
    const nibble=token==='x'?value:(value&0x3)|0x8;
    return nibble.toString(16);
  });
};
const trendDelta=(current,previous,unit='')=>{
  if(!previous)return 'Sin previo';
  const delta=toNumber(current.value)-toNumber(previous.value);
  if(Math.abs(delta)<0.0001)return 'Sin cambio';
  return `${delta>0?'+':''}${delta.toFixed(2)} ${unit}`.trim();
};

function TrendCard({definition,items}){
  const ordered=[...items].sort((a,b)=>new Date(b.measuredAt||0)-new Date(a.measuredAt||0));
  const current=ordered[0]||null,previous=ordered[1]||null;
  return <Paper variant="outlined" sx={{p:1.2,minWidth:0}}>
    <Typography variant="caption" color="text.secondary">{definition.label}</Typography>
    <Typography variant="h6">{current?`${current.value} ${current.unit||definition.unit}`:'—'}</Typography>
    <Typography variant="caption" color="text.secondary">Tendencia: {current?trendDelta(current,previous,current.unit||definition.unit):'Sin mediciones'}</Typography>
  </Paper>;
}

export function VeterinaryLongitudinalRecord({patient,encounters=[],prescriptions=[],measurements=[],onMeasurementCreated}){
  const [form,setForm]=useState({weight:'',temperature:'',heart_rate:'',respiratory_rate:''});
  const [batchId,setBatchId]=useState(()=>nextVitalBatchId());
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    setForm({weight:'',temperature:'',heart_rate:'',respiratory_rate:''});
    setBatchId(nextVitalBatchId());
    setError('');
  },[patient?.id]);

  const grouped=useMemo(()=>Object.fromEntries(measurementKinds.map((definition)=>[
    definition.kind,
    rows(measurements).filter((item)=>item.kind===definition.kind)
  ])),[measurements]);

  const diagnoses=useMemo(()=>rows(encounters)
    .filter((item)=>item.assessment||rows(item.diagnosisCodes).length)
    .slice(0,12),[encounters]);

  const treatments=useMemo(()=>rows(prescriptions).filter((item)=>item.status!=='cancelled').slice(0,12),[prescriptions]);

  async function submit(event){
    event.preventDefault();
    if(!patient?.id||saving)return;
    const pending=measurementKinds
      .map((definition)=>({definition,value:String(form[definition.kind]||'').trim()}))
      .filter((item)=>item.value!=='');
    if(!pending.length){setError('Registra al menos una medición.');return;}
    const measurements=pending.map((item)=>({
      kind:item.definition.kind,
      value:Number(item.value),
      unit:item.definition.unit
    }));
    if(measurements.some((item)=>!Number.isFinite(item.value))){
      setError('Todas las mediciones deben contener un valor numérico válido.');
      return;
    }

    setSaving(true);setError('');
    try{
      const response=await HealthVerticalService.createVeterinaryVitalMeasurements({
        patientId:patient.id,
        batchId,
        measurements
      });
      const payload=response?.data||response||{};
      const created=rows(payload.measurements);
      if(created.length!==measurements.length){
        throw new Error('La toma no devolvió todas las mediciones esperadas.');
      }
      setForm({weight:'',temperature:'',heart_rate:'',respiratory_rate:''});
      setBatchId(nextVitalBatchId());
      onMeasurementCreated?.(created);
    }catch(cause){
      setError(reportVeterinaryError('longitudinal.saveMeasurements',cause,'No se pudieron guardar las mediciones.'));
    }finally{setSaving(false);}
  }

  const diagnosisColumns=[
    {key:'date',label:'Fecha',render:(item)=>new Date(item.createdAt||item.signedAt||0).toLocaleDateString('es-VE')},
    {key:'diagnosis',label:'Diagnósticos',render:(item)=><Box><Typography variant="body2">{item.assessment||'Sin diagnóstico resumido'}</Typography>{rows(item.diagnosisCodes).length?<Typography variant="caption" color="text.secondary">{rows(item.diagnosisCodes).join(', ')}</Typography>:null}</Box>},
    {key:'plan',label:'Plan',render:(item)=>item.plan||'—'}
  ];
  const treatmentColumns=[
    {key:'medication',label:'Tratamiento',render:(item)=><Box><Typography variant="body2" fontWeight={700}>{item.medication}</Typography><Typography variant="caption">{[item.dose,item.frequency,item.duration].filter(Boolean).join(' · ')||'—'}</Typography></Box>},
    {key:'status',label:'Estado',render:(item)=><CgStatusChip size="small" label={item.status||'active'} tone={item.status==='active'?'success':'default'}/>}
  ];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box><Typography variant="h6">Ficha clínica longitudinal</Typography><Typography variant="caption" color="text.secondary">Problemas activos, alergias, diagnósticos, tratamientos, Peso y signos vitales con Tendencia.</Typography></Box>
      <CgStatusChip label={patient?.displayName||'Sin paciente'} tone={patient?'primary':'default'}/>
    </Stack>
    <Divider sx={{my:1.2}}/>

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>
      <CgState severity={patient?.conditions?'warning':'success'} title="Problemas activos">{patient?.conditions||'Sin problemas activos registrados.'}</CgState>
      <CgState severity={patient?.allergies?'warning':'success'} title="Alergias">{patient?.allergies||'Sin alergias registradas.'}</CgState>
    </Box>

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:1,mt:1.2}}>
      {measurementKinds.map((definition)=><TrendCard key={definition.kind} definition={definition} items={grouped[definition.kind]||[]}/>)}
    </Box>

    <Box component="form" onSubmit={submit} sx={{mt:1.2}}>
      <Typography variant="subtitle1" fontWeight={700}>Última medición / nueva toma</Typography>
      <Typography variant="caption" color="text.secondary">La toma se guarda como un batch atómico y reintentable: no deja signos vitales a medias.</Typography>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:1,mt:.8}}>
        {measurementKinds.map((definition)=><CgTextField key={definition.kind} size="small" label={`${definition.label} (${definition.unit})`} type="number" inputProps={{step:(definition.kind==='weight'||definition.kind==='temperature')?0.1:1}} value={form[definition.kind]} onChange={(e)=>setForm({...form,[definition.kind]:e.target.value})}/>)}
      </Box>
      {error?<Box mt={1}><CgState severity="error" title="No se guardaron las mediciones">{error}</CgState></Box>:null}
      <CgButton type="submit" disabled={!patient||saving} sx={{mt:1}}>{saving?'Guardando…':'Guardar mediciones'}</CgButton>
    </Box>

    <Divider sx={{my:1.5}}/>
    <Typography variant="h6">Diagnósticos</Typography>
    <Box sx={{mt:.8,maxWidth:'100%',overflowX:'auto'}}>{diagnoses.length?<CgDataTable columns={diagnosisColumns} rows={diagnoses} empty="Sin diagnósticos"/>:<CgEmptyState title="Sin diagnósticos registrados" description="Las consultas con assessment/diagnosisCodes aparecerán aquí."/>}</Box>

    <Divider sx={{my:1.5}}/>
    <Typography variant="h6">Tratamientos</Typography>
    <Box sx={{mt:.8,maxWidth:'100%',overflowX:'auto'}}>{treatments.length?<CgDataTable columns={treatmentColumns} rows={treatments} empty="Sin tratamientos"/>:<CgEmptyState title="Sin tratamientos activos" description="Las prescripciones vigentes aparecerán aquí."/>}</Box>
  </Paper>;
}
