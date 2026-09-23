import React, { useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';

const rows=(value)=>Array.isArray(value)?value:value?.data||[];

export function IngredientLibraryPanel({items=[],onItemsChange,Toast}){
  const [q,setQ]=useState('');
  const [form,setForm]=useState({id:'',name:'',category:'',defaultUnit:'g',notes:'',active:true});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  const filtered=useMemo(()=>{
    const needle=q.trim().toLocaleLowerCase('es');
    if(!needle)return rows(items);
    return rows(items).filter((item)=>String(item.name||'').toLocaleLowerCase('es').includes(needle)||String(item.category||'').toLocaleLowerCase('es').includes(needle));
  },[items,q]);

  const reset=()=>setForm({id:'',name:'',category:'',defaultUnit:'g',notes:'',active:true});

  async function refresh(){
    const response=await GymVerticalService.ingredients();
    onItemsChange?.(rows(response));
  }

  async function submit(event){
    event.preventDefault();
    if(!form.name.trim()){setError('Indica el nombre del ingrediente.');return;}
    setSaving(true);setError('');
    try{
      const payload={
        name:form.name.trim(),
        category:form.category.trim()||null,
        defaultUnit:form.defaultUnit.trim()||'g',
        notes:form.notes.trim()||null,
        active:Boolean(form.active)
      };
      if(form.id)await GymVerticalService.updateIngredient(form.id,payload);
      else await GymVerticalService.createIngredient(payload);
      await refresh();
      Toast?.show?.(form.id?'Ingrediente actualizado.':'Ingrediente creado.','success');
      reset();
    }catch(cause){
      const message=cause?.message||'No se pudo guardar el ingrediente.';
      setError(message);Toast?.show?.(message,'error');
    }finally{setSaving(false);}
  }

  async function toggle(item){
    setSaving(true);setError('');
    try{
      await GymVerticalService.updateIngredient(item.id,{active:!item.active});
      await refresh();
      Toast?.show?.(item.active?'Ingrediente archivado.':'Ingrediente reactivado.','success');
      if(form.id===item.id)reset();
    }catch(cause){
      const message=cause?.message||'No se pudo cambiar el estado del ingrediente.';
      setError(message);Toast?.show?.(message,'error');
    }finally{setSaving(false);}
  }

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Catálogo de ingredientes</Typography>
        <Typography variant="caption" color="text.secondary">Identidad, categoría y unidad base. La composición nutricional detallada pertenece a 46/51.</Typography>
      </Box>
      <CgStatusChip label={`${rows(items).filter((item)=>item.active).length} activos`} tone="info"/>
    </Stack>
    <Divider sx={{my:1.2}}/>
    {error?<CgState severity="error" title="No se pudo guardar">{error}</CgState>:null}
    <Box component="form" onSubmit={submit} sx={{mt:error?1:0}}>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'2fr 1fr 1fr'},gap:1}}>
        <CgTextField size="small" label="Ingrediente" required value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})}/>
        <CgTextField size="small" label="Categoría" value={form.category} onChange={(event)=>setForm({...form,category:event.target.value})}/>
        <CgSelect label="Unidad base" value={form.defaultUnit} onChange={(event)=>setForm({...form,defaultUnit:event.target.value})} options={['g','ml','unidad','porción'].map((value)=>({value,label:value}))}/>
      </Box>
      <CgTextField size="small" multiline minRows={2} fullWidth label="Notas" value={form.notes} onChange={(event)=>setForm({...form,notes:event.target.value})} sx={{mt:1}}/>
      <Stack direction="row" gap={1} mt={1} flexWrap="wrap">
        <CgButton type="submit" disabled={saving}>{saving?'Guardando…':form.id?'Guardar cambios':'Nuevo ingrediente'}</CgButton>
        {form.id?<CgButton type="button" variant="outlined" onClick={reset} disabled={saving}>Cancelar edición</CgButton>:null}
      </Stack>
    </Box>

    <Divider sx={{my:1.4}}/>
    <CgTextField size="small" fullWidth label="Buscar ingrediente" value={q} onChange={(event)=>setQ(event.target.value)}/>
    <Stack gap={.7} mt={1}>
      {filtered.length?filtered.map((item)=><Paper key={item.id} variant="outlined" sx={{p:1}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
          <Box>
            <Typography variant="body2" fontWeight={700}>{item.name}</Typography>
            <Typography variant="caption" color="text.secondary">{item.category||'Sin categoría'} · unidad {item.defaultUnit||'g'}</Typography>
          </Box>
          <Stack direction="row" gap={.6} flexWrap="wrap">
            <CgStatusChip label={item.active?'Activo':'Archivado'} tone={item.active?'success':'warning'}/>
            <CgButton size="small" variant="outlined" onClick={()=>setForm({id:item.id,name:item.name||'',category:item.category||'',defaultUnit:item.defaultUnit||'g',notes:item.notes||'',active:Boolean(item.active)})}>Editar</CgButton>
            <CgButton size="small" variant="outlined" onClick={()=>void toggle(item)} disabled={saving}>{item.active?'Archivar':'Reactivar'}</CgButton>
          </Stack>
        </Stack>
      </Paper>):<CgEmptyState title="Sin ingredientes" description="Crea el primer ingrediente estructurado del tenant."/>}
    </Stack>
  </Paper>;
}
