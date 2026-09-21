import React, { useMemo, useState } from 'react';
import { Box, Checkbox, Divider, FormControlLabel, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';

const today=()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const toWindow=(date,time,durationMin)=>{
  const start=new Date(`${date}T${time||'09:00'}:00`);
  if(Number.isNaN(start.getTime()))throw new Error('Fecha u hora inválida.');
  const end=new Date(start.getTime()+Math.max(15,Number(durationMin||45))*60000);
  return{startsAt:start.toISOString(),endsAt:end.toISOString()};
};
const statusLabel=(status='')=>({
  waitlisted:'Lista de espera',scheduled:'Programada',confirmed:'Confirmada',checked_in:'En sala',
  in_progress:'En atención',completed:'Completada',cancelled:'Cancelada',no_show:'No asistió'
}[String(status).toLowerCase()]||status||'Programada');
const statusTone=(status='')=>{
  const value=String(status).toLowerCase();
  if(['completed','confirmed','checked_in'].includes(value))return'success';
  if(['cancelled','no_show'].includes(value))return'error';
  if(value==='waitlisted')return'info';
  return'warning';
};
const durationMinutes=(item)=>Math.max(0,Math.round((new Date(item.endsAt).getTime()-new Date(item.startsAt).getTime())/60000));

export function DentalSchedulePanel({patientOptions,professionalOptions,appointments,onCreate,onUpdate}){
  const [form,setForm]=useState({patientId:'',professionalId:'',date:today(),time:'09:00',durationMin:'45',room:'Sillón 1',reason:'',waitlisted:false});
  const [busy,setBusy]=useState('');
  const [recallDrafts,setRecallDrafts]=useState({});
  const ordered=useMemo(()=>[...appointments].sort((a,b)=>{
    if(a.status==='waitlisted'&&b.status!=='waitlisted')return 1;
    if(b.status==='waitlisted'&&a.status!=='waitlisted')return-1;
    return new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime();
  }),[appointments]);

  async function submit(event){
    event.preventDefault();
    if(!form.patientId)return;
    setBusy('create');
    try{
      const {startsAt,endsAt}=toWindow(form.date,form.time,form.durationMin);
      const created=await onCreate?.({
        patientId:form.patientId,
        professionalId:form.professionalId||null,
        startsAt,endsAt,
        type:'dentistry',
        status:form.waitlisted?'waitlisted':'scheduled',
        reason:form.reason.trim(),
        channel:'onsite',
        room:form.room.trim(),
        notes:''
      });
      if(created!==false)setForm((current)=>({...current,reason:'',waitlisted:false}));
    }finally{setBusy('');}
  }

  async function update(id,payload){
    setBusy(id);
    try{await onUpdate?.(id,payload);}
    finally{setBusy('');}
  }

  return <Paper className="cg-dental-schedule" variant="outlined" sx={{p:1.5,gridColumn:{lg:'1/-1'}}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Agenda odontológica avanzada</Typography>
        <Typography variant="caption" color="text.secondary">Duración, profesional y sillón se validan contra conflictos antes de reservar.</Typography>
      </Box>
      <CgStatusChip label="Agenda única" tone="primary"/>
    </Stack>
    <Divider sx={{my:1.25}}/>

    <Box component="form" onSubmit={submit} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(3,minmax(0,1fr))'},gap:1}}>
      <CgSelect label="Paciente" value={form.patientId} onChange={(e)=>setForm({...form,patientId:e.target.value})} options={patientOptions}/>
      <CgSelect label="Profesional" value={form.professionalId} onChange={(e)=>setForm({...form,professionalId:e.target.value})} options={professionalOptions}/>
      <CgTextField size="small" fullWidth label="Sillón / recurso" value={form.room} onChange={(e)=>setForm({...form,room:e.target.value})}/>
      <CgTextField size="small" fullWidth label="Fecha preferida" type="date" slotProps={{inputLabel:{shrink:true}}} value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})}/>
      <CgTextField size="small" fullWidth label="Hora preferida" type="time" slotProps={{inputLabel:{shrink:true}}} value={form.time} onChange={(e)=>setForm({...form,time:e.target.value})}/>
      <CgSelect label="Duración" value={form.durationMin} onChange={(e)=>setForm({...form,durationMin:e.target.value})} options={[30,45,60,90,120].map((value)=>({value:String(value),label:`${value} min`}))}/>
      <CgTextField size="small" fullWidth label="Motivo" value={form.reason} onChange={(e)=>setForm({...form,reason:e.target.value})} sx={{gridColumn:{md:'span 2'}}}/>
      <FormControlLabel control={<Checkbox checked={form.waitlisted} onChange={(e)=>setForm({...form,waitlisted:e.target.checked})}/>} label="Agregar a lista de espera"/>
      <Stack direction="row" gap={.8} flexWrap="wrap" sx={{gridColumn:'1/-1'}}>
        <CgButton type="submit" disabled={busy==='create'||!form.patientId}>{busy==='create'?'Guardando…':form.waitlisted?'Agregar a espera':'Reservar cita'}</CgButton>
        <Typography variant="caption" color="text.secondary" alignSelf="center">La lista de espera conserva la franja preferida pero no bloquea profesional ni sillón.</Typography>
      </Stack>
    </Box>

    <Divider sx={{my:1.4}}/>
    {ordered.length?<Stack className="cg-dental-schedule-list" divider={<Divider flexItem/>}>
      {ordered.slice(0,24).map((item)=>{
        const recallValue=recallDrafts[item.id]??(item.recallDueAt?new Date(item.recallDueAt).toISOString().slice(0,10):'');
        return <Stack key={item.id} direction={{xs:'column',lg:'row'}} justifyContent="space-between" gap={1.1} py={1}>
          <Box sx={{minWidth:0}}>
            <Stack direction="row" gap={.6} flexWrap="wrap" alignItems="center">
              <Typography variant="body2" fontWeight={700}>{item.patientName||'Paciente'}</Typography>
              <CgStatusChip label={statusLabel(item.status)} tone={statusTone(item.status)}/>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block">
              {new Date(item.startsAt).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})} · {durationMinutes(item)} min · {item.professionalName||'Sin profesional'} · {item.room||'Sin sillón/recurso'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">{item.reason||'Consulta odontológica'}</Typography>
            {item.recallDueAt?<Typography variant="caption" color="primary.main" display="block">Recall: {new Date(item.recallDueAt).toLocaleDateString('es-VE')}</Typography>:null}
          </Box>
          <Stack direction={{xs:'column',sm:'row'}} gap={.7} alignItems={{sm:'center'}} flexWrap="wrap">
            {item.status==='waitlisted'?<CgButton size="small" variant="outlined" disabled={busy===item.id} onClick={()=>void update(item.id,{status:'scheduled'})}>Intentar programar</CgButton>:null}
            {item.status==='scheduled'?<CgButton size="small" variant="outlined" disabled={busy===item.id} onClick={()=>void update(item.id,{status:'confirmed'})}>Confirmar</CgButton>:null}
            {item.status==='completed'?<>
              <CgTextField size="small" label="Recall" type="date" slotProps={{inputLabel:{shrink:true}}} value={recallValue} onChange={(e)=>setRecallDrafts((current)=>({...current,[item.id]:e.target.value}))}/>
              <CgButton size="small" variant="outlined" disabled={busy===item.id} onClick={()=>void update(item.id,{recallDueAt:recallValue?new Date(`${recallValue}T12:00:00Z`).toISOString():null})}>Guardar recall</CgButton>
            </>:null}
          </Stack>
        </Stack>;
      })}
    </Stack>:<CgEmptyState title="Sin citas odontológicas" description="Reserva una franja o agrega al paciente a la lista de espera."/>}
  </Paper>;
}
