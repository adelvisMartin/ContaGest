import React, { useEffect, useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';

const newMicro=()=>({key:'',label:'',amount:'',unit:'mg'});

export function IngredientNutritionProfilePanel({ingredients=[],Toast}){
  const [ingredientId,setIngredientId]=useState('');
  const [data,setData]=useState(null);
  const [form,setForm]=useState({basisQuantity:'100',basisUnit:'g',energyKcal:'',proteinG:'',carbsG:'',fatG:'',fiberG:'',micronutrients:[]});
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  const active=useMemo(()=>ingredients.filter((item)=>item.active!==false),[ingredients]);
  const options=[{value:'',label:'Seleccionar ingrediente'},...active.map((item)=>({value:item.id,label:item.name}))];
  const selected=active.find((item)=>item.id===ingredientId)||null;

  async function load(id){
    if(!id){setData(null);return;}
    setLoading(true);setError('');
    try{
      const response=await GymVerticalService.ingredientNutritionProfiles(id);
      setData(response);
      const latest=response?.latest||response?.data?.latest||null;
      if(latest){
        setForm({
          basisQuantity:String(latest.basisQuantity??100),
          basisUnit:String(latest.basisUnit||selected?.defaultUnit||'g'),
          energyKcal:String(latest.energyKcal??''),
          proteinG:String(latest.proteinG??''),
          carbsG:String(latest.carbsG??''),
          fatG:String(latest.fatG??''),
          fiberG:String(latest.fiberG??''),
          micronutrients:(latest.micronutrients||[]).map((item)=>({key:item.key||'',label:item.label||'',amount:String(item.amount??''),unit:item.unit||'mg'}))
        });
      }else{
        setForm({basisQuantity:'100',basisUnit:selected?.defaultUnit||'g',energyKcal:'',proteinG:'',carbsG:'',fatG:'',fiberG:'',micronutrients:[]});
      }
    }catch(cause){setError(cause?.message||'No se pudo cargar la composición nutricional.');}
    finally{setLoading(false);}
  }

  useEffect(()=>{void load(ingredientId);},[ingredientId]);

  function updateMicro(index,patch){
    setForm((current)=>({...current,micronutrients:current.micronutrients.map((item,i)=>i===index?{...item,...patch}:item)}));
  }

  async function submit(event){
    event.preventDefault();
    if(!ingredientId)return;
    const payload={
      basisQuantity:Number(form.basisQuantity),
      basisUnit:String(form.basisUnit||'').trim(),
      energyKcal:Number(form.energyKcal),
      proteinG:Number(form.proteinG),
      carbsG:Number(form.carbsG),
      fatG:Number(form.fatG),
      fiberG:Number(form.fiberG),
      micronutrients:form.micronutrients.map((item)=>({
        key:String(item.key||'').trim(),
        label:String(item.label||'').trim(),
        amount:Number(item.amount),
        unit:item.unit
      }))
    };
    const requiredRaw=[form.basisQuantity,form.basisUnit,form.energyKcal,form.proteinG,form.carbsG,form.fatG,form.fiberG];
    if(requiredRaw.some((value)=>String(value??'').trim()==='')||[payload.basisQuantity,payload.energyKcal,payload.proteinG,payload.carbsG,payload.fatG,payload.fiberG].some((value)=>!Number.isFinite(value)||value<0)||payload.basisQuantity<=0){
      setError('Completa la base y los macronutrientes con valores explícitos no negativos.');return;
    }
    if(form.micronutrients.some((item)=>String(item.amount??'').trim()==='')||payload.micronutrients.some((item)=>!item.key||!item.label||!Number.isFinite(item.amount)||item.amount<0)){
      setError('Completa los micronutrientes o elimínalos.');return;
    }
    setSaving(true);setError('');
    try{
      await GymVerticalService.createIngredientNutritionProfile(ingredientId,payload);
      Toast?.show?.('Nueva versión nutricional guardada.','success');
      await load(ingredientId);
    }catch(cause){const message=cause?.message||'No se pudo guardar la composición nutricional.';setError(message);Toast?.show?.(message,'error');}
    finally{setSaving(false);}
  }

  const latest=data?.latest||data?.data?.latest||null;
  const history=data?.history||data?.data?.history||[];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Composición nutricional por ingrediente</Typography>
        <Typography variant="caption" color="text.secondary">Cada guardado crea una versión inmutable. No se convierten unidades automáticamente.</Typography>
      </Box>
      {latest?<CgStatusChip label={`Versión ${latest.version}`} tone="info"/>:null}
    </Stack>
    <Divider sx={{my:1.2}}/>
    <CgSelect label="Ingrediente" value={ingredientId} onChange={(event)=>setIngredientId(event.target.value)} options={options}/>
    {!ingredientId?<Box mt={1}><CgEmptyState title="Selecciona un ingrediente" description="Define su composición sobre una cantidad y unidad explícitas."/></Box>:loading?<Box mt={1}><CgState severity="info" title="Cargando composición">Consultando versiones…</CgState></Box>:<Box component="form" onSubmit={submit} sx={{mt:1}}>
      {error?<Box mb={1}><CgState severity="warning" title="Composición no guardada">{error}</CgState></Box>:null}
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:1}}>
        <CgTextField label="Cantidad base" type="number" inputProps={{min:.001,step:.001}} value={form.basisQuantity} onChange={(e)=>setForm({...form,basisQuantity:e.target.value})}/>
        <CgTextField label="Unidad base" value={form.basisUnit} onChange={(e)=>setForm({...form,basisUnit:e.target.value})}/>
        <CgTextField label="Energía kcal" type="number" inputProps={{min:0,step:.001}} value={form.energyKcal} onChange={(e)=>setForm({...form,energyKcal:e.target.value})}/>
        <CgTextField label="Proteína g" type="number" inputProps={{min:0,step:.001}} value={form.proteinG} onChange={(e)=>setForm({...form,proteinG:e.target.value})}/>
        <CgTextField label="Carbohidratos g" type="number" inputProps={{min:0,step:.001}} value={form.carbsG} onChange={(e)=>setForm({...form,carbsG:e.target.value})}/>
        <CgTextField label="Grasa g" type="number" inputProps={{min:0,step:.001}} value={form.fatG} onChange={(e)=>setForm({...form,fatG:e.target.value})}/>
        <CgTextField label="Fibra g" type="number" inputProps={{min:0,step:.001}} value={form.fiberG} onChange={(e)=>setForm({...form,fiberG:e.target.value})}/>
      </Box>
      <Typography variant="subtitle2" mt={1.2}>Micronutrientes</Typography>
      <Stack gap={.8} mt={.7}>
        {form.micronutrients.map((item,index)=><Box key={index} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1.5fr 1fr 1fr auto'},gap:.8}}>
          <CgTextField label="Clave" value={item.key} onChange={(e)=>updateMicro(index,{key:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'_')})}/>
          <CgTextField label="Nombre" value={item.label} onChange={(e)=>updateMicro(index,{label:e.target.value})}/>
          <CgTextField label="Cantidad" type="number" inputProps={{min:0,step:.001}} value={item.amount} onChange={(e)=>updateMicro(index,{amount:e.target.value})}/>
          <CgSelect label="Unidad" value={item.unit} onChange={(e)=>updateMicro(index,{unit:e.target.value})} options={['g','mg','mcg','IU'].map((value)=>({value,label:value}))}/>
          <CgButton type="button" variant="outlined" onClick={()=>setForm((current)=>({...current,micronutrients:current.micronutrients.filter((_x,i)=>i!==index)}))}>Quitar</CgButton>
        </Box>)}
        <CgButton type="button" variant="outlined" onClick={()=>setForm((current)=>({...current,micronutrients:[...current.micronutrients,newMicro()]}))}>Agregar micronutriente</CgButton>
      </Stack>
      <CgButton type="submit" disabled={saving} sx={{mt:1}}>{saving?'Guardando…':'Guardar nueva versión'}</CgButton>
      {history.length?<Typography variant="caption" color="text.secondary" display="block" mt={1}>Historial inmutable: {history.length} versión(es). Los planes existentes conservan su snapshot original.</Typography>:null}
    </Box>}
  </Paper>;
}
