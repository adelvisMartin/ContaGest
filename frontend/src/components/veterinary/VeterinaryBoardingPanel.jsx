import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { VeterinaryService } from '../../services/verticalService.js';
import { reportVeterinaryError } from './veterinaryError.js';

const pad=(value)=>String(value).padStart(2,'0');
const localDateTime=(date=new Date())=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const toIso=(value)=>{
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error('Fecha/hora inválida.');
  return date.toISOString();
};
const resourceTypeLabel={cage:'Jaula',kennel:'Canil',room:'Habitación',isolation:'Aislamiento',other:'Otro'};
const stayLabel={reserved:'Reservada',checked_in:'En estancia',completed:'Finalizada',cancelled:'Cancelada'};

export function VeterinaryBoardingPanel({selectedPatient}) {
  const [setting,setSetting]=useState({enabled:false});
  const [resources,setResources]=useState([]);
  const [stays,setStays]=useState([]);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [resourceForm,setResourceForm]=useState({code:'',name:'',type:'cage',location:''});
  const [windowFrom,setWindowFrom]=useState(()=>localDateTime());
  const [windowTo,setWindowTo]=useState(()=>localDateTime(new Date(Date.now()+7*24*60*60*1000)));
  const [stayForm,setStayForm]=useState({resourceId:'',startsAt:localDateTime(),plannedEndsAt:localDateTime(new Date(Date.now()+24*60*60*1000)),notes:''});

  const availableResources=useMemo(()=>resources.filter((item)=>item.available&&item.status==='active'),[resources]);

  async function load({silent=false}={}){
    if(!silent)setLoading(true);
    setError('');
    try{
      const settings=await VeterinaryService.boardingSettings();
      const normalized=settings?.data||settings||{enabled:false};
      setSetting(normalized);
      if(!normalized.enabled){setResources([]);setStays([]);return;}
      const from=toIso(windowFrom);
      const to=toIso(windowTo);
      const [resourceResponse,stayResponse]=await Promise.all([
        VeterinaryService.boardingResources({from,to}),
        VeterinaryService.boardingStays(selectedPatient?.id?{patientId:selectedPatient.id}:{})
      ]);
      const resourcePayload=resourceResponse?.data||resourceResponse||{};
      setResources(Array.isArray(resourcePayload.resources)?resourcePayload.resources:[]);
      setStays(Array.isArray(stayResponse)?stayResponse:stayResponse?.data||[]);
    }catch(cause){
      setError(reportVeterinaryError('boarding.load',cause,'No se pudo cargar el módulo de estancia.'));
    }finally{if(!silent)setLoading(false);}
  }

  useEffect(()=>{void load();},[selectedPatient?.id]);

  async function toggleEnabled(){
    setBusy(true);setError('');
    try{
      await VeterinaryService.updateBoardingSettings({enabled:!setting.enabled});
      await load({silent:true});
    }catch(cause){
      setError(reportVeterinaryError('boarding.settings',cause,'No se pudo cambiar el estado del módulo. Se requiere permiso administrativo.'));
    }finally{setBusy(false);}
  }

  async function createResource(event){
    event.preventDefault();setBusy(true);setError('');
    try{
      await VeterinaryService.createBoardingResource({code:resourceForm.code.trim(),name:resourceForm.name.trim(),type:resourceForm.type,location:resourceForm.location.trim()||null});
      setResourceForm({code:'',name:'',type:'cage',location:''});
      await load({silent:true});
    }catch(cause){setError(reportVeterinaryError('boarding.resource.create',cause,'No se pudo crear el recurso.'));}finally{setBusy(false);}
  }

  async function setResourceStatus(resource,status){
    setBusy(true);setError('');
    try{await VeterinaryService.updateBoardingResourceStatus(resource.id,{status});await load({silent:true});}
    catch(cause){setError(reportVeterinaryError('boarding.resource.status',cause,'No se pudo cambiar el recurso.'));}finally{setBusy(false);}
  }

  async function reserveStay(event){
    event.preventDefault();
    if(!selectedPatient?.id){setError('Selecciona una mascota antes de reservar una estancia.');return;}
    setBusy(true);setError('');
    try{
      await VeterinaryService.createBoardingStay({patientId:selectedPatient.id,resourceId:stayForm.resourceId,startsAt:toIso(stayForm.startsAt),plannedEndsAt:toIso(stayForm.plannedEndsAt),notes:stayForm.notes.trim()||null});
      setStayForm((current)=>({...current,resourceId:'',notes:''}));
      await load({silent:true});
    }catch(cause){setError(reportVeterinaryError('boarding.stay.reserve',cause,'No se pudo reservar la estancia.'));}finally{setBusy(false);}
  }

  async function transitionStay(stay,status){
    setBusy(true);setError('');
    try{await VeterinaryService.transitionBoardingStay(stay.id,{status});await load({silent:true});}
    catch(cause){setError(reportVeterinaryError('boarding.stay.status',cause,'No se pudo actualizar la estancia.'));}finally{setBusy(false);}
  }

  if(loading)return <Paper variant="outlined" sx={{p:2}}><Typography>Cargando estancia y recursos…</Typography></Paper>;

  return <Stack gap={1.4}>
    <Paper variant="outlined" sx={{p:1.5}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
        <Box><Typography variant="h6">Boarding / estancia opcional</Typography><Typography variant="body2" color="text.secondary">Jaulas y espacios con disponibilidad temporal. No sustituye Hospitalización ni crea autoridad clínica.</Typography></Box>
        <Button variant={setting.enabled?'outlined':'contained'} onClick={()=>void toggleEnabled()} disabled={busy}>{setting.enabled?'Desactivar módulo':'Activar módulo opcional'}</Button>
      </Stack>
      {error?<Alert severity="error" sx={{mt:1}} action={<Button color="inherit" size="small" onClick={()=>void load()}>Reintentar</Button>}>{error}</Alert>:null}
      {!setting.enabled?<Alert severity="info" sx={{mt:1}}>Este módulo permanece desactivado hasta que una clínica necesite gestionar jaulas, caniles o espacios de estancia.</Alert>:null}
    </Paper>

    {setting.enabled?<>
      <Paper variant="outlined" sx={{p:1.5}}>
        <Typography variant="subtitle1" fontWeight={800}>Ventana de disponibilidad</Typography>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1fr auto'},gap:1,mt:1}}>
          <TextField type="datetime-local" label="Desde" InputLabelProps={{shrink:true}} value={windowFrom} onChange={(e)=>setWindowFrom(e.target.value)}/>
          <TextField type="datetime-local" label="Hasta" InputLabelProps={{shrink:true}} value={windowTo} onChange={(e)=>setWindowTo(e.target.value)}/>
          <Button variant="outlined" onClick={()=>void load()} disabled={busy}>Consultar</Button>
        </Box>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))',xl:'repeat(3,minmax(0,1fr))'},gap:1,mt:1.2}}>
          {resources.length?resources.map((resource)=><Paper key={resource.id} variant="outlined" sx={{p:1.1}}>
            <Stack direction="row" justifyContent="space-between" gap={1}>
              <Box><Typography fontWeight={800}>{resource.code} · {resource.name}</Typography><Typography variant="caption" color="text.secondary">{resourceTypeLabel[resource.type]||resource.type}{resource.location?` · ${resource.location}`:''}</Typography></Box>
              <Chip size="small" label={resource.available?'Disponible':resource.status==='active'?'Ocupado / reservado':resource.status==='maintenance'?'Mantenimiento':'Inactivo'} color={resource.available?'success':resource.status==='active'?'warning':'default'}/>
            </Stack>
            {resource.occupancy?<Typography variant="body2" mt={.7}>Asignado a {resource.occupancy.patientName} hasta {new Date(resource.occupancy.plannedEndsAt).toLocaleString('es-VE')}.</Typography>:null}
            <Stack direction="row" gap={.6} mt={1} flexWrap="wrap">
              {resource.status!=='maintenance'?<Button size="small" variant="outlined" onClick={()=>void setResourceStatus(resource,'maintenance')} disabled={busy}>Mantenimiento</Button>:null}
              {resource.status!=='active'?<Button size="small" variant="outlined" onClick={()=>void setResourceStatus(resource,'active')} disabled={busy}>Activar</Button>:null}
              {resource.status!=='inactive'?<Button size="small" color="error" variant="outlined" onClick={()=>void setResourceStatus(resource,'inactive')} disabled={busy}>Inactivar</Button>:null}
            </Stack>
          </Paper>):<Typography variant="body2" color="text.secondary">No hay recursos registrados.</Typography>}
        </Box>
      </Paper>

      <Paper component="form" onSubmit={createResource} variant="outlined" sx={{p:1.5}}>
        <Typography variant="subtitle1" fontWeight={800}>Nuevo recurso</Typography>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'120px minmax(180px,1fr) 180px minmax(160px,1fr) auto'},gap:1,mt:1}}>
          <TextField label="Código" value={resourceForm.code} onChange={(e)=>setResourceForm((v)=>({...v,code:e.target.value}))} required/>
          <TextField label="Nombre" value={resourceForm.name} onChange={(e)=>setResourceForm((v)=>({...v,name:e.target.value}))} required/>
          <TextField select label="Tipo" value={resourceForm.type} onChange={(e)=>setResourceForm((v)=>({...v,type:e.target.value}))}>{Object.entries(resourceTypeLabel).map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
          <TextField label="Ubicación" value={resourceForm.location} onChange={(e)=>setResourceForm((v)=>({...v,location:e.target.value}))}/>
          <Button type="submit" variant="contained" disabled={busy}>Agregar</Button>
        </Box>
      </Paper>

      <Paper component="form" onSubmit={reserveStay} variant="outlined" sx={{p:1.5}}>
        <Typography variant="subtitle1" fontWeight={800}>Reservar estancia</Typography>
        <Typography variant="caption" color="text.secondary">{selectedPatient?`Mascota: ${selectedPatient.displayName}`:'Selecciona una mascota en el módulo para reservar.'}</Typography>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'minmax(180px,1fr) 1fr 1fr'},gap:1,mt:1}}>
          <TextField select label="Recurso disponible" value={stayForm.resourceId} onChange={(e)=>setStayForm((v)=>({...v,resourceId:e.target.value}))} required disabled={!selectedPatient}>{availableResources.map((resource)=><MenuItem key={resource.id} value={resource.id}>{resource.code} · {resource.name}</MenuItem>)}</TextField>
          <TextField type="datetime-local" label="Ingreso" InputLabelProps={{shrink:true}} value={stayForm.startsAt} onChange={(e)=>setStayForm((v)=>({...v,startsAt:e.target.value}))}/>
          <TextField type="datetime-local" label="Salida prevista" InputLabelProps={{shrink:true}} value={stayForm.plannedEndsAt} onChange={(e)=>setStayForm((v)=>({...v,plannedEndsAt:e.target.value}))}/>
        </Box>
        <TextField fullWidth multiline minRows={2} label="Notas operativas" value={stayForm.notes} onChange={(e)=>setStayForm((v)=>({...v,notes:e.target.value}))} sx={{mt:1}}/>
        <Button type="submit" variant="contained" sx={{mt:1}} disabled={busy||!selectedPatient||!stayForm.resourceId}>Reservar</Button>
      </Paper>

      <Paper variant="outlined" sx={{p:1.5}}>
        <Typography variant="subtitle1" fontWeight={800}>Estancias {selectedPatient?`de ${selectedPatient.displayName}`:''}</Typography>
        <Stack gap={.8} mt={1}>
          {stays.length?stays.map((stay)=><Paper key={stay.id} variant="outlined" sx={{p:1.1}}>
            <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}>
              <Box><Typography fontWeight={800}>{stay.resourceCode} · {stay.resourceName}</Typography><Typography variant="caption" color="text.secondary">{new Date(stay.startsAt).toLocaleString('es-VE')} → {new Date(stay.plannedEndsAt).toLocaleString('es-VE')}</Typography></Box>
              <Chip size="small" label={stayLabel[stay.status]||stay.status}/>
            </Stack>
            <Stack direction="row" gap={.6} mt={1} flexWrap="wrap">
              {stay.status==='reserved'?<Button size="small" variant="contained" onClick={()=>void transitionStay(stay,'checked_in')} disabled={busy}>Registrar ingreso</Button>:null}
              {stay.status==='checked_in'?<Button size="small" color="success" variant="contained" onClick={()=>void transitionStay(stay,'completed')} disabled={busy}>Finalizar estancia</Button>:null}
              {['reserved','checked_in'].includes(stay.status)?<Button size="small" color="error" variant="outlined" onClick={()=>void transitionStay(stay,'cancelled')} disabled={busy}>Cancelar</Button>:null}
            </Stack>
          </Paper>):<Typography variant="body2" color="text.secondary">No hay estancias para el alcance actual.</Typography>}
        </Stack>
      </Paper>
    </>:null}
  </Stack>;
}
