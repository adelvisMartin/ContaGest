import React, { useEffect, useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';
import { PeriodizationBuilder, emptyPeriodizationStructure } from './PeriodizationBuilder.jsx';

const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const cloneStructure=(value)=>JSON.parse(JSON.stringify(value&&typeof value==='object'?value:emptyPeriodizationStructure()));
const localDate=()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);};

export function PeriodizationPanel({routines=[],Toast}){
  const routineRows=rows(routines);
  const [routineId,setRoutineId]=useState(routineRows[0]?.id||'');
  const [templates,setTemplates]=useState([]);
  const [programs,setPrograms]=useState([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [sourceProgramId,setSourceProgramId]=useState('');
  const [templateName,setTemplateName]=useState('');
  const [form,setForm]=useState({
    name:'',
    startsAt:localDate(),
    notes:'',
    sourceTemplateId:'',
    structure:emptyPeriodizationStructure()
  });

  useEffect(()=>{
    if(routineId&&routineRows.some((item)=>item.id===routineId))return;
    setRoutineId(routineRows[0]?.id||'');
  },[routineRows,routineId]);

  const routineOptions=useMemo(()=>[
    {value:'',label:'Seleccionar rutina'},
    ...routineRows.map((item)=>({value:item.id,label:item.name||'Rutina'}))
  ],[routineRows]);

  const templateOptions=useMemo(()=>[
    {value:'',label:'Sin plantilla'},
    ...templates.map((item)=>({value:item.id,label:item.name}))
  ],[templates]);

  const notify=(message,tone='success')=>{
    if(typeof Toast==='function')Toast(message,tone);
  };

  async function loadTemplates(){
    const response=await GymVerticalService.periodizationTemplates();
    setTemplates(rows(response));
  }

  async function loadPrograms(targetRoutineId=routineId){
    if(!targetRoutineId){setPrograms([]);return;}
    const response=await GymVerticalService.periodizationPrograms(targetRoutineId);
    setPrograms(rows(response));
  }

  async function load(){
    setLoading(true);setError('');
    try{
      await Promise.all([loadTemplates(),loadPrograms()]);
    }catch(cause){
      setError(cause?.message||'No se pudo cargar la periodización.');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void loadTemplates().catch((cause)=>setError(cause?.message||'No se pudieron cargar las plantillas.'));},[]);
  useEffect(()=>{void loadPrograms(routineId).catch((cause)=>setError(cause?.message||'No se pudieron cargar los programas.'));},[routineId]);

  function resetDraft(){
    setSourceProgramId('');
    setForm({name:'',startsAt:localDate(),notes:'',sourceTemplateId:'',structure:emptyPeriodizationStructure()});
  }

  function applyTemplate(templateId){
    const selected=templates.find((item)=>item.id===templateId);
    setForm((current)=>({
      ...current,
      sourceTemplateId:templateId,
      structure:selected?cloneStructure(selected.structure):current.structure
    }));
  }

  function beginVersion(program){
    setSourceProgramId(program.id);
    setRoutineId(program.routineId);
    setForm({
      name:program.name||'',
      startsAt:program.startsAt?String(program.startsAt).slice(0,10):localDate(),
      notes:program.notes||'',
      sourceTemplateId:program.sourceTemplateId||'',
      structure:cloneStructure(program.structure)
    });
  }

  async function saveProgram(event){
    event.preventDefault();
    if(!routineId){setError('Selecciona una rutina.');return;}
    if(!form.name.trim()){setError('Indica el nombre del programa.');return;}
    if(!form.structure?.phases?.length){setError('Agrega al menos un mesociclo.');return;}
    setSaving(true);setError('');
    try{
      const payload={
        routineId,
        name:form.name.trim(),
        startsAt:form.startsAt||null,
        notes:form.notes.trim()||null,
        sourceTemplateId:form.sourceTemplateId||null,
        structure:form.structure
      };
      if(sourceProgramId)await GymVerticalService.createPeriodizationVersion(sourceProgramId,payload);
      else await GymVerticalService.createPeriodizationProgram(payload);
      notify(sourceProgramId?'Nueva versión creada.':'Programa de periodización creado.');
      resetDraft();
      await loadPrograms(routineId);
    }catch(cause){
      setError(cause?.message||'No se pudo guardar el programa.');
    }finally{
      setSaving(false);
    }
  }

  async function saveTemplate(){
    if(!templateName.trim()){setError('Indica el nombre de la plantilla.');return;}
    if(!form.structure?.phases?.length){setError('La plantilla requiere al menos un mesociclo.');return;}
    setSaving(true);setError('');
    try{
      const created=await GymVerticalService.createPeriodizationTemplate({
        name:templateName.trim(),
        description:form.notes.trim()||null,
        structure:form.structure
      });
      setTemplateName('');
      await loadTemplates();
      const createdId=created?.id||created?.data?.id;
      if(createdId)setForm((current)=>({...current,sourceTemplateId:createdId}));
      notify('Plantilla guardada.');
    }catch(cause){
      setError(cause?.message||'No se pudo guardar la plantilla.');
    }finally{
      setSaving(false);
    }
  }

  if(!routineRows.length)return <Paper variant="outlined" sx={{p:1.5}}>
    <CgEmptyState title="Periodización sin rutina" description="Crea una rutina estructurada antes de definir fases y mesociclos."/>
  </Paper>;

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Periodización</Typography>
        <Typography variant="caption" color="text.secondary">Fases/mesociclos, semanas de carga/descarga, Plantillas y versiones inmutables.</Typography>
      </Box>
      <CgStatusChip label={sourceProgramId?'Nueva versión':'Programa nuevo'} tone={sourceProgramId?'warning':'primary'}/>
    </Stack>
    <Divider sx={{my:1.2}}/>
    {error?<CgState severity="error" title="Periodización">{error}</CgState>:null}
    {loading?<CgState severity="info" title="Actualizando">Cargando programas y plantillas.</CgState>:null}

    <Box component="form" onSubmit={saveProgram} sx={{mt:1}}>
      <Stack gap={1}>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>
          <CgSelect label="Rutina" value={routineId} onChange={(event)=>{setRoutineId(event.target.value);setSourceProgramId('');}} options={routineOptions}/>
          <CgTextField size="small" required label="Nombre del programa" value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})}/>
          <CgTextField size="small" type="date" label="Inicio" slotProps={{inputLabel:{shrink:true}}} value={form.startsAt} onChange={(event)=>setForm({...form,startsAt:event.target.value})}/>
          <CgSelect label="Plantillas" value={form.sourceTemplateId} onChange={(event)=>applyTemplate(event.target.value)} options={templateOptions}/>
          <CgTextField size="small" multiline minRows={2} label="Notas del programa" value={form.notes} onChange={(event)=>setForm({...form,notes:event.target.value})} sx={{gridColumn:'1/-1'}}/>
        </Box>
        <PeriodizationBuilder value={form.structure} onChange={(structure)=>setForm({...form,structure})} disabled={saving}/>
        <Stack direction={{xs:'column',sm:'row'}} gap={1}>
          <CgButton type="submit" disabled={saving}>{saving?'Guardando…':sourceProgramId?'Crear Nueva versión':'Crear programa'}</CgButton>
          {sourceProgramId?<CgButton type="button" variant="outlined" disabled={saving} onClick={resetDraft}>Cancelar versión</CgButton>:null}
        </Stack>
      </Stack>
    </Box>

    <Divider sx={{my:1.5}}/>
    <Typography variant="subtitle1" fontWeight={700}>Guardar estructura como plantilla</Typography>
    <Stack direction={{xs:'column',sm:'row'}} gap={1} mt={.8}>
      <CgTextField size="small" label="Nombre de plantilla" value={templateName} onChange={(event)=>setTemplateName(event.target.value)} sx={{flex:1}}/>
      <CgButton type="button" variant="outlined" disabled={saving} onClick={()=>void saveTemplate()}>Guardar plantilla</CgButton>
    </Stack>

    <Divider sx={{my:1.5}}/>
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
      <Typography variant="h6">Historial de versiones</Typography>
      <CgButton type="button" size="small" variant="outlined" disabled={loading} onClick={()=>void load()}>Actualizar</CgButton>
    </Stack>
    <Stack gap={.8} mt={1}>
      {programs.length?programs.map((program)=><Paper key={program.id} variant="outlined" sx={{p:1}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
          <Box>
            <Typography variant="body2" fontWeight={700}>{program.name} · v{program.version}</Typography>
            <Typography variant="caption" color="text.secondary">{program.totalWeeks||0} semana(s) · {program.loadWeeks||0} carga · {program.deloadWeeks||0} descarga{program.sourceTemplateName?` · Plantilla: ${program.sourceTemplateName}`:''}</Typography>
          </Box>
          <CgButton type="button" size="small" variant="outlined" onClick={()=>beginVersion(program)} disabled={saving}>Nueva versión</CgButton>
        </Stack>
      </Paper>):<CgEmptyState title="Sin versiones" description="Crea el primer programa para conservar un historial inmutable."/>}
    </Stack>
  </Paper>;
}
