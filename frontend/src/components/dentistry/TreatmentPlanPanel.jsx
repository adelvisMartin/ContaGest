import React, { useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgDataTable, CgDialog, CgEmptyState, CgMoney, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { PERMANENT_TEETH, PRIMARY_TEETH } from './dentalCatalog.js';

let localCounter=0;
const localId=(prefix)=>`${prefix}-${++localCounter}`;
const emptyAlternative=()=>({_key:localId('alt'),name:'',description:''});
const emptyProcedure=()=>({_key:localId('proc'),name:'',tooth:'',quantity:'1',unitPrice:'0'});
const emptyPhase=(order=1)=>({_key:localId('phase'),order,name:`Fase ${order}`,procedures:[emptyProcedure()]});
const allTeeth=[...PERMANENT_TEETH,...PRIMARY_TEETH];

const planTone=(status)=>status==='accepted'?'success':status==='rejected'?'error':'warning';
const planLabel=(status)=>status==='accepted'?'Aceptado':status==='rejected'?'Rechazado':'Propuesto';

export function TreatmentPlanPanel({
  selectedPatientId,
  onPatientChange,
  patientOptions,
  professionalOptions,
  encounters,
  onCreate,
  onDecision
}){
  const [professionalId,setProfessionalId]=useState('');
  const [diagnosis,setDiagnosis]=useState('');
  const [alternatives,setAlternatives]=useState([emptyAlternative()]);
  const [phases,setPhases]=useState([emptyPhase(1)]);
  const [currency,setCurrency]=useState('VES');
  const [saving,setSaving]=useState(false);
  const [decisionTarget,setDecisionTarget]=useState(null);
  const [decision,setDecision]=useState('accepted');
  const [decisionReason,setDecisionReason]=useState('');

  const plans=useMemo(()=>encounters
    .filter((item)=>item.type==='dental-treatment-plan'&&item.clinicalData?.treatmentPlan)
    .sort((left,right)=>new Date(right.createdAt||0)-new Date(left.createdAt||0)),[encounters]);

  const previewTotal=useMemo(()=>phases.reduce((total,phase)=>total+phase.procedures.reduce((sum,procedure)=>sum+(Number(procedure.quantity||0)*Number(procedure.unitPrice||0)),0),0),[phases]);

  function updateAlternative(key,patch){
    setAlternatives((current)=>current.map((item)=>item._key===key?{...item,...patch}:item));
  }
  function updatePhase(key,patch){
    setPhases((current)=>current.map((item)=>item._key===key?{...item,...patch}:item));
  }
  function updateProcedure(phaseKey,procedureKey,patch){
    setPhases((current)=>current.map((phase)=>phase._key===phaseKey?{
      ...phase,
      procedures:phase.procedures.map((procedure)=>procedure._key===procedureKey?{...procedure,...patch}:procedure)
    }:phase));
  }
  function addPhase(){
    setPhases((current)=>[...current,emptyPhase(current.length+1)]);
  }
  function removePhase(key){
    setPhases((current)=>current.length===1?current:current.filter((item)=>item._key!==key).map((item,index)=>({...item,order:index+1})));
  }
  function addProcedure(phaseKey){
    setPhases((current)=>current.map((phase)=>phase._key===phaseKey?{...phase,procedures:[...phase.procedures,emptyProcedure()]}:phase));
  }
  function removeProcedure(phaseKey,procedureKey){
    setPhases((current)=>current.map((phase)=>phase._key===phaseKey&&phase.procedures.length>1?{...phase,procedures:phase.procedures.filter((item)=>item._key!==procedureKey)}:phase));
  }
  function reset(){
    setDiagnosis('');
    setAlternatives([emptyAlternative()]);
    setPhases([emptyPhase(1)]);
    setCurrency('VES');
  }

  async function submit(event){
    event.preventDefault();
    if(!selectedPatientId||!diagnosis.trim())return;
    if(alternatives.some((item)=>!item.name.trim()))return;
    if(phases.some((phase)=>!phase.name.trim()||phase.procedures.some((procedure)=>!procedure.name.trim())))return;
    setSaving(true);
    try{
      const created=await onCreate?.({
        professionalId:professionalId||null,
        diagnosis:diagnosis.trim(),
        alternatives:alternatives.map(({name,description})=>({name:name.trim(),description:description.trim()||null})),
        phases:phases.map((phase,index)=>({
          order:index+1,
          name:phase.name.trim(),
          procedures:phase.procedures.map(({name,tooth,quantity,unitPrice})=>({
            name:name.trim(),
            tooth:tooth||null,
            quantity:Number(quantity||1),
            unitPrice:String(unitPrice||'0')
          }))
        })),
        budget:{currency}
      });
      if(created!==false)reset();
    }finally{setSaving(false);}
  }

  async function confirmDecision(){
    if(!decisionTarget)return;
    if(decision==='rejected'&&!decisionReason.trim())return;
    const done=await onDecision?.(decisionTarget.id,{decision,reason:decisionReason.trim()||null});
    if(done!==false){setDecisionTarget(null);setDecision('accepted');setDecisionReason('');}
  }

  const planColumns=[
    {key:'date',label:'Fecha',render:(row)=>new Date(row.createdAt).toLocaleDateString('es-VE')},
    {key:'diagnosis',label:'Diagnóstico',render:(row)=>row.clinicalData.treatmentPlan.diagnosis},
    {key:'phases',label:'Fases',align:'right',render:(row)=>row.clinicalData.treatmentPlan.phases?.length||0},
    {key:'budget',label:'Presupuesto estimado',align:'right',render:(row)=><CgMoney value={row.clinicalData.treatmentPlan.budget?.estimatedTotal||0} currency={row.clinicalData.treatmentPlan.budget?.currency||'VES'}/>},
    {key:'status',label:'Estado',render:(row)=>{const status=row.clinicalData.treatmentPlan.status;return <CgStatusChip size="small" label={planLabel(status)} tone={planTone(status)}/>;}},
    {key:'acceptance',label:'Decisión',render:(row)=>{
      const acceptance=row.clinicalData.treatmentPlan.acceptance||{status:'pending'};
      if(acceptance.status==='pending')return <CgStatusChip size="small" label="Pendiente" tone="warning"/>;
      return <Box><CgStatusChip size="small" label={acceptance.status==='accepted'?'Aceptado':'Rechazado'} tone={acceptance.status==='accepted'?'success':'error'}/><Typography variant="caption" display="block" color="text.secondary">{acceptance.actor?.email||acceptance.actor?.userId||'Usuario autenticado'}</Typography></Box>;
    }},
    {key:'actions',label:'Acciones',render:(row)=>row.status==='draft'?<Stack direction="row" gap={.5} flexWrap="wrap"><CgButton size="small" onClick={()=>{setDecisionTarget(row);setDecision('accepted');setDecisionReason('');}}>Aceptar plan</CgButton><CgButton size="small" variant="outlined" color="error" onClick={()=>{setDecisionTarget(row);setDecision('rejected');setDecisionReason('');}}>Rechazar plan</CgButton></Stack>:null}
  ];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Typography variant="h6">Plan de tratamiento</Typography>
    <Typography variant="caption" color="text.secondary">Diagnóstico → alternativas → fases → procedimientos → presupuesto estimado → decisión operativa.</Typography>
    <Divider sx={{my:1.2}}/>
    <CgState severity="info" title="Aceptación ≠ consentimiento">Aceptar un plan aquí registra una decisión operativa con actor y fecha. No representa firma ni consentimiento clínico; esa evidencia se gestiona por separado.</CgState>

    <Box component="form" onSubmit={submit} sx={{mt:1.2}}>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>
        <CgSelect label="Paciente" value={selectedPatientId} onChange={(e)=>onPatientChange?.(e.target.value)} options={patientOptions}/>
        <CgSelect label="Profesional" value={professionalId} onChange={(e)=>setProfessionalId(e.target.value)} options={professionalOptions}/>
      </Box>
      <CgTextField fullWidth multiline minRows={2} label="Diagnóstico" required value={diagnosis} onChange={(e)=>setDiagnosis(e.target.value)} sx={{mt:1}}/>

      <Stack gap={1} mt={1.2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="subtitle1" fontWeight={700}>Alternativas</Typography><CgButton type="button" size="small" variant="outlined" onClick={()=>setAlternatives((current)=>[...current,emptyAlternative()])}>Agregar alternativa</CgButton></Stack>
        {alternatives.map((alternative,index)=><Paper key={alternative._key} variant="outlined" sx={{p:1}}><Stack direction={{xs:'column',md:'row'}} gap={1}><CgTextField fullWidth label={`Alternativa ${index+1}`} required value={alternative.name} onChange={(e)=>updateAlternative(alternative._key,{name:e.target.value})}/><CgTextField fullWidth label="Descripción" value={alternative.description} onChange={(e)=>updateAlternative(alternative._key,{description:e.target.value})}/><CgButton type="button" variant="outlined" color="error" disabled={alternatives.length===1} onClick={()=>setAlternatives((current)=>current.filter((item)=>item._key!==alternative._key))}>Quitar</CgButton></Stack></Paper>)}
      </Stack>

      <Stack gap={1.2} mt={1.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="subtitle1" fontWeight={700}>Fases y procedimientos</Typography><CgButton type="button" size="small" variant="outlined" onClick={addPhase}>Agregar fase</CgButton></Stack>
        {phases.map((phase,phaseIndex)=><Paper key={phase._key} variant="outlined" sx={{p:1.2}}><Stack direction="row" gap={1} alignItems="center"><CgTextField fullWidth label={`Fase ${phaseIndex+1}`} required value={phase.name} onChange={(e)=>updatePhase(phase._key,{name:e.target.value})}/><CgButton type="button" variant="outlined" color="error" disabled={phases.length===1} onClick={()=>removePhase(phase._key)}>Quitar fase</CgButton></Stack><Stack gap={.8} mt={1}>{phase.procedures.map((procedure)=><Box key={procedure._key} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(180px,2fr) minmax(110px,.8fr) minmax(90px,.6fr) minmax(120px,.8fr) auto'},gap:.8,alignItems:'center'}}><CgTextField label="Procedimiento" required value={procedure.name} onChange={(e)=>updateProcedure(phase._key,procedure._key,{name:e.target.value})}/><CgSelect label="Pieza" value={procedure.tooth} onChange={(e)=>updateProcedure(phase._key,procedure._key,{tooth:e.target.value})} options={[{value:'',label:'No aplica'},...allTeeth.map((value)=>({value,label:value}))]}/><CgTextField label="Cantidad" type="number" inputProps={{min:1,max:99,step:1}} value={procedure.quantity} onChange={(e)=>updateProcedure(phase._key,procedure._key,{quantity:e.target.value})}/><CgTextField label="Precio unitario" type="number" inputProps={{min:0,step:.01}} value={procedure.unitPrice} onChange={(e)=>updateProcedure(phase._key,procedure._key,{unitPrice:e.target.value})}/><CgButton type="button" variant="outlined" color="error" disabled={phase.procedures.length===1} onClick={()=>removeProcedure(phase._key,procedure._key)}>Quitar</CgButton></Box>)}</Stack><CgButton type="button" size="small" variant="outlined" sx={{mt:1}} onClick={()=>addProcedure(phase._key)}>Agregar procedimiento</CgButton></Paper>)}
      </Stack>

      <Paper variant="outlined" sx={{p:1.2,mt:1.5}}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}><Box><Typography variant="subtitle1" fontWeight={700}>Presupuesto estimado</Typography><Typography variant="caption" color="text.secondary">Vista previa UI; el backend recalcula el total exacto antes de persistir.</Typography></Box><Stack direction="row" gap={1} alignItems="center"><CgSelect label="Moneda" value={currency} onChange={(e)=>setCurrency(e.target.value)} options={[{value:'VES',label:'VES'},{value:'USD',label:'USD'}]}/><Typography variant="h6"><CgMoney value={previewTotal} currency={currency}/></Typography></Stack></Stack></Paper>
      <CgButton type="submit" disabled={!selectedPatientId||saving} sx={{mt:1.2}}>{saving?'Guardando…':'Guardar plan propuesto'}</CgButton>
    </Box>

    <Divider sx={{my:1.5}}/>
    <Typography variant="h6">Planes registrados</Typography>
    <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}>{plans.length?<CgDataTable columns={planColumns} rows={plans} empty="Sin planes"/>:<CgEmptyState title="Sin planes de tratamiento" description="Crea el primer plan propuesto para este paciente."/>}</Box>

    <CgDialog open={Boolean(decisionTarget)} title={decision==='accepted'?'Aceptar plan':'Rechazar plan'} onClose={()=>setDecisionTarget(null)} confirmLabel={decision==='accepted'?'Aceptar plan':'Rechazar plan'} destructive={decision==='rejected'} onConfirm={()=>void confirmDecision()}>
      <Stack gap={1} pt={1}><CgState severity={decision==='accepted'?'info':'warning'} title="Decisión operativa">{decision==='accepted'?'Se registrará actor y fecha. Esto no sustituye el consentimiento firmado.':'El rechazo es terminal para este plan propuesto y requiere un motivo.'}</CgState>{decision==='rejected'?<CgTextField autoFocus fullWidth multiline minRows={2} label="Motivo del rechazo" required value={decisionReason} onChange={(e)=>setDecisionReason(e.target.value)}/>:null}</Stack>
    </CgDialog>
  </Paper>;
}
