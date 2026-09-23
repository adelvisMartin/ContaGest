import React, { useEffect, useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField
} from '../ui/cg/CgPrimitives.jsx';
import { FITNESS_MUSCLES } from '../../data/fitnessExerciseCatalog.js';
import { GymVerticalService } from '../../services/verticalService.js';

const EMPTY_FORM={
  name:'',category:'',muscleGroup:'',equipment:'',instructions:'',mediaUrl:'',
  defaultSets:'3',defaultReps:'10',active:true
};
const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const unique=(items)=>[...new Set(items.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));

export function ExerciseLibraryPanel({items=[],onItemsChange,Toast}){
  const [catalog,setCatalog]=useState(rows(items));
  const [filters,setFilters]=useState({q:'',muscleGroup:'',equipment:'',category:'',active:'true'});
  const [form,setForm]=useState(EMPTY_FORM);
  const [editingId,setEditingId]=useState('');
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>setCatalog(rows(items)),[items]);

  const notify=(message,tone='success')=>Toast?.show?.(message,tone);
  const equipmentOptions=useMemo(()=>unique(catalog.map((item)=>item.equipment)),[catalog]);
  const categoryOptions=useMemo(()=>unique(catalog.map((item)=>item.category)),[catalog]);

  function commit(next){
    setCatalog(next);
    onItemsChange?.(next);
  }

  async function load(nextFilters=filters){
    setLoading(true);setError('');
    try{
      const response=await GymVerticalService.exercises(nextFilters);
      commit(rows(response));
    }catch(cause){
      const message=cause?.message||'No se pudo cargar la biblioteca de ejercicios.';
      setError(message);notify(message,'error');
    }finally{setLoading(false);}
  }

  useEffect(()=>{if(!items.length)void load();},[]);

  function startEdit(item){
    setEditingId(item.id);
    setForm({
      name:item.name||'',
      category:item.category||'',
      muscleGroup:item.muscleGroup||'',
      equipment:item.equipment||'',
      instructions:item.instructions||'',
      mediaUrl:item.mediaUrl||'',
      defaultSets:String(item.defaultSets||3),
      defaultReps:item.defaultReps||'10',
      active:item.active!==false
    });
  }

  function resetForm(){
    setEditingId('');
    setForm(EMPTY_FORM);
  }

  async function submit(event){
    event.preventDefault();
    setSaving(true);setError('');
    const payload={
      name:form.name.trim(),
      category:form.category.trim()||null,
      muscleGroup:form.muscleGroup.trim()||null,
      equipment:form.equipment.trim()||null,
      instructions:form.instructions.trim()||null,
      mediaUrl:form.mediaUrl.trim()||null,
      defaultSets:Number(form.defaultSets||3),
      defaultReps:String(form.defaultReps||'10').trim(),
      active:Boolean(form.active)
    };
    try{
      if(editingId){
        const updated=await GymVerticalService.updateExercise(editingId,payload);
        commit(catalog.map((item)=>item.id===editingId?updated:item));
        notify('Ejercicio actualizado.','success');
      }else{
        const created=await GymVerticalService.createExercise(payload);
        commit([created,...catalog]);
        notify('Ejercicio agregado a la biblioteca.','success');
      }
      resetForm();
    }catch(cause){
      const message=cause?.message||'No se pudo guardar el ejercicio.';
      setError(message);notify(message,'error');
    }finally{setSaving(false);}
  }

  async function toggleActive(item){
    setSaving(true);setError('');
    try{
      const updated=await GymVerticalService.updateExercise(item.id,{active:item.active===false});
      commit(catalog.map((entry)=>entry.id===item.id?updated:entry));
      notify(updated.active?'Ejercicio reactivado.':'Ejercicio archivado.','success');
    }catch(cause){
      const message=cause?.message||'No se pudo cambiar el estado.';
      setError(message);notify(message,'error');
    }finally{setSaving(false);}
  }

  const columns=[
    {key:'name',label:'Ejercicio',render:(item)=><Box><Typography variant="body2" fontWeight={700}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.instructions||'Sin instrucciones'}</Typography></Box>},
    {key:'muscle',label:'Grupo muscular',render:(item)=>item.muscleGroup||'—'},
    {key:'equipment',label:'Equipo',render:(item)=>item.equipment||'—'},
    {key:'category',label:'Categoría',render:(item)=>item.category||'—'},
    {key:'defaults',label:'Valores base',render:(item)=>`${item.defaultSets||3} × ${item.defaultReps||'10'}`},
    {key:'status',label:'Estado',render:(item)=><CgStatusChip size="small" label={item.active===false?'Archivado':'Activo'} tone={item.active===false?'warning':'success'}/>},
    {key:'actions',label:'Acciones',render:(item)=><Stack direction="row" gap={.5} flexWrap="wrap"><CgButton type="button" size="small" variant="outlined" onClick={()=>startEdit(item)} disabled={saving}>Editar</CgButton><CgButton type="button" size="small" variant="outlined" color={item.active===false?'primary':'error'} onClick={()=>void toggleActive(item)} disabled={saving}>{item.active===false?'Reactivar':'Archivar'}</CgButton></Stack>}
  ];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box><Typography variant="h6">Biblioteca de ejercicios</Typography><Typography variant="caption" color="text.secondary">Catálogo persistente del tenant para reutilizar ejercicios en rutinas.</Typography></Box>
      <CgButton type="button" variant="outlined" onClick={()=>void load()} disabled={loading}>{loading?'Cargando…':'Reintentar / actualizar'}</CgButton>
    </Stack>
    <Divider sx={{my:1.2}}/>
    {error?<CgState severity="error" title="No se pudo cargar o guardar">{error}</CgState>:null}
    {loading?<CgState severity="info" title="Cargando">Consultando la biblioteca de ejercicios.</CgState>:null}

    <Box component="form" onSubmit={(event)=>{event.preventDefault();void load(filters);}} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(5,minmax(0,1fr))'},gap:1,mt:1}}>
      <CgTextField size="small" label="Buscar ejercicios" value={filters.q} onChange={(e)=>setFilters({...filters,q:e.target.value})}/>
      <CgSelect label="Grupo muscular" value={filters.muscleGroup} onChange={(e)=>setFilters({...filters,muscleGroup:e.target.value})} options={[{value:'',label:'Todos'},...FITNESS_MUSCLES.map((value)=>({value,label:value}))]}/>
      <CgSelect label="Equipo" value={filters.equipment} onChange={(e)=>setFilters({...filters,equipment:e.target.value})} options={[{value:'',label:'Todos'},...equipmentOptions.map((value)=>({value,label:value}))]}/>
      <CgSelect label="Categoría" value={filters.category} onChange={(e)=>setFilters({...filters,category:e.target.value})} options={[{value:'',label:'Todas'},...categoryOptions.map((value)=>({value,label:value}))]}/>
      <Stack direction="row" gap={.5}><CgSelect label="Estado" value={filters.active} onChange={(e)=>setFilters({...filters,active:e.target.value})} options={[{value:'true',label:'Activos'},{value:'false',label:'Archivados'},{value:'',label:'Todos'}]}/><CgButton type="submit" disabled={loading}>Filtrar</CgButton></Stack>
    </Box>

    <Box sx={{mt:1.2,maxWidth:'100%',overflowX:'auto'}}>
      {catalog.length?<CgDataTable columns={columns} rows={catalog} empty="Sin ejercicios"/>:<CgEmptyState title="Biblioteca vacía" description="Crea el primer ejercicio persistente o cambia los filtros."/>}
    </Box>

    <Divider sx={{my:1.5}}/>
    <Typography variant="h6">{editingId?'Editar ejercicio':'Nuevo ejercicio'}</Typography>
    <Box component="form" onSubmit={submit} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1,mt:1}}>
      <CgTextField size="small" label="Nombre" required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/>
      <CgTextField size="small" label="Categoría" value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}/>
      <CgSelect label="Grupo muscular" value={form.muscleGroup} onChange={(e)=>setForm({...form,muscleGroup:e.target.value})} options={[{value:'',label:'Sin grupo'},...FITNESS_MUSCLES.map((value)=>({value,label:value}))]}/>
      <CgTextField size="small" label="Equipo" value={form.equipment} onChange={(e)=>setForm({...form,equipment:e.target.value})}/>
      <CgTextField size="small" label="Series por defecto" type="number" inputProps={{min:1,max:20,step:1}} value={form.defaultSets} onChange={(e)=>setForm({...form,defaultSets:e.target.value})}/>
      <CgTextField size="small" label="Repeticiones por defecto" value={form.defaultReps} onChange={(e)=>setForm({...form,defaultReps:e.target.value})}/>
      <CgTextField size="small" label="Media URL" type="url" value={form.mediaUrl} onChange={(e)=>setForm({...form,mediaUrl:e.target.value})} sx={{gridColumn:'1/-1'}}/>
      <CgTextField size="small" multiline minRows={3} label="Instrucciones" value={form.instructions} onChange={(e)=>setForm({...form,instructions:e.target.value})} sx={{gridColumn:'1/-1'}}/>
      <Stack direction="row" gap={.8} sx={{gridColumn:'1/-1'}}><CgButton type="submit" disabled={saving||!form.name.trim()}>{saving?'Guardando…':editingId?'Guardar cambios':'Nuevo ejercicio'}</CgButton>{editingId?<CgButton type="button" variant="outlined" onClick={resetForm} disabled={saving}>Cancelar</CgButton>:null}</Stack>
    </Box>
  </Paper>;
}
