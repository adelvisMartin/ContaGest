import React, { useEffect, useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgDialog, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField
} from '../ui/cg/CgPrimitives.jsx';
import { HealthVerticalService } from '../../services/verticalService.js';

const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const localDateTime=(offsetMinutes=60)=>{
  const value=new Date(Date.now()+offsetMinutes*60000);
  return new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,16);
};
const isoFromLocal=(value)=>{
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))throw new Error('Fecha u hora inválida.');
  return date.toISOString();
};
const appointmentTone=(status)=>status==='confirmed'?'success':['cancelled','no_show'].includes(status)?'error':status==='completed'?'success':'warning';
const appointmentLabel=(status)=>({scheduled:'Programada',confirmed:'Confirmada',cancelled:'Cancelada',no_show:'No asistió',completed:'Completada',checked_in:'En sala',in_progress:'En atención'})[status]||status;
const resourceKindLabel=(kind)=>({chair:'Sillón',room:'Consultorio',equipment:'Equipo'})[kind]||kind;

export function DentalSchedulePanel({patientOptions=[],professionalOptions=[],selectedPatientId='',notify=()=>{},onAppointmentsChanged}){
  const [tab,setTab]=useState(0);
  const [resources,setResources]=useState([]);
  const [appointments,setAppointments]=useState([]);
  const [waitlist,setWaitlist]=useState([]);
  const [recalls,setRecalls]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');

  const [resourceForm,setResourceForm]=useState({name:'',kind:'chair'});
  const [appointmentForm,setAppointmentForm]=useState({patientId:selectedPatientId||'',professionalId:'',resourceId:'',startsAt:localDateTime(),durationMinutes:'45',reason:'',notes:'',recallId:null});
  const [waitlistForm,setWaitlistForm]=useState({patientId:selectedPatientId||'',professionalId:'',resourceId:'',reason:'',preferredFrom:'',preferredTo:'',durationMinutes:'45',priority:'3',notes:''});
  const [recallForm,setRecallForm]=useState({patientId:selectedPatientId||'',professionalId:'',dueAt:localDateTime(30*24*60),kind:'Control odontológico',notes:''});
  const [confirmation,setConfirmation]=useState(null);
  const [confirmationReason,setConfirmationReason]=useState('');
  const [bookingTarget,setBookingTarget]=useState(null);
  const [bookingForm,setBookingForm]=useState({startsAt:localDateTime(),professionalId:'',resourceId:'',durationMinutes:'45',notes:''});

  const activeResources=useMemo(()=>resources.filter((item)=>item.active!==false),[resources]);
  const resourceOptions=useMemo(()=>[{value:'',label:'Seleccionar recurso'},...activeResources.map((item)=>({value:item.id,label:`${resourceKindLabel(item.kind)} · ${item.name}`}))],[activeResources]);
  const optionalResourceOptions=useMemo(()=>[{value:'',label:'Cualquier recurso'},...resourceOptions.slice(1)],[resourceOptions]);
  const requiredProfessionalOptions=useMemo(()=>[{value:'',label:'Seleccionar profesional'},...professionalOptions.filter((item)=>item.value)],[professionalOptions]);
  const optionalProfessionalOptions=useMemo(()=>[{value:'',label:'Cualquier profesional'},...professionalOptions.filter((item)=>item.value)],[professionalOptions]);

  useEffect(()=>{
    if(!selectedPatientId)return;
    setAppointmentForm((current)=>({...current,patientId:selectedPatientId}));
    setWaitlistForm((current)=>({...current,patientId:selectedPatientId}));
    setRecallForm((current)=>({...current,patientId:selectedPatientId}));
  },[selectedPatientId]);

  async function loadAll({silent=false}={}){
    if(!silent)setLoading(true);
    setError('');
    try{
      const now=Date.now();
      const [resourceRows,appointmentRows,waitlistRows,recallRows]=await Promise.all([
        HealthVerticalService.dentalResources(),
        HealthVerticalService.dentalAppointments({from:new Date(now-86400000).toISOString(),to:new Date(now+45*86400000).toISOString()}),
        HealthVerticalService.dentalWaitlist({status:'all'}),
        HealthVerticalService.dentalRecalls({status:'all'})
      ]);
      setResources(rows(resourceRows));
      setAppointments(rows(appointmentRows));
      setWaitlist(rows(waitlistRows));
      setRecalls(rows(recallRows));
    }catch(cause){
      const message=cause?.message||'No se pudo cargar la agenda odontológica.';
      setError(message);
      if(!silent)notify(message,'error');
    }finally{if(!silent)setLoading(false);}
  }

  useEffect(()=>{void loadAll({silent:true});},[]);

  async function createResource(event){
    event.preventDefault();
    if(!resourceForm.name.trim())return;
    setBusy('resource');
    try{
      await HealthVerticalService.createDentalResource({name:resourceForm.name.trim(),kind:resourceForm.kind});
      setResourceForm({name:'',kind:'chair'});
      await loadAll({silent:true});
      notify('Recurso odontológico creado.','success');
    }catch(cause){notify(`No se creó el recurso: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function createAppointment(event){
    event.preventDefault();
    if(!appointmentForm.patientId||!appointmentForm.professionalId||!appointmentForm.resourceId)return notify('Paciente, profesional y sillón/recurso son obligatorios.','warning');
    setBusy('appointment');
    try{
      await HealthVerticalService.createDentalAppointment({
        ...appointmentForm,
        startsAt:isoFromLocal(appointmentForm.startsAt),
        durationMinutes:Number(appointmentForm.durationMinutes),
        recallId:appointmentForm.recallId||null
      });
      setAppointmentForm((current)=>({...current,startsAt:localDateTime(),reason:'',notes:'',recallId:null}));
      await loadAll({silent:true});
      await onAppointmentsChanged?.();
      notify('Cita odontológica agendada sin conflictos.','success');
    }catch(cause){
      const message=cause?.message||'No se agendó la cita.';
      notify(message,/conflicto/i.test(message)?'warning':'error');
    }finally{setBusy('');}
  }

  async function confirmAppointment(){
    if(!confirmation)return;
    setBusy('confirmation');
    try{
      await HealthVerticalService.confirmDentalAppointment(confirmation.appointment.id,{action:confirmation.action,reason:confirmationReason.trim()||null});
      setConfirmation(null);setConfirmationReason('');
      await loadAll({silent:true});
      await onAppointmentsChanged?.();
      notify(confirmation.action==='confirm'?'Cita confirmada.':'Estado de cita actualizado.','success');
    }catch(cause){notify(`No se actualizó la cita: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function createWaitlist(event){
    event.preventDefault();
    if(!waitlistForm.patientId)return notify('Selecciona el paciente para la Lista de espera.','warning');
    setBusy('waitlist');
    try{
      await HealthVerticalService.createDentalWaitlist({
        ...waitlistForm,
        professionalId:waitlistForm.professionalId||null,
        resourceId:waitlistForm.resourceId||null,
        preferredFrom:waitlistForm.preferredFrom?isoFromLocal(waitlistForm.preferredFrom):null,
        preferredTo:waitlistForm.preferredTo?isoFromLocal(waitlistForm.preferredTo):null,
        durationMinutes:Number(waitlistForm.durationMinutes),
        priority:Number(waitlistForm.priority)
      });
      setWaitlistForm((current)=>({...current,reason:'',preferredFrom:'',preferredTo:'',notes:''}));
      await loadAll({silent:true});
      notify('Paciente agregado a la Lista de espera.','success');
    }catch(cause){notify(`No se agregó a lista de espera: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  function openWaitlistBooking(item){
    setBookingTarget(item);
    setBookingForm({
      startsAt:localDateTime(),
      professionalId:item.professionalId||'',
      resourceId:item.resourceId||'',
      durationMinutes:String(item.durationMinutes||45),
      notes:item.notes||''
    });
  }

  async function bookWaitlist(){
    if(!bookingTarget||!bookingForm.professionalId||!bookingForm.resourceId)return notify('Selecciona profesional y recurso para agendar.','warning');
    setBusy('booking');
    try{
      await HealthVerticalService.bookDentalWaitlist(bookingTarget.id,{
        ...bookingForm,
        startsAt:isoFromLocal(bookingForm.startsAt),
        durationMinutes:Number(bookingForm.durationMinutes)
      });
      setBookingTarget(null);
      await loadAll({silent:true});
      await onAppointmentsChanged?.();
      notify('Paciente agendado desde lista de espera.','success');
    }catch(cause){notify(cause?.message||'No se pudo agendar desde lista de espera.','error');}
    finally{setBusy('');}
  }

  async function createRecall(event){
    event.preventDefault();
    if(!recallForm.patientId)return notify('Selecciona el paciente del Recall.','warning');
    setBusy('recall');
    try{
      await HealthVerticalService.createDentalRecall({
        ...recallForm,
        professionalId:recallForm.professionalId||null,
        dueAt:isoFromLocal(recallForm.dueAt)
      });
      setRecallForm((current)=>({...current,dueAt:localDateTime(30*24*60),notes:''}));
      await loadAll({silent:true});
      notify('Recall odontológico registrado.','success');
    }catch(cause){notify(`No se creó el recall: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  async function updateRecall(item,action){
    setBusy(`recall:${item.id}`);
    try{
      await HealthVerticalService.updateDentalRecall(item.id,{action});
      await loadAll({silent:true});
      notify(action==='contacted'?'Recall marcado como contactado.':'Recall descartado.','success');
    }catch(cause){notify(`No se actualizó el recall: ${cause?.message||'Error'}`,'error');}
    finally{setBusy('');}
  }

  function scheduleRecall(item){
    setAppointmentForm((current)=>({...current,patientId:item.patientId,professionalId:item.professionalId||'',recallId:item.id,reason:`Recall · ${item.kind}`,startsAt:localDateTime()}));
    setTab(0);
    notify('Recall cargado en Agenda. Completa sillón/recurso y horario.','info');
  }

  const appointmentColumns=[
    {key:'startsAt',label:'Inicio',render:(item)=>new Date(item.startsAt).toLocaleString('es-VE')},
    {key:'patient',label:'Paciente',render:(item)=>item.patientName||'—'},
    {key:'professional',label:'Profesional',render:(item)=>item.professionalName||'—'},
    {key:'resource',label:'Sillón / recurso',render:(item)=>item.resourceName||item.room||'—'},
    {key:'duration',label:'Duración',render:(item)=>`${Math.round((new Date(item.endsAt)-new Date(item.startsAt))/60000)} min`},
    {key:'status',label:'Estado',render:(item)=><CgStatusChip size="small" label={appointmentLabel(item.status)} tone={appointmentTone(item.status)}/>},
    {key:'actions',label:'Acciones',render:(item)=>!['cancelled','no_show','completed'].includes(item.status)?<Stack direction="row" gap={.5} flexWrap="wrap">
      {item.status!=='confirmed'?<CgButton size="small" onClick={()=>{setConfirmation({appointment:item,action:'confirm'});setConfirmationReason('');}}>Confirmar</CgButton>:null}
      <CgButton size="small" variant="outlined" color="error" onClick={()=>{setConfirmation({appointment:item,action:'cancel'});setConfirmationReason('');}}>Cancelar</CgButton>
      <CgButton size="small" variant="outlined" onClick={()=>{setConfirmation({appointment:item,action:'no-show'});setConfirmationReason('');}}>No asistió</CgButton>
    </Stack>:null}
  ];

  const waitlistColumns=[
    {key:'patient',label:'Paciente',render:(item)=>item.patientName||'—'},
    {key:'priority',label:'Prioridad',render:(item)=>`P${item.priority}`},
    {key:'preference',label:'Preferencia',render:(item)=>item.preferredFrom?new Date(item.preferredFrom).toLocaleString('es-VE'):'Flexible'},
    {key:'professional',label:'Profesional',render:(item)=>item.professionalName||'Cualquiera'},
    {key:'resource',label:'Recurso',render:(item)=>item.resourceName||'Cualquiera'},
    {key:'status',label:'Estado',render:(item)=><CgStatusChip size="small" label={item.status} tone={item.status==='booked'?'success':item.status==='cancelled'?'error':'warning'}/>},
    {key:'actions',label:'',render:(item)=>['waiting','contacted'].includes(item.status)?<CgButton size="small" onClick={()=>openWaitlistBooking(item)}>Agendar</CgButton>:null}
  ];

  const recallColumns=[
    {key:'dueAt',label:'Fecha objetivo',render:(item)=>new Date(item.dueAt).toLocaleDateString('es-VE')},
    {key:'patient',label:'Paciente',render:(item)=>item.patientName||'—'},
    {key:'kind',label:'Recall',render:(item)=>item.kind},
    {key:'professional',label:'Profesional',render:(item)=>item.professionalName||'Cualquiera'},
    {key:'status',label:'Estado',render:(item)=><CgStatusChip size="small" label={item.status} tone={item.status==='scheduled'?'success':item.status==='dismissed'?'default':'warning'}/>},
    {key:'actions',label:'Acciones',render:(item)=>['pending','contacted'].includes(item.status)?<Stack direction="row" gap={.5} flexWrap="wrap">
      <CgButton size="small" onClick={()=>scheduleRecall(item)}>Agendar</CgButton>
      {item.status==='pending'?<CgButton size="small" variant="outlined" disabled={busy===`recall:${item.id}`} onClick={()=>void updateRecall(item,'contacted')}>Contactado</CgButton>:null}
      <CgButton size="small" variant="outlined" onClick={()=>void updateRecall(item,'dismissed')}>Descartar</CgButton>
    </Stack>:null}
  ];

  const resourceColumns=[
    {key:'name',label:'Nombre'},
    {key:'kind',label:'Tipo',render:(item)=>resourceKindLabel(item.kind)},
    {key:'active',label:'Estado',render:(item)=><CgStatusChip size="small" label={item.active?'Activo':'Inactivo'} tone={item.active?'success':'default'}/>}
  ];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box><Typography variant="h6">Agenda odontológica avanzada</Typography><Typography variant="caption" color="text.secondary">Profesional + sillón/recurso + Duración con detección server-side de conflicto, Lista de espera, Confirmar/Cancelar y Recall.</Typography></Box>
      <CgButton variant="outlined" disabled={loading} onClick={()=>void loadAll()}>{loading?'Actualizando…':'Actualizar agenda'}</CgButton>
    </Stack>
    {error?<Box mt={1}><CgState severity="warning" title="Agenda incompleta">{error}</CgState></Box>:null}

    <Tabs value={tab} onChange={(_,value)=>setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Secciones de agenda odontológica" sx={{mt:1}}>
      <Tab label="Agenda"/><Tab label="Lista de espera"/><Tab label="Recall"/><Tab label="Recursos"/>
    </Tabs>
    <Divider sx={{mb:1.2}}/>

    {tab===0?<Stack gap={1.2}>
      <Box component="form" onSubmit={createAppointment} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(3,minmax(0,1fr))'},gap:1}}>
        <CgSelect label="Paciente" value={appointmentForm.patientId} onChange={(e)=>setAppointmentForm({...appointmentForm,patientId:e.target.value})} options={patientOptions}/>
        <CgSelect label="Profesional" value={appointmentForm.professionalId} onChange={(e)=>setAppointmentForm({...appointmentForm,professionalId:e.target.value})} options={requiredProfessionalOptions}/>
        <CgSelect label="Sillón / recurso" value={appointmentForm.resourceId} onChange={(e)=>setAppointmentForm({...appointmentForm,resourceId:e.target.value})} options={resourceOptions}/>
        <CgTextField label="Inicio" type="datetime-local" slotProps={{inputLabel:{shrink:true}}} value={appointmentForm.startsAt} onChange={(e)=>setAppointmentForm({...appointmentForm,startsAt:e.target.value})}/>
        <CgTextField label="Duración (min)" type="number" inputProps={{min:15,max:480,step:15}} value={appointmentForm.durationMinutes} onChange={(e)=>setAppointmentForm({...appointmentForm,durationMinutes:e.target.value})}/>
        <CgTextField label="Motivo" value={appointmentForm.reason} onChange={(e)=>setAppointmentForm({...appointmentForm,reason:e.target.value})}/>
        <CgTextField label="Notas" value={appointmentForm.notes} onChange={(e)=>setAppointmentForm({...appointmentForm,notes:e.target.value})} sx={{gridColumn:{md:'1/3'}}}/>
        <CgButton type="submit" disabled={busy==='appointment'}>{busy==='appointment'?'Validando conflicto…':'Agendar cita'}</CgButton>
      </Box>
      <CgState severity="info" title="Conflictos protegidos">El backend serializa la agenda del tenant y rechaza superposición de paciente, profesional o sillón/recurso.</CgState>
      <Box sx={{maxWidth:'100%',overflowX:'auto'}}>{appointments.length?<CgDataTable columns={appointmentColumns} rows={appointments} empty="Sin citas"/>:<CgEmptyState title="Sin citas próximas" description="Crea una cita con profesional, recurso y duración."/>}</Box>
    </Stack>:null}

    {tab===1?<Stack gap={1.2}>
      <Box component="form" onSubmit={createWaitlist} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(3,minmax(0,1fr))'},gap:1}}>
        <CgSelect label="Paciente" value={waitlistForm.patientId} onChange={(e)=>setWaitlistForm({...waitlistForm,patientId:e.target.value})} options={patientOptions}/>
        <CgSelect label="Profesional preferido" value={waitlistForm.professionalId} onChange={(e)=>setWaitlistForm({...waitlistForm,professionalId:e.target.value})} options={optionalProfessionalOptions}/>
        <CgSelect label="Recurso preferido" value={waitlistForm.resourceId} onChange={(e)=>setWaitlistForm({...waitlistForm,resourceId:e.target.value})} options={optionalResourceOptions}/>
        <CgTextField label="Desde" type="datetime-local" slotProps={{inputLabel:{shrink:true}}} value={waitlistForm.preferredFrom} onChange={(e)=>setWaitlistForm({...waitlistForm,preferredFrom:e.target.value})}/>
        <CgTextField label="Hasta" type="datetime-local" slotProps={{inputLabel:{shrink:true}}} value={waitlistForm.preferredTo} onChange={(e)=>setWaitlistForm({...waitlistForm,preferredTo:e.target.value})}/>
        <CgTextField label="Duración" type="number" inputProps={{min:15,max:480,step:15}} value={waitlistForm.durationMinutes} onChange={(e)=>setWaitlistForm({...waitlistForm,durationMinutes:e.target.value})}/>
        <CgSelect label="Prioridad" value={waitlistForm.priority} onChange={(e)=>setWaitlistForm({...waitlistForm,priority:e.target.value})} options={[1,2,3,4,5].map((value)=>({value:String(value),label:`P${value}`}))}/>
        <CgTextField label="Motivo" value={waitlistForm.reason} onChange={(e)=>setWaitlistForm({...waitlistForm,reason:e.target.value})}/>
        <CgButton type="submit" disabled={busy==='waitlist'}>Agregar a Lista de espera</CgButton>
      </Box>
      <Box sx={{maxWidth:'100%',overflowX:'auto'}}><CgDataTable columns={waitlistColumns} rows={waitlist} empty="Sin lista de espera"/></Box>
    </Stack>:null}

    {tab===2?<Stack gap={1.2}>
      <Box component="form" onSubmit={createRecall} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(3,minmax(0,1fr))'},gap:1}}>
        <CgSelect label="Paciente" value={recallForm.patientId} onChange={(e)=>setRecallForm({...recallForm,patientId:e.target.value})} options={patientOptions}/>
        <CgSelect label="Profesional" value={recallForm.professionalId} onChange={(e)=>setRecallForm({...recallForm,professionalId:e.target.value})} options={optionalProfessionalOptions}/>
        <CgTextField label="Fecha objetivo" type="datetime-local" slotProps={{inputLabel:{shrink:true}}} value={recallForm.dueAt} onChange={(e)=>setRecallForm({...recallForm,dueAt:e.target.value})}/>
        <CgTextField label="Tipo de Recall" value={recallForm.kind} onChange={(e)=>setRecallForm({...recallForm,kind:e.target.value})}/>
        <CgTextField label="Notas" value={recallForm.notes} onChange={(e)=>setRecallForm({...recallForm,notes:e.target.value})} sx={{gridColumn:{md:'2/4'}}}/>
        <CgButton type="submit" disabled={busy==='recall'}>Crear Recall</CgButton>
      </Box>
      <Box sx={{maxWidth:'100%',overflowX:'auto'}}><CgDataTable columns={recallColumns} rows={recalls} empty="Sin recalls"/></Box>
    </Stack>:null}

    {tab===3?<Stack gap={1.2}>
      <Box component="form" onSubmit={createResource} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'2fr 1fr auto'},gap:1}}>
        <CgTextField label="Nombre del recurso" placeholder="Ej. Sillón 1" value={resourceForm.name} onChange={(e)=>setResourceForm({...resourceForm,name:e.target.value})}/>
        <CgSelect label="Tipo" value={resourceForm.kind} onChange={(e)=>setResourceForm({...resourceForm,kind:e.target.value})} options={[{value:'chair',label:'Sillón'},{value:'room',label:'Consultorio'},{value:'equipment',label:'Equipo'}]}/>
        <CgButton type="submit" disabled={busy==='resource'}>Crear recurso</CgButton>
      </Box>
      <CgDataTable columns={resourceColumns} rows={resources} empty="Sin recursos odontológicos"/>
    </Stack>:null}

    <CgDialog
      open={Boolean(confirmation)}
      title={confirmation?.action==='confirm'?'Confirmar cita':confirmation?.action==='cancel'?'Cancelar cita':'Marcar no asistencia'}
      onClose={()=>{setConfirmation(null);setConfirmationReason('');}}
      confirmLabel={busy==='confirmation'?'Guardando…':confirmation?.action==='confirm'?'Confirmar':'Aplicar estado'}
      destructive={confirmation?.action==='cancel'}
      onConfirm={()=>void confirmAppointment()}
    >
      <Stack gap={1} pt={1}>
        <CgState severity={confirmation?.action==='confirm'?'info':'warning'} title="Cambio auditable">El servidor guardará acción, actor y fecha en confirmationData.</CgState>
        <CgTextField fullWidth multiline minRows={2} label="Motivo / nota" value={confirmationReason} onChange={(e)=>setConfirmationReason(e.target.value)}/>
      </Stack>
    </CgDialog>

    <CgDialog
      open={Boolean(bookingTarget)}
      title="Agendar desde lista de espera"
      onClose={()=>setBookingTarget(null)}
      confirmLabel={busy==='booking'?'Validando…':'Agendar'}
      onConfirm={()=>void bookWaitlist()}
    >
      <Stack gap={1} pt={1}>
        <CgTextField label="Inicio" type="datetime-local" slotProps={{inputLabel:{shrink:true}}} value={bookingForm.startsAt} onChange={(e)=>setBookingForm({...bookingForm,startsAt:e.target.value})}/>
        <CgSelect label="Profesional" value={bookingForm.professionalId} onChange={(e)=>setBookingForm({...bookingForm,professionalId:e.target.value})} options={requiredProfessionalOptions}/>
        <CgSelect label="Sillón / recurso" value={bookingForm.resourceId} onChange={(e)=>setBookingForm({...bookingForm,resourceId:e.target.value})} options={resourceOptions}/>
        <CgTextField label="Duración" type="number" inputProps={{min:15,max:480,step:15}} value={bookingForm.durationMinutes} onChange={(e)=>setBookingForm({...bookingForm,durationMinutes:e.target.value})}/>
      </Stack>
    </CgDialog>
  </Paper>;
}
