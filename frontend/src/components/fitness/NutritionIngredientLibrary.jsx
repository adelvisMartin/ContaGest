import React, { useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgDataTable, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';
import { FoodDataCentralService } from '../../services/foodDataCentralService.js';

const emptyFood=()=>({
  name:'',brand:'',source:'manual',sourceRef:'',
  caloriesPer100g:'0',proteinGPer100g:'0',carbsGPer100g:'0',fatGPer100g:'0',fiberGPer100g:'0'
});
const emptyIngredient=(foods)=>({foodId:foods[0]?.id||'',grams:'100'});
const number=(value)=>Number(value||0);
const fmt=(value,digits=1)=>number(value).toLocaleString('es-VE',{maximumFractionDigits:digits});

function MacroStrip({calories,proteinG,carbsG,fatG,fiberG}){
  return <Stack direction="row" gap={.7} flexWrap="wrap">
    <CgStatusChip size="small" label={`${fmt(calories,0)} kcal`} tone="primary"/>
    <CgStatusChip size="small" label={`P ${fmt(proteinG)} g`} tone="success"/>
    <CgStatusChip size="small" label={`C ${fmt(carbsG)} g`} tone="info"/>
    <CgStatusChip size="small" label={`G ${fmt(fatG)} g`} tone="warning"/>
    <CgStatusChip size="small" label={`Fibra ${fmt(fiberG)} g`} tone="default"/>
  </Stack>;
}

export function NutritionIngredientLibrary({foods=[],recipes=[],Toast,onChanged}){
  const [foodForm,setFoodForm]=useState(emptyFood);
  const [recipeName,setRecipeName]=useState('');
  const [recipeServings,setRecipeServings]=useState('1');
  const [recipeInstructions,setRecipeInstructions]=useState('');
  const [ingredients,setIngredients]=useState([emptyIngredient(foods)]);
  const [busy,setBusy]=useState('');
  const [usdaQuery,setUsdaQuery]=useState('');
  const [usdaResults,setUsdaResults]=useState([]);
  const [error,setError]=useState('');

  const activeFoods=useMemo(()=>foods.filter((item)=>item.active!==false),[foods]);
  const foodOptions=useMemo(()=>[{value:'',label:'Seleccionar alimento'},...activeFoods.map((food)=>({value:food.id,label:`${food.name}${food.brand?` · ${food.brand}`:''}`}))],[activeFoods]);

  const notify=(message,tone='success')=>Toast?.show?.(message,tone);

  function updateIngredient(index,patch){
    setIngredients((current)=>current.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item));
  }
  function removeIngredient(index){
    setIngredients((current)=>current.length===1?current:current.filter((_item,itemIndex)=>itemIndex!==index));
  }

  async function searchUsda(){
    const q=usdaQuery.trim();
    if(q.length<2)return;
    setBusy('usda');setError('');
    try{
      const results=await FoodDataCentralService.search(q,{pageSize:8});
      setUsdaResults(results);
    }catch(cause){
      const message=cause?.message||'No se pudo consultar USDA.';
      setError(message);
      notify(message,'error');
    }finally{setBusy('');}
  }

  async function useUsda(food){
    const detail=await FoodDataCentralService.detail(food.fdcId||food.id);
    const nutrients=detail?.nutrients||detail?.foodNutrients||{};
    const pick=(keys)=>{
      for(const key of keys){
        const direct=nutrients?.[key];
        if(direct!=null&&Number.isFinite(Number(direct)))return Number(direct);
      }
      return 0;
    };
    setFoodForm({
      name:detail?.description||food.description||food.name||'',
      brand:detail?.brandOwner||detail?.brandName||food.brandOwner||'',
      source:'usda',
      sourceRef:String(detail?.fdcId||food.fdcId||food.id||''),
      caloriesPer100g:String(pick(['calories','energyKcal','Energy'])),
      proteinGPer100g:String(pick(['protein','Protein'])),
      carbsGPer100g:String(pick(['carbohydrates','carbs','Carbohydrate'])),
      fatGPer100g:String(pick(['fat','totalFat','Total lipid (fat)'])),
      fiberGPer100g:String(pick(['fiber','dietaryFiber','Fiber, total dietary']))
    });
  }

  async function submitFood(event){
    event.preventDefault();
    setBusy('food');setError('');
    try{
      await GymVerticalService.createFood({
        ...foodForm,
        caloriesPer100g:number(foodForm.caloriesPer100g),
        proteinGPer100g:number(foodForm.proteinGPer100g),
        carbsGPer100g:number(foodForm.carbsGPer100g),
        fatGPer100g:number(foodForm.fatGPer100g),
        fiberGPer100g:number(foodForm.fiberGPer100g),
        sourceRef:foodForm.sourceRef||null,
        active:true
      });
      setFoodForm(emptyFood());
      setUsdaResults([]);
      notify('Alimento agregado al catálogo.','success');
      await onChanged?.();
    }catch(cause){
      const message=cause?.message||'No se pudo guardar el alimento.';
      setError(message);notify(message,'error');
    }finally{setBusy('');}
  }

  async function submitRecipe(event){
    event.preventDefault();
    if(!recipeName.trim())return;
    const normalized=ingredients
      .map((item,index)=>({foodId:item.foodId,grams:number(item.grams),sortOrder:index+1}))
      .filter((item)=>item.foodId&&item.grams>0);
    if(!normalized.length)return notify('Agrega al menos un ingrediente con gramos válidos.','warning');
    if(new Set(normalized.map((item)=>item.foodId)).size!==normalized.length)return notify('No repitas alimentos dentro de una receta; ajusta los gramos del ingrediente existente.','warning');
    setBusy('recipe');setError('');
    try{
      await GymVerticalService.createRecipe({
        name:recipeName.trim(),
        servings:Number(recipeServings||1),
        instructions:recipeInstructions.trim()||null,
        ingredients:normalized
      });
      setRecipeName('');setRecipeServings('1');setRecipeInstructions('');
      setIngredients([emptyIngredient(activeFoods)]);
      notify('Receta guardada; los macros se derivan de sus ingredientes.','success');
      await onChanged?.();
    }catch(cause){
      const message=cause?.message||'No se pudo guardar la receta.';
      setError(message);notify(message,'error');
    }finally{setBusy('');}
  }

  const foodColumns=[
    {key:'name',label:'Alimento',render:(row)=><Box><Typography variant="body2" fontWeight={700}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{row.brand||'Sin marca'} · {row.source==='usda'?`USDA ${row.sourceRef||''}`:'Manual'}</Typography></Box>},
    {key:'macros',label:'Macros / 100 g',render:(row)=><MacroStrip calories={row.caloriesPer100g} proteinG={row.proteinGPer100g} carbsG={row.carbsGPer100g} fatG={row.fatGPer100g} fiberG={row.fiberGPer100g}/>},
    {key:'status',label:'Estado',render:(row)=><CgStatusChip size="small" label={row.active===false?'Archivado':'Activo'} tone={row.active===false?'default':'success'}/>}
  ];

  const recipeColumns=[
    {key:'name',label:'Receta',render:(row)=><Box><Typography variant="body2" fontWeight={700}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{row.servings} porción(es) · {Array.isArray(row.ingredients)?row.ingredients.length:0} Ingredientes</Typography></Box>},
    {key:'total',label:'Total receta',render:(row)=><MacroStrip calories={row.totalCalories} proteinG={row.totalProteinG} carbsG={row.totalCarbsG} fatG={row.totalFatG} fiberG={row.totalFiberG}/>},
    {key:'serving',label:'Por porción',render:(row)=><MacroStrip calories={row.perServing?.calories} proteinG={row.perServing?.proteinG} carbsG={row.perServing?.carbsG} fatG={row.perServing?.fatG} fiberG={row.perServing?.fiberG}/>}
  ];

  return <Stack gap={1.25}>
    {error?<CgState severity="warning" title="Catálogo nutricional incompleto">{error}</CgState>:null}

    <Paper variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Alimentos</Typography>
      <Typography variant="caption" color="text.secondary">Catálogo por ingrediente con Calorías, Proteína, Carbohidratos, Grasas y Fibra por 100 g.</Typography>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(0,1fr) auto'},gap:1,mt:1}}>
        <CgTextField label="Buscar USDA" value={usdaQuery} onChange={(e)=>setUsdaQuery(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'){e.preventDefault();void searchUsda();}}}/>
        <CgButton type="button" variant="outlined" disabled={busy==='usda'||usdaQuery.trim().length<2} onClick={()=>void searchUsda()}>{busy==='usda'?'Buscando…':'Buscar USDA'}</CgButton>
      </Box>
      {usdaResults.length?<Stack gap={.6} mt={1}>{usdaResults.map((item)=><Paper key={item.fdcId||item.id} variant="outlined" sx={{p:1}}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Box><Typography variant="body2" fontWeight={700}>{item.description||item.name}</Typography><Typography variant="caption" color="text.secondary">USDA · {item.fdcId||item.id}</Typography></Box><CgButton size="small" variant="outlined" onClick={()=>void useUsda(item)}>Usar alimento</CgButton></Stack></Paper>)}</Stack>:null}

      <Box component="form" onSubmit={submitFood} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))',xl:'repeat(4,minmax(0,1fr))'},gap:1,mt:1.2}}>
        <CgTextField label="Nombre" required value={foodForm.name} onChange={(e)=>setFoodForm({...foodForm,name:e.target.value})}/>
        <CgTextField label="Marca" value={foodForm.brand} onChange={(e)=>setFoodForm({...foodForm,brand:e.target.value})}/>
        <CgSelect label="Fuente" value={foodForm.source} onChange={(e)=>setFoodForm({...foodForm,source:e.target.value,sourceRef:e.target.value==='manual'?'':foodForm.sourceRef})} options={[{value:'manual',label:'Manual'},{value:'usda',label:'USDA'}]}/>
        <CgTextField label="Referencia USDA/FDC" disabled={foodForm.source!=='usda'} value={foodForm.sourceRef} onChange={(e)=>setFoodForm({...foodForm,sourceRef:e.target.value})}/>
        <CgTextField label="Calorías / 100 g" type="number" inputProps={{min:0,step:.01}} value={foodForm.caloriesPer100g} onChange={(e)=>setFoodForm({...foodForm,caloriesPer100g:e.target.value})}/>
        <CgTextField label="Proteína g / 100 g" type="number" inputProps={{min:0,step:.01}} value={foodForm.proteinGPer100g} onChange={(e)=>setFoodForm({...foodForm,proteinGPer100g:e.target.value})}/>
        <CgTextField label="Carbohidratos g / 100 g" type="number" inputProps={{min:0,step:.01}} value={foodForm.carbsGPer100g} onChange={(e)=>setFoodForm({...foodForm,carbsGPer100g:e.target.value})}/>
        <CgTextField label="Grasas g / 100 g" type="number" inputProps={{min:0,step:.01}} value={foodForm.fatGPer100g} onChange={(e)=>setFoodForm({...foodForm,fatGPer100g:e.target.value})}/>
        <CgTextField label="Fibra g / 100 g" type="number" inputProps={{min:0,step:.01}} value={foodForm.fiberGPer100g} onChange={(e)=>setFoodForm({...foodForm,fiberGPer100g:e.target.value})}/>
        <CgButton type="submit" disabled={busy==='food'||!foodForm.name.trim()} sx={{alignSelf:'center'}}>{busy==='food'?'Guardando…':'Guardar alimento'}</CgButton>
      </Box>
      <Box sx={{mt:1.3,maxWidth:'100%',overflowX:'auto'}}>{foods.length?<CgDataTable columns={foodColumns} rows={foods} empty="Sin alimentos"/>:<CgEmptyState title="Sin Alimentos" description="Agrega manualmente un alimento o impórtalo desde USDA."/ >}</Box>
    </Paper>

    <Paper variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Recetas</Typography>
      <Typography variant="caption" color="text.secondary">Combina Ingredientes del catálogo; los macros se calculan por gramos y nunca desde un total escrito por el cliente.</Typography>
      <Box component="form" onSubmit={submitRecipe} sx={{mt:1}}>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'2fr .7fr'},gap:1}}>
          <CgTextField label="Nombre de receta" required value={recipeName} onChange={(e)=>setRecipeName(e.target.value)}/>
          <CgTextField label="Porciones" type="number" inputProps={{min:1,max:100,step:1}} value={recipeServings} onChange={(e)=>setRecipeServings(e.target.value)}/>
        </Box>
        <CgTextField fullWidth multiline minRows={2} label="Preparación / instrucciones" value={recipeInstructions} onChange={(e)=>setRecipeInstructions(e.target.value)} sx={{mt:1}}/>
        <Stack gap={.8} mt={1}>
          {ingredients.map((ingredient,index)=><Box key={index} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'minmax(0,1fr) 140px auto'},gap:.8,alignItems:'center'}}>
            <CgSelect label={`Ingrediente ${index+1}`} value={ingredient.foodId} onChange={(e)=>updateIngredient(index,{foodId:e.target.value})} options={foodOptions}/>
            <CgTextField label="Gramos" type="number" inputProps={{min:.01,max:100000,step:.01}} value={ingredient.grams} onChange={(e)=>updateIngredient(index,{grams:e.target.value})}/>
            <CgButton type="button" variant="outlined" color="error" disabled={ingredients.length===1} onClick={()=>removeIngredient(index)}>Quitar</CgButton>
          </Box>)}
        </Stack>
        <Stack direction="row" gap=.8 mt={1} flexWrap="wrap">
          <CgButton type="button" variant="outlined" disabled={!activeFoods.length} onClick={()=>setIngredients((current)=>[...current,emptyIngredient(activeFoods)])}>Agregar ingrediente</CgButton>
          <CgButton type="submit" disabled={busy==='recipe'||!activeFoods.length||!recipeName.trim()}>{busy==='recipe'?'Guardando…':'Guardar receta'}</CgButton>
        </Stack>
      </Box>
      <Divider sx={{my:1.3}}/>
      <Box sx={{maxWidth:'100%',overflowX:'auto'}}>{recipes.length?<CgDataTable columns={recipeColumns} rows={recipes} empty="Sin recetas"/>:<CgEmptyState title="Sin Recetas" description="Crea una receta a partir de alimentos del catálogo."/ >}</Box>
    </Paper>
  </Stack>;
}
