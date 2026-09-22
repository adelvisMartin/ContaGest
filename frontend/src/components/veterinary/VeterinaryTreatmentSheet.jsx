import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, MenuItem, Paper, Stack, TextField, Typography
} from '@mui/material';
import { VeterinaryService } from '../../services/verticalService.js';

const CATEGORY_OPTIONS=[
  {value:'medication',label:'Medicacion'},
  {value:'observation',label:'Observacion'},
  {value:'feeding',label:'Alimentacion'},
  {value:'fluid',label:'Fluidos'},
  {value:'vitals',label:'Signos vitales'},
  {value:'task',label:'Tarea'}
];

const STATUS_OPTIONS=[
  {value:'scheduled',label:'Programado'},
  {value:'completed',label:'Realizado'},
  {value:'skipped',label:'Omitido'},
  {value:'cancelled',label:'Cancelado'}
];

const ACTIVE_HOSPITALIZATION=new Set(['admitted','observed']);
const formatDate=(value)=>value?new Date(value).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'}):'—';
const toIso=(value)=>{
  if(!value)return null;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?null:date.toISOString();
};
const initialForm=()=>({
  category:'medication',
  status:'completed',
  title:'',
  scheduledAt:'',
  performedAt:'',
  responsibleProfessionalId:'',
  note:'',
  medication:'',
  dose:'',
  route:'',
  food:'',
  fluid:'',
  amount:'',
  unit:'',
  rate:'',
  temperature:'',
  heartRate:'',
  respiratoryRate:'',
  weight:''
});

function Detail({label,value}){
  if(!String(value||'').trim())return null;
  return <Typography variant="caption" color="text.secondary"><b>{label}:</b> {String(value)}</Typography>;
}

