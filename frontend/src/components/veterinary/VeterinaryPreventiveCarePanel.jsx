import React, { useMemo, useState } from 'react';
import { Box, Divider, FormControlLabel, Paper, Stack, Switch, Typography } from '@mui/material';
import { CgButton, CgDataTable, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { HealthVerticalService, VeterinaryService } from '../../services/verticalService.js';
import { reportVeterinaryError } from './veterinaryError.js';

const localDate=()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const statusForDue=(value)=>{
  if(!value)return {label:'Sin vencimiento',tone:'default'};
  const due=new Date(value).getTime(),now=Date.now(),days=Math.ceil((due-now)/86400000);
  if(days<0)return {label:'Vencido',tone:'error'};
  if(days<=30)return {label:'Próximo',tone:'warning'};
  return {label:'Al día',tone:'success'};
};
const reminderAt=(dueAt,daysBefore)=>{
  const due=new Date(dueAt);
  const when=new Date(due.getTime()-Math.max(0,Number(daysBefore||0))*86400000);
  return new Date(Math.max(Date.now(),when.getTime())).toISOString();
};

export function VeterinaryPreventiveCarePanel({
  patient,
  professionals=[],
  encounters=[],
  immunizations=[],
  onCreated
}){
  const [kind,setKind]=useState('vaccine');
  const [professionalId,setProfessionalId]=useState('');
  const [name,setName]=useState('');
  const [dose,setDose]=useState('');
  const [lot,setLot]=useState('');
  const [performedAt,setPerformedAt]=useState(localDate());
  const [nextDueAt,setNextDueAt]=useState('');
  const [notes,setNotes]=useState('');
  const [reminderEnabled,setReminderEnabled]=useState(false);
  const [reminderChannel,setReminderChannel]=useState('whatsapp');
  const [reminderDays,setReminderDays]=useState('7');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  const preventiveEncounters=useMemo(()=>rows(encounters)
    .filter((item)=>item.type==='veterinary-preventive'&&item.clinicalData?.preventiveCare),[encounters]);

  const preventiveEvents=useMemo(()=>{
    const vaccines=rows(immunizations).map((item)=>({
      id:item.id,
      kind:'vaccine',
      label:item.vaccine,
      performedAt:item.administeredAt,
      nextDueAt:item.nextDueAt,
      professionalName:item.professionalName||'—',
      source:item
    }));
    const others=preventiveEncounters.map((item)=>({
      id:item.id,
      kind:item.clinicalData.preventiveCare.kind,
      label:item.clinicalData.preventiveCare.name,
      performedAt:item.clinicalData.preventiveCare.performedAt||item.createdAt,
      nextDueAt:item.clinicalData.preventiveCare.nextDueAt,
      professionalName:item.professionalName||'—',
      source:item
    }));
    return [...vaccines,...others].sort((a,b)=>new Date(b.performedAt||0)-new Date(a.performedAt||0));
  },[immunizations,preventiveEncounters]);

  const dueItems=useMemo(()=>preventiveEvents
    .filter((item)=>item.nextDueAt)
    .sort((a,b)=>new Date(a.nextDueAt)-new Date(b.nextDueAt)),[preventiveEvents]);

  const recipient=reminderChannel==='whatsapp'
    ? String(patient?.guardianPhone||'').replace(/\D/g,'')
    : String(patient?.guardianEmail||'').trim();

  async function scheduleReminder(event){
    if(!reminderEnabled||!event.nextDueAt)return null;
    if(!recipient)throw new Error(reminderChannel==='whatsapp'?'El tutor no tiene teléfono para el recordatorio.':'El tutor no tiene correo para el recordatorio.');
    return VeterinaryService.createCommunication({
      patientId:patient.id,
      appointmentId:null,
      channel:reminderChannel,
      event:'preventive_due_reminder',
      recipient,
      status:'queued',
      scheduledAt:reminderAt(event.nextDueAt,reminderDays),
      sentAt:null,
      payload:{
        preventiveKind:event.kind,
        preventiveName:event.label,
        nextDueAt:event.nextDueAt,
        daysBefore:Number(reminderDays||0)
      }
    });
  }

  async function submit(event){
    event.preventDefault();
    if(!patient?.id||!name.trim()){setError('Selecciona una mascota e indica el preventivo.');return;}
    if(reminderEnabled&&!nextDueAt){setError('El recordatorio requiere un próximo vencimiento.');return;}
    setSaving(true);setError('');
    try{
      let created;
      if(kind==='vaccine'){
        created=await HealthVerticalService.createImmunization({
          patientId:patient.id,
          professionalId:professionalId||null,
          vaccine:name.trim(),
          dose:dose.trim()||null,
          lot:lot.trim()||null,
          administeredAt:performedAt?new Date(`${performedAt}T12:00:00`).toISOString():undefined,
          nextDueAt:nextDueAt?new Date(`${nextDueAt}T12:00:00`).toISOString():null,
          notes:notes.trim()||null
        });
      }else{
        created=await HealthVerticalService.createEncounter({
          patientId:patient.id,
          professionalId:professionalId||null,
          specialty:'veterinary-preventive',
          type:'veterinary-preventive',
          subjective:'',
          objective:name.trim(),
          assessment:'',
          plan:notes.trim(),
          diagnosisCodes:[],
          clinicalData:{preventiveCare:{
            kind,
            name:name.trim(),
            performedAt:performedAt?new Date(`${performedAt}T12:00:00`).toISOString():null,
            nextDueAt:nextDueAt?new Date(`${nextDueAt}T12:00:00`).toISOString():null,
            notes:notes.trim()||null
          }},
          confidential:false,
          status:'signed'
        });
      }
      const eventRecord=kind==='vaccine'
        ? {id:created.id,kind,label:created.vaccine,performedAt:created.administeredAt,nextDueAt:created.nextDueAt,source:created}
        : {id:created.id,kind,label:created.clinicalData?.preventiveCare?.name||name.trim(),performedAt:created.clinicalData?.preventiveCare?.performedAt||created.createdAt,nextDueAt:created.clinicalData?.preventiveCare?.nextDueAt,source:created};
      const reminder=await scheduleReminder(eventRecord);
      onCreated?.({kind,record:created,reminder});
      setName('');setDose('');setLot('');setNotes('');setNextDueAt('');setReminderEnabled(false);
    }catch(cause){
      setError(reportVeterinaryError('preventive.save',cause,'No se registró el cuidado preventivo.'));
    }
    finally{setSaving(false);}
  }

  const columns=[
    {key:'kind',label:'Tipo',render:(item)=>item.kind==='vaccine'?'Vacuna':item.kind==='deworming'?'Desparasitación':'Control preventivo'},
    {key:'label',label:'Preventivo'},
    {key:'performedAt',label:'Realizado',render:(item)=>item.performedAt?new Date(item.performedAt).toLocaleDateString('es-VE'):'—'},
    {key:'nextDueAt',label:'Próximo vencimiento',render:(item)=>item.nextDueAt?new Date(item.nextDueAt).toLocaleDateString('es-VE'):'—'},
    {key:'status',label:'Estado',render:(item)=>{const state=statusForDue(item.nextDueAt);return <CgStatusChip size="small" label={state.label} tone={state.tone}/>;}}
  ];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box><Typography variant="h6">Preventivos y estándares de cuidado</Typography><Typography variant="caption" color="text.secondary">Vacunas, Desparasitación, Control preventivo y Próximos vencimientos con Recordatorio configurable.</Typography></Box>
      <CgStatusChip label={dueItems.filter((item)=>statusForDue(item.nextDueAt).label!=='Al día').length?`${dueItems.filter((item)=>statusForDue(item.nextDueAt).label!=='Al día').length} por atender`:'Al día'} tone={dueItems.some((item)=>statusForDue(item.nextDueAt).label==='Vencido')?'error':'success'}/>
    </Stack>
    <Divider sx={{my:1.2}}/>

    <Box component="form" onSubmit={submit}>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(3,minmax(0,1fr))'},gap:1}}>
        <CgSelect label="Tipo" value={kind} onChange={(e)=>setKind(e.target.value)} options={[{value:'vaccine',label:'Vacuna'},{value:'deworming',label:'Desparasitación'},{value:'checkup',label:'Control preventivo'}]}/>
        <CgSelect label="Profesional" value={professionalId} onChange={(e)=>setProfessionalId(e.target.value)} options={[{value:'',label:'Sin asignar'},...rows(professionals).map((item)=>({value:item.id,label:item.fullName||'Profesional'}))]}/>
        <CgTextField label={kind==='vaccine'?'Vacuna / biológico':'Preventivo'} required value={name} onChange={(e)=>setName(e.target.value)}/>
        {kind==='vaccine'?<><CgTextField label="Dosis" value={dose} onChange={(e)=>setDose(e.target.value)}/><CgTextField label="Lote" value={lot} onChange={(e)=>setLot(e.target.value)}/></>:null}
        <CgTextField label="Fecha realizada" type="date" slotProps={{inputLabel:{shrink:true}}} value={performedAt} onChange={(e)=>setPerformedAt(e.target.value)}/>
        <CgTextField label="Próximo vencimiento" type="date" slotProps={{inputLabel:{shrink:true}}} value={nextDueAt} onChange={(e)=>setNextDueAt(e.target.value)}/>
      </Box>
      <CgTextField fullWidth multiline minRows={2} label="Notas" value={notes} onChange={(e)=>setNotes(e.target.value)} sx={{mt:1}}/>

      <Paper variant="outlined" sx={{p:1.1,mt:1}}>
        <FormControlLabel control={<Switch checked={reminderEnabled} onChange={(e)=>setReminderEnabled(e.target.checked)}/>} label="Programar Recordatorio"/>
        {reminderEnabled?<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:1,mt:.5}}>
          <CgSelect label="Canal" value={reminderChannel} onChange={(e)=>setReminderChannel(e.target.value)} options={[{value:'whatsapp',label:'WhatsApp'},{value:'email',label:'Correo'}]}/>
          <CgSelect label="Anticipación" value={reminderDays} onChange={(e)=>setReminderDays(e.target.value)} options={['1','3','7','14','30'].map((value)=>({value,label:`${value} días antes`}))}/>
        </Box>:null}
        {reminderEnabled&&!recipient?<Typography variant="caption" color="error" display="block" mt={.5}>El tutor no tiene el dato requerido para este Canal.</Typography>:null}
      </Paper>

      {error?<Box mt={1}><CgState severity="error" title="No se registró el preventivo">{error}</CgState></Box>:null}
      <CgButton type="submit" disabled={!patient||saving} sx={{mt:1}}>{saving?'Guardando…':'Registrar preventivo'}</CgButton>
    </Box>

    <Divider sx={{my:1.5}}/>
    <Typography variant="h6">Próximos vencimientos</Typography>
    <Box sx={{mt:.8,maxWidth:'100%',overflowX:'auto'}}>{dueItems.length?<CgDataTable columns={columns} rows={dueItems} empty="Sin vencimientos"/>:<CgEmptyState title="Sin próximos vencimientos" description="Los preventivos con fecha futura aparecerán aquí."/>}</Box>

    <Divider sx={{my:1.5}}/>
    <Typography variant="h6">Historial preventivo</Typography>
    <Box sx={{mt:.8,maxWidth:'100%',overflowX:'auto'}}>{preventiveEvents.length?<CgDataTable columns={columns} rows={preventiveEvents} empty="Sin preventivos"/>:<CgEmptyState title="Sin preventivos registrados" description="Registra vacunas, desparasitación o controles preventivos."/>}</Box>
  </Paper>;
}
