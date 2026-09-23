import React, { useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgDataTable, CgEmptyState, CgSelect, CgState, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';

const newItem=()=>({ingredientId:'',quantity:'100',unit:'g',notes:''});

export function NutritionRecipeLibrary({ingredients=[],recipes=[],Toast,onChanged}){
  const [name,setName]=useState('');
  const [servings,setServings]=useState('1');
  const [preparation,setPreparation]=useState('');
  const [items,setItems]=useState([newItem()]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const activeIngredients=useMemo(()=>ingredients.filter((item)=>item.active!==false),[ingredients]);
  const options=useMemo(()=>[{value:'',label:'Seleccionar ingrediente'},...activeIngredients.map((item)=>({value:item.id,label:`${item.name} · ${item.defaultUnit||'g'}`}))],[activeIngredients]);
  const notify=(message,tone='success')=>Toast?.show?.(message,tone);

  function updateItem(index,patch){setItems((current)=>current.map((item,i)=>i===index?{...item,...patch}:item));}
  function removeItem(index){setItems((current)=>current.length===1?current:current.filter((_item,i)=>i!==index));}

  async function submit(event){
    event.preventDefault();
    const normalized=items.map((item)=>({...item,quantity:Number(item.quantity)}));
    if(!name.trim()||normalized.some((item)=>!item.ingredientId||!Number.isFinite(item.quantity)||item.quantity<=0))return;
    setSaving(true);setError('');
    try{
      await GymVerticalService.createRecipe({name:name.trim(),servings:Number(servings||1),preparation:preparation.trim()||null,items:normalized});
      setName('');setServings('1');setPreparation('');setItems([newItem()]);
      notify('Receta guardada.','success');await onChanged?.();
    }catch(cause){const message=cause?.message||'No se pudo guardar la receta.';setError(message);notify(message,'error');}
    finally{setSaving(false);}
  }

  const columns=[
    {key:'name',label:'Receta',render:(row)=><Box><Typography variant="body2" fontWeight={700}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{Number(row.servings||1)} porción(es)</Typography></Box>},
    {key:'items',label:'Ingredientes',render:(row)=>(row.items||[]).map((item)=>`${item.ingredientName||'Ingrediente'} ${item.quantity} ${item.unit}`).join(' · ')||'—'},
    {key:'preparation',label:'Preparación',render:(row)=>row.preparation||'Sin instrucciones'}
  ];

  return <Paper variant="outlined" sx={{p:1.5}}>
    <Typography variant="h6">Recetas</Typography>
    <Typography variant="caption" color="text.secondary">Recetas reutilizables con porciones reales y preparación explícita.</Typography>
    {error?<Box mt={1}><CgState severity="warning" title="Receta no guardada">{error}</CgState></Box>:null}
    <Box component="form" onSubmit={submit} sx={{mt:1}}>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'2fr 1fr'},gap:1}}>
        <CgTextField label="Nombre de receta" required value={name} onChange={(e)=>setName(e.target.value)}/>
        <CgTextField label="Porciones" type="number" inputProps={{min:.001,max:100,step:.001}} value={servings} onChange={(e)=>setServings(e.target.value)}/>
      </Box>
      <CgTextField fullWidth multiline minRows={2} label="Preparación" value={preparation} onChange={(e)=>setPreparation(e.target.value)} sx={{mt:1}}/>
      <Stack gap={.8} mt={1}>
        {items.map((item,index)=><Box key={index} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'2fr 1fr 1fr auto'},gap:.8,alignItems:'center'}}>
          <CgSelect label={`Ingrediente ${index+1}`} value={item.ingredientId} options={options} onChange={(e)=>{const ingredient=activeIngredients.find((x)=>x.id===e.target.value);updateItem(index,{ingredientId:e.target.value,unit:ingredient?.defaultUnit||item.unit});}}/>
          <CgTextField label="Cantidad" type="number" inputProps={{min:.001,step:.001}} value={item.quantity} onChange={(e)=>updateItem(index,{quantity:e.target.value})}/>
          <CgTextField label="Unidad" value={item.unit} onChange={(e)=>updateItem(index,{unit:e.target.value})}/>
          <CgButton type="button" variant="outlined" color="error" disabled={items.length===1} onClick={()=>removeItem(index)}>Quitar</CgButton>
        </Box>)}
      </Stack>
      <Stack direction="row" gap={.8} mt={1}>
        <CgButton type="button" variant="outlined" disabled={!activeIngredients.length} onClick={()=>setItems((current)=>[...current,newItem()])}>Agregar ingrediente</CgButton>
        <CgButton type="submit" disabled={saving||!activeIngredients.length}>{saving?'Guardando…':'Guardar receta'}</CgButton>
      </Stack>
    </Box>
    <Divider sx={{my:1.2}}/>
    {recipes.length?<CgDataTable columns={columns} rows={recipes} empty="Sin recetas"/>:<CgEmptyState title="Sin recetas" description="Crea la primera receta reusable."/>}
  </Paper>;
}