export function VeterinaryTreatmentSheet({hospitalizations=[],professionals=[]}){
  const activeHospitalizations=useMemo(
    ()=>hospitalizations.filter((item)=>ACTIVE_HOSPITALIZATION.has(String(item.status))),
    [hospitalizations]
  );
  const [hospitalizationId,setHospitalizationId]=useState('');
  const [entries,setEntries]=useState([]);
  const [form,setForm]=useState(initialForm);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  useEffect(()=>{
    if(activeHospitalizations.some((item)=>item.id===hospitalizationId))return;
    setHospitalizationId(activeHospitalizations[0]?.id||'');
  },[activeHospitalizations,hospitalizationId]);

  async function load(id=hospitalizationId){
    if(!id){
      setEntries([]);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try{
      const response=await VeterinaryService.treatmentSheet(id);
      setEntries(Array.isArray(response)?response:response?.data||[]);
    }catch(cause){
      setError(cause?.message||'No se pudo cargar la hoja de tratamiento.');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void load(hospitalizationId);},[hospitalizationId]);

  const setField=(name)=>(event)=>setForm((current)=>({...current,[name]:event.target.value}));

  function detailsForSubmit(){
    return {
      medication:form.category==='medication'?form.medication.trim()||null:null,
      dose:form.category==='medication'?form.dose.trim()||null:null,
      route:form.category==='medication'||form.category==='fluid'?form.route.trim()||null:null,
      food:form.category==='feeding'?form.food.trim()||null:null,
      fluid:form.category==='fluid'?form.fluid.trim()||null:null,
      amount:['feeding','fluid'].includes(form.category)?form.amount.trim()||null:null,
      unit:['feeding','fluid'].includes(form.category)?form.unit.trim()||null:null,
      rate:form.category==='fluid'?form.rate.trim()||null:null,
      temperature:form.category==='vitals'?form.temperature.trim()||null:null,
      heartRate:form.category==='vitals'?form.heartRate.trim()||null:null,
      respiratoryRate:form.category==='vitals'?form.respiratoryRate.trim()||null:null,
      weight:form.category==='vitals'?form.weight.trim()||null:null
    };
  }

  function locallyValid(){
    if(!hospitalizationId||!form.title.trim())return false;
    if(form.status==='scheduled'&&!form.scheduledAt)return false;
    if(form.category==='medication'&&(!form.medication.trim()||!form.dose.trim()))return false;
    if(form.category==='feeding'&&!form.food.trim())return false;
    if(form.category==='fluid'&&!form.fluid.trim())return false;
    if(form.category==='observation'&&!form.note.trim())return false;
    if(form.category==='vitals'&&![form.temperature,form.heartRate,form.respiratoryRate,form.weight].some((item)=>item.trim()))return false;
    return true;
  }

  async function submit(event){
    event.preventDefault();
    if(!locallyValid()||saving)return;
    setSaving(true);
    setError('');
    setSuccess('');
    try{
      await VeterinaryService.createTreatmentSheetEntry(hospitalizationId,{
        category:form.category,
        status:form.status,
        title:form.title.trim(),
        scheduledAt:toIso(form.scheduledAt),
        performedAt:toIso(form.performedAt),
        responsibleProfessionalId:form.responsibleProfessionalId||null,
        note:form.note.trim()||null,
        details:detailsForSubmit()
      });
      setSuccess('Entrada registrada en la hoja de tratamiento.');
      setForm(initialForm());
      await load(hospitalizationId);
    }catch(cause){
      setError(cause?.message||'No se pudo registrar la entrada.');
    }finally{
      setSaving(false);
    }
  }

  const categoryLabel=(value)=>CATEGORY_OPTIONS.find((item)=>item.value===value)?.label||value||'Registro';
  const statusLabel=(value)=>STATUS_OPTIONS.find((item)=>item.value===value)?.label||value||'—';

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Hoja de tratamiento</Typography>
        <Typography variant="caption" color="text.secondary">
          Medicaciones, observaciones, alimentación, fluidos, tareas y signos vitales como eventos append-only con responsable y timestamps.
        </Typography>
      </Box>
      <TextField
        select size="small" label="Hospitalizacion activa"
        value={hospitalizationId}
        onChange={(event)=>setHospitalizationId(event.target.value)}
        sx={{minWidth:{md:280}}}
      >
        {activeHospitalizations.map((item)=><MenuItem key={item.id} value={item.id}>
          {item.admissionNumber||'Hospitalización'} · {item.ward||'Área general'} · {item.cage||'Sin jaula'}
        </MenuItem>)}
      </TextField>
    </Stack>

    <Divider sx={{my:1.2}}/>
    {!activeHospitalizations.length?<Alert severity="info">No hay una hospitalización activa. La hoja de tratamiento sólo admite nuevos eventos durante ingreso u observación.</Alert>:null}
    {error?<Alert severity="error" sx={{mb:1}} action={<Button color="inherit" size="small" onClick={()=>void load()}>Reintentar</Button>}>{error}</Alert>:null}
    {success?<Alert severity="success" sx={{mb:1}}>{success}</Alert>:null}

    {activeHospitalizations.length?<Box component="form" onSubmit={submit}>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>
        <TextField select label="Tipo" value={form.category} onChange={setField('category')}>
          {CATEGORY_OPTIONS.map((item)=><MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
        </TextField>
        <TextField select label="Estado" value={form.status} onChange={setField('status')}>
          {STATUS_OPTIONS.map((item)=><MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
        </TextField>
        <TextField label="Título *" value={form.title} onChange={setField('title')}/>
        <TextField select label="Responsable" value={form.responsibleProfessionalId} onChange={setField('responsibleProfessionalId')}>
          <MenuItem value="">Sin asignar</MenuItem>
          {professionals.map((item)=><MenuItem key={item.id} value={item.id}>{item.fullName} · {item.specialty||'Profesional'}</MenuItem>)}
        </TextField>
        <TextField
          label="Programado" type="datetime-local"
          value={form.scheduledAt} onChange={setField('scheduledAt')}
          slotProps={{inputLabel:{shrink:true}}}
          required={form.status==='scheduled'}
        />
        <TextField
          label="Realizado" type="datetime-local"
          value={form.performedAt} onChange={setField('performedAt')}
          slotProps={{inputLabel:{shrink:true}}}
        />
      </Box>

      {form.category==='medication'?<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'2fr 1fr 1fr'},gap:1,mt:1}}>
        <TextField label="Medicamento *" value={form.medication} onChange={setField('medication')}/>
        <TextField label="Dosis *" value={form.dose} onChange={setField('dose')} helperText="Registro manual; no se calcula ni recomienda automáticamente."/>
        <TextField label="Vía" value={form.route} onChange={setField('route')}/>
      </Box>:null}

      {form.category==='feeding'?<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'2fr 1fr 1fr'},gap:1,mt:1}}>
        <TextField label="Alimentacion *" value={form.food} onChange={setField('food')}/>
        <TextField label="Cantidad" value={form.amount} onChange={setField('amount')}/>
        <TextField label="Unidad" value={form.unit} onChange={setField('unit')}/>
      </Box>:null}

      {form.category==='fluid'?<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(5,minmax(0,1fr))'},gap:1,mt:1}}>
        <TextField label="Fluido *" value={form.fluid} onChange={setField('fluid')}/>
        <TextField label="Cantidad" value={form.amount} onChange={setField('amount')}/>
        <TextField label="Unidad" value={form.unit} onChange={setField('unit')}/>
        <TextField label="Velocidad" value={form.rate} onChange={setField('rate')}/>
        <TextField label="Vía" value={form.route} onChange={setField('route')}/>
      </Box>:null}

      {form.category==='vitals'?<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',md:'repeat(4,minmax(0,1fr))'},gap:1,mt:1}}>
        <TextField label="Temperatura" value={form.temperature} onChange={setField('temperature')}/>
        <TextField label="Frecuencia cardíaca" value={form.heartRate} onChange={setField('heartRate')}/>
        <TextField label="Frecuencia respiratoria" value={form.respiratoryRate} onChange={setField('respiratoryRate')}/>
        <TextField label="Peso" value={form.weight} onChange={setField('weight')}/>
      </Box>:null}

      <TextField
        fullWidth multiline minRows={2}
        label={form.category==='observation'?'Observacion *':form.category==='task'?'Tarea / notas':'Notas'}
        value={form.note} onChange={setField('note')} sx={{mt:1}}
      />
      <Button type="submit" disabled={!locallyValid()||saving} sx={{mt:1}}>
        {saving?'Registrando…':'Agregar a hoja de tratamiento'}
      </Button>
    </Box>:null}

    <Divider sx={{my:1.5}}/>
    <Typography variant="subtitle1" fontWeight={700}>Historial de cuidados</Typography>
    {loading?<Stack direction="row" gap={1} alignItems="center" py={2}><CircularProgress size={20}/><Typography variant="body2">Cargando hoja de tratamiento…</Typography></Stack>
      :entries.length?<Stack gap={.8} mt={1}>
        {entries.map((entry)=>{
          const details=entry.details||{};
          return <Paper key={entry.id} variant="outlined" sx={{p:1}}>
            <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={.7}>
              <Box>
                <Typography variant="body2" fontWeight={700}>{entry.title||categoryLabel(entry.category)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {categoryLabel(entry.category)} · Responsable: {entry.responsibleProfessionalName||'Sin asignar'}
                </Typography>
              </Box>
              <Chip size="small" label={statusLabel(entry.status)} variant={entry.status==='completed'?'filled':'outlined'} color={entry.status==='completed'?'success':'default'}/>
            </Stack>
            <Stack direction="row" flexWrap="wrap" gap={1.2} mt={.7}>
              <Detail label="Programado" value={formatDate(entry.scheduledAt)}/>
              <Detail label="Realizado" value={formatDate(entry.performedAt)}/>
              <Detail label="Medicacion" value={details.medication}/>
              <Detail label="Dosis" value={details.dose}/>
              <Detail label="Vía" value={details.route}/>
              <Detail label="Alimentacion" value={details.food}/>
              <Detail label="Fluidos" value={details.fluid}/>
              <Detail label="Cantidad" value={details.amount}/>
              <Detail label="Temperatura" value={details.temperature}/>
              <Detail label="FC" value={details.heartRate}/>
              <Detail label="FR" value={details.respiratoryRate}/>
              <Detail label="Peso" value={details.weight}/>
            </Stack>
            {entry.note?<Typography variant="body2" sx={{mt:.7,whiteSpace:'pre-wrap'}}>{entry.note}</Typography>:null}
          </Paper>;
        })}
      </Stack>:<Alert severity="info" sx={{mt:1}}>Aún no hay eventos en la hoja de tratamiento de esta hospitalización.</Alert>}
  </Paper>;
}
