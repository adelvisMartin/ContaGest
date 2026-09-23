import React, { useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';

const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const emptyForm=()=>({
  id:'',name:'',category:'',defaultUnit:'g',notes:'',active:true,
  nutrientBasisQuantity:'100',nutrientBasisUnit:'g',
  energyKcal:'',proteinG:'',carbsG:'',fatG:'',fiberG:'',
  nutritionSource:'',nutritionSourceRef:'',micronutrients:[]
});
const microsToRows=(value)=>Object.entries(value&&typeof value==='object'?value:{}).map(([name,item])=>({
  name,amount:item?.amount??'',unit:item?.unit??''
}));
const microsToMap=(items)=>Object.fromEntries(items.filter((item)=>item.name.trim()).map((item)=>[
  item.name.trim(),{amount:Number(item.amount),unit:item.unit.trim()}
]));

export function IngredientLibraryPanel({items=[],onItemsChange,Toast}){
  const [q,setQ]=useState('');
  const [form,setForm]=useState(emptyForm);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  const filtered=useMemo(()=>{
    const needle=q.trim().toLocaleLowerCase('es');
    if(!needle)return rows(items);
    return rows(items).filter((item)=>String(item.name||'').toLocaleLowerCase('es').includes(needle)||String(item.category||'').toLocaleLowerCase('es').includes(needle));
  },[items,q]);

  const reset=()=>setForm(emptyForm());

  async function refresh(){
    const response=await GymVerticalService.ingredients();
    onItemsChange?.(rows(response));
  }

  function updateMicro(index,patch){
    setForm((current)=>({...current,micronutrients:current.micronutrients.map((item,i)=>i===index?{...item,...patch}:item)}));
  }

  async function submit(event){
    event.preventDefault();
    if(!form.name.trim()){setError('Indica el nombre del ingrediente.');return;}
    const micronutrients=microsToMap(form.micronutrients);
    if(form.micronutrients.some((item)=>item.name.trim()&&(!Number.isFinite(Number(item.amount))||Number(item.amount)<0||!item.unit.trim()))){
      setError('Cada micronutriente necesita cantidad válida y unidad.');return;
    }
    const nutrientValues=[form.energyKcal,form.proteinG,form.carbsG,form.fatG,form.fiberG].filter((value)=>value!=='');
    const hasComposition=nutrientValues.length>0||Object.keys(micronutrients).length>0;
    if(hasComposition&&(!Number(form.nutrientBasisQuantity)||!form.nutrientBasisUnit.trim()||!form.nutritionSource.trim())){
      setError('La composición nutricional requiere cantidad base, unidad base y procedencia.');return;
    }
    setSaving(true);setError('');
    try{
      const numberOrNull=(value)=>value===''?null:Number(value);
      const payload={
        name:form.name.trim(),
        category:form.category.trim()||null,
        defaultUnit:form.defaultUnit.trim()||'g',
        notes:form.notes.trim()||null,
        active:Boolean(form.active),
        nutrientBasisQuantity:hasComposition?numberOrNull(form.nutrientBasisQuantity):null,
        nutrientBasisUnit:hasComposition?(form.nutrientBasisUnit.trim()||null):null,
        energyKcal:numberOrNull(form.energyKcal),
        proteinG:numberOrNull(form.proteinG),
        carbsG:numberOrNull(form.carbsG),
        fatG:numberOrNull(form.fatG),
        fiberG:numberOrNull(form.fiberG),
        micronutrients,
        nutritionSource:hasComposition?(form.nutritionSource.trim()||null):null,
        nutritionSourceRef:form.nutritionSourceRef.trim()||null
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

  function edit(item){
    setForm({
      id:item.id,name:item.name||'',category:item.category||'',defaultUnit:item.defaultUnit||'g',notes:item.notes||'',active:Boolean(item.active),
      nutrientBasisQuantity:item.nutrientBasisQuantity??'100',nutrientBasisUnit:item.nutrientBasisUnit||item.defaultUnit||'g',
      energyKcal:item.energyKcal??'',proteinG:item.proteinG??'',carbsG:item.carbsG??'',fatG:item.fatG??'',fiberG:item.fiberG??'',
      nutritionSource:item.nutritionSource||'',nutritionSourceRef:item.nutritionSourceRef||'',micronutrients:microsToRows(item.micronutrients)
    });
  }

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Catálogo de ingredientes</Typography>
        <Typography variant="caption" color="text.secondary">Identidad y composición nutricional persistente con base, unidad y procedencia explícitas. No se infieren conversiones.</Typography>
      </Box>
      <CgStatusChip label={`${rows(items).filter((item)=>item.active).length} activos`} tone="info"/>
    </Stack>
    <Divider sx={{my:1.2}}/>
    {error?<CgState severity="error" title="No se pudo guardar">{error}</CgState>:null}
    <Box component="form" onSubmit={submit} sx={{mt:error?1:0}}>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'2fr 1fr 1fr'},gap:1}}>
        <CgTextField size="small" label="Ingrediente" required value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})}/>
        <CgTextField size="small" label="Categoría" value={form.category} onChange={(event)=>setForm({...form,category:event.target.value})}/>
        <CgSelect label="Unidad base operativa" value={form.defaultUnit} onChange={(event)=>setForm({...form,defaultUnit:event.target.value})} options={['g','ml','unidad','porción'].map((value)=>({value,label:value}))}/>
      </Box>

      <Typography variant="subtitle2" sx={{mt:1.2}}>Composición nutricional</Typography>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',md:'repeat(4,minmax(0,1fr))'},gap:1,mt:.7}}>
        <CgTextField size="small" label="Cantidad base" type="number" inputProps={{min:.001,step:.001}} value={form.nutrientBasisQuantity} onChange={(e)=>setForm({...form,nutrientBasisQuantity:e.target.value})}/>
        <CgSelect label="Unidad nutricional" value={form.nutrientBasisUnit} onChange={(e)=>setForm({...form,nutrientBasisUnit:e.target.value})} options={['g','ml','unidad','porción'].map((value)=>({value,label:value}))}/>
        <CgTextField size="small" label="Energía kcal" type="number" inputProps={{min:0,step:.001}} value={form.energyKcal} onChange={(e)=>setForm({...form,energyKcal:e.target.value})}/>
        <CgTextField size="small" label="Proteína g" type="number" inputProps={{min:0,step:.001}} value={form.proteinG} onChange={(e)=>setForm({...form,proteinG:e.target.value})}/>
        <CgTextField size="small" label="Carbohidratos g" type="number" inputProps={{min:0,step:.001}} value={form.carbsG} onChange={(e)=>setForm({...form,carbsG:e.target.value})}/>
        <CgTextField size="small" label="Grasa g" type="number" inputProps={{min:0,step:.001}} value={form.fatG} onChange={(e)=>setForm({...form,fatG:e.target.value})}/>
        <CgTextField size="small" label="Fibra g" type="number" inputProps={{min:0,step:.001}} value={form.fiberG} onChange={(e)=>setForm({...form,fiberG:e.target.value})}/>
        <CgTextField size="small" label="Procedencia" placeholder="FoodData / etiqueta / importación" value={form.nutritionSource} onChange={(e)=>setForm({...form,nutritionSource:e.target.value})}/>
      </Box>
      <CgTextField size="small" fullWidth label="Referencia de procedencia" value={form.nutritionSourceRef} onChange={(e)=>setForm({...form,nutritionSourceRef:e.target.value})} sx={{mt:1}}/>

      <Stack gap={.7} mt={1}>
        <Typography variant="caption" color="text.secondary" fontWeight={700}>Micronutrientes disponibles en la fuente</Typography>
        {form.micronutrients.map((item,index)=><Box key={index} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'2fr 1fr 1fr auto'},gap:.7}}>
          <CgTextField size="small" label="Micronutriente" value={item.name} onChange={(e)=>updateMicro(index,{name:e.target.value})}/>
          <CgTextField size="small" label="Cantidad" type="number" inputProps={{min:0,step:.001}} value={item.amount} onChange={(e)=>updateMicro(index,{amount:e.target.value})}/>
          <CgTextField size="small" label="Unidad" placeholder="mg, µg…" value={item.unit} onChange={(e)=>updateMicro(index,{unit:e.target.value})}/>
          <CgButton type="button" size="small" variant="outlined" onClick={()=>setForm((current)=>({...current,micronutrients:current.micronutrients.filter((_x,i)=>i!==index)}))}>Quitar</CgButton>
        </Box>)}
        <CgButton type="button" size="small" variant="outlined" onClick={()=>setForm((current)=>({...current,micronutrients:[...current.micronutrients,{name:'',amount:'',unit:''}]}))}>Agregar micronutriente</CgButton>
      </Stack>

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
            {item.nutrientBasisQuantity?<Typography variant="caption" display="block" color="text.secondary">
              Base {item.nutrientBasisQuantity} {item.nutrientBasisUnit} · {item.energyKcal??'—'} kcal · P {item.proteinG??'—'} g · C {item.carbsG??'—'} g · G {item.fatG??'—'} g · Fibra {item.fiberG??'—'} g · {item.nutritionSource||'sin procedencia'}
            </Typography>:null}
          </Box>
          <Stack direction="row" gap={.6} flexWrap="wrap">
            <CgStatusChip label={item.active?'Activo':'Archivado'} tone={item.active?'success':'warning'}/>
            <CgButton size="small" variant="outlined" onClick={()=>edit(item)}>Editar</CgButton>
            <CgButton size="small" variant="outlined" onClick={()=>void toggle(item)} disabled={saving}>{item.active?'Archivar':'Reactivar'}</CgButton>
          </Stack>
        </Stack>
      </Paper>):<CgEmptyState title="Sin ingredientes" description="Crea el primer ingrediente estructurado del tenant."/>}
    </Stack>
  </Paper>;
}
