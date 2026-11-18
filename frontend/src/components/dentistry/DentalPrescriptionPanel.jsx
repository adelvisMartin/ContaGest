import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField
} from '../ui/cg/CgPrimitives.jsx';
import { HealthVerticalService } from '../../services/verticalService.js';
import { AuthSession } from '../../services/authSession.js';

// #805: one view of CarePrescription. No second prescription store, private
// browser cache or implied electronic signature / pharmacy inventory mutation.
const sessionScope=()=>{
  const session=AuthSession.get();
  const userId=session?.user?.id||session?.userId||'';
  return session?.tenantId&&userId?session.tenantId+':'+userId:'';
};
const unpack=(value)=>Array.isArray(value)?value:Array.isArray(value?.data)?value.data:[];
const displayStatus={active:'Registrada',completed:'Finalizada',cancelled:'Cancelada'};
const isSignedDentalEncounter=(item,patientId)=>
  item?.patientId===patientId
  && item?.status==='signed'
  && (item?.type==='dental-treatment'||item?.type==='periodontal-chart');

export function DentalPrescriptionPanel({patientId,encounters=[],professionalOptions=[]}){
  const [items,setItems]=useState([]);
  const [readState,setReadState]=useState('idle');
  const [readError,setReadError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [saving,setSaving]=useState(false);
  const [revision,setRevision]=useState(0);
  const [encounterId,setEncounterId]=useState('');
  const [professionalId,setProfessionalId]=useState('');
  const [medication,setMedication]=useState('');
  const [dose,setDose]=useState('');
  const [frequency,setFrequency]=useState('');
  const [duration,setDuration]=useState('');
  const [instructions,setInstructions]=useState('');
  const sequence=useRef(0),savingRef=useRef(false);

  const validEncounters=useMemo(()=>
    encounters.filter((item)=>isSignedDentalEncounter(item,patientId)),[encounters,patientId]);
  const encounterOptions=useMemo(()=>[
    {value:'',label:'Seleccionar consulta dental firmada'},
    ...validEncounters.map((item)=>({
      value:item.id,
      label:String(item.type==='periodontal-chart'?'Periodontograma':'Tratamiento')+' · '+String(item.id).slice(0,10)
    }))
  ],[validEncounters]);

  useEffect(()=>{
    const epoch=++sequence.current,identity=sessionScope();
    setItems([]);setReadError('');setFeedback('');
    if(!patientId||!identity){setReadState('idle');return ()=>{sequence.current+=1;};}
    setReadState('loading');
    void HealthVerticalService.prescriptions(patientId)
      .then((result)=>{
        if(epoch!==sequence.current||identity!==sessionScope())return;
        setItems(unpack(result));setReadState('ready');
      })
      .catch((error)=>{
        if(epoch!==sequence.current||identity!==sessionScope())return;
        setReadError(error?.message||'No se pudo consultar la prescripción.');
        setReadState('error');
      });
    return ()=>{sequence.current+=1;};
  },[patientId,revision]);

  useEffect(()=>{
    const reset=()=>{
      sequence.current+=1;
      setItems([]);setReadError('');setFeedback('');setReadState('idle');
      setEncounterId('');setProfessionalId('');setMedication('');
      setDose('');setFrequency('');setDuration('');setInstructions('');
    };
    window.addEventListener('cg:pwa-session-changed',reset);
    window.addEventListener('cg:auth-expired',reset);
    return ()=>{
      window.removeEventListener('cg:pwa-session-changed',reset);
      window.removeEventListener('cg:auth-expired',reset);
    };
  },[]);

  const canWrite=Boolean(
    patientId&&sessionScope()&&readState==='ready'&&!saving&&validEncounters.some(x=>x.id===encounterId)
    &&professionalOptions.some(x=>x.value===professionalId&&x.value)
    &&medication.trim().length>=2&&dose.trim()&&frequency.trim()&&duration.trim()
  );

  async function submit(event){
    event.preventDefault();
    if(savingRef.current||!canWrite)return;
    const identity=sessionScope(),epoch=sequence.current;
    if(!identity)return;
    savingRef.current=true;setSaving(true);setFeedback('');
    const payload={
      patientId,encounterId,professionalId,medication:medication.trim(),
      dose:dose.trim(),frequency:frequency.trim(),duration:duration.trim(),
      instructions:instructions.trim()||null,status:'active'
    };
    try{
      await HealthVerticalService.createPrescription(payload);
      if(identity!==sessionScope()||epoch!==sequence.current)return;
      setMedication('');setDose('');setFrequency('');setDuration('');setInstructions('');
      setFeedback('Prescripción registrada en la historia clínica. No equivale a firma electrónica ni a dispensación.');
      setRevision((value)=>value+1);
    }catch(error){
      if(identity!==sessionScope()||epoch!==sequence.current)return;
      setReadError('No se pudo confirmar el registro: '+(error?.message||'Error de API')+
        '. Consulta el historial antes de intentar otra operación; no se reenvía automáticamente.');
    }finally{
      savingRef.current=false;
      if(identity===sessionScope()&&epoch===sequence.current)setSaving(false);
    }
  }

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',sm:'row'}} alignItems={{sm:'center'}} justifyContent="space-between" gap={1}>
      <Box><Typography variant="h6">Prescripciones odontológicas</Typography>
        <Typography variant="caption" color="text.secondary">
          Registros del expediente CarePrescription. Sólo una consulta dental firmada puede seleccionarse desde esta vista.
        </Typography></Box>
      <CgStatusChip label="Sin firma electrónica" tone="warning"/>
    </Stack>
    <Divider sx={{my:1.2}}/>
    {!patientId?<CgEmptyState title="Selecciona un paciente" description="Las prescripciones se consultan dentro de la historia activa."/>:null}
    {patientId&&readState==='idle'?<CgState severity="warning" title="Sesión no verificada">No se cargan registros sin una identidad activa.</CgState>:null}
    {readState==='loading'?<CgState severity="info" title="Cargando">Consultando prescripciones existentes.</CgState>:null}
    {readState==='error'?<CgState severity="error" title="Consulta fallida">{readError}</CgState>:null}
    {feedback?<CgState severity="success" title="Registro confirmado">{feedback}</CgState>:null}
    {readError&&readState==='ready'?<CgState severity="warning" title="Operación no confirmada">{readError}</CgState>:null}
    {patientId&&readState==='ready'?<>
      <Box component="form" onSubmit={submit} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1,mt:1}}>
        <CgSelect label="Consulta firmada" value={encounterId} onChange={(e)=>setEncounterId(e.target.value)}
          options={encounterOptions} disabled={saving||validEncounters.length===0}/>
        <CgSelect label="Profesional responsable" value={professionalId}
          onChange={(e)=>setProfessionalId(e.target.value)}
          options={professionalOptions} disabled={saving}/>
        <CgTextField label="Medicamento" value={medication} onChange={(e)=>setMedication(e.target.value)} required
          size="small" fullWidth disabled={saving} inputProps={{maxLength:240}}/>
        <CgTextField label="Dosis" value={dose} onChange={(e)=>setDose(e.target.value)} required
          size="small" fullWidth disabled={saving}/>
        <CgTextField label="Frecuencia" value={frequency} onChange={(e)=>setFrequency(e.target.value)} required
          size="small" fullWidth disabled={saving}/>
        <CgTextField label="Duración" value={duration} onChange={(e)=>setDuration(e.target.value)} required
          size="small" fullWidth disabled={saving}/>
        <CgTextField label="Indicaciones" value={instructions} onChange={(e)=>setInstructions(e.target.value)}
          multiline minRows={2} fullWidth size="small" disabled={saving}
          sx={{gridColumn:'1/-1'}}/>
        <Stack gap={1} sx={{gridColumn:'1/-1'}} alignItems="flex-start">
          {!validEncounters.length?<CgState severity="warning" title="Encuentro requerido">
            Registra, revisa y firma primero una consulta dental.
          </CgState>:null}
          <CgButton type="submit" disabled={!canWrite}>
            {saving?'Guardando…':'Registrar prescripción'}
          </CgButton>
        </Stack>
      </Box>
      <Divider sx={{my:1.5}}/>
      <Typography variant="subtitle1">Historial de prescripciones</Typography>
      {!items.length?<CgEmptyState title="Sin prescripciones registradas"
        description="No hay registros devueltos por el servidor para este paciente."/>:
        <Stack gap={1} mt={1}>
          {items.slice(0,50).map((item)=><Box key={item.id} sx={{py:.5,display:'flex',justifyContent:'space-between',gap:1,flexWrap:'wrap'}}>
            <Box sx={{minWidth:0}}>
              <Typography variant="body2" fontWeight={700}>{item.medication}</Typography>
              <Typography variant="caption" color="text.secondary">
                {[item.dose,item.frequency,item.duration].filter(Boolean).join(' · ')}
                {' · '+(item.professionalName||'Profesional sin nombre visible')}
              </Typography>
              {item.instructions?<Typography variant="body2">{item.instructions}</Typography>:null}
            </Box>
            <CgStatusChip label={displayStatus[item.status]||'Estado sin verificar'}
              tone={item.status==='active'?'warning':'default'}/>
          </Box>)}
          {items.length>50?<Typography variant="caption" color="text.secondary">
            Se muestran 50 de {items.length} registros. Consulta la historia completa para revisar los demás.
          </Typography>:null}
        </Stack>}
    </>:null}
  </Paper>;
}
