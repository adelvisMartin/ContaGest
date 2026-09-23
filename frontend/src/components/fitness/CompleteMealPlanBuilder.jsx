import React from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgTextField } from '../ui/cg/CgPrimitives.jsx';

const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const newMeal=(dayIndex=1,sortOrder=1)=>({dayIndex,dayOfWeek:((dayIndex-1)%7)+1,sortOrder,mealType:'Comida',plannedAt:'',recipeId:'',servings:'1',preparation:'',alternatives:[],items:[],notes:''});
const newItem=()=>({ingredientId:'',quantity:'100',unit:'g',notes:''});
const newAlternative=()=>({recipeId:'',label:''});

export function CompleteMealPlanBuilder({durationDays=7,onDurationChange,value=[],onChange,ingredients=[],recipes=[],disabled=false}){
  const meals=Array.isArray(value)?value:[];
  const commit=(next)=>onChange?.(next);
  const ingredientOptions=[{value:'',label:'Seleccionar ingrediente'},...ingredients.filter((x)=>x.active!==false).map((x)=>({value:x.id,label:`${x.name} · ${x.defaultUnit||'g'}`}))];
  const recipeOptions=[{value:'',label:'Sin receta / ingredientes directos'},...recipes.filter((x)=>x.active!==false).map((x)=>({value:x.id,label:x.name}))];
  const updateMeal=(index,patch)=>commit(meals.map((meal,i)=>i===index?{...meal,...patch}:meal));
  const removeMeal=(index)=>commit(meals.filter((_meal,i)=>i!==index));
  const addMeal=()=>{
    const dayIndex=Math.min(Number(durationDays)||7,Math.max(1,meals.at(-1)?.dayIndex||1));
    const sortOrder=meals.filter((m)=>Number(m.dayIndex)===dayIndex).length+1;
    commit([...meals,newMeal(dayIndex,sortOrder)]);
  };
  const updateItem=(mealIndex,itemIndex,patch)=>{
    const items=(meals[mealIndex].items||[]).map((item,i)=>i===itemIndex?{...item,...patch}:item);
    updateMeal(mealIndex,{items});
  };
  const updateAlternative=(mealIndex,altIndex,patch)=>{
    const alternatives=(meals[mealIndex].alternatives||[]).map((item,i)=>i===altIndex?{...item,...patch}:item);
    updateMeal(mealIndex,{alternatives});
  };

  return <Stack gap={1}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
      <Box><Typography variant="subtitle1" fontWeight={700}>Plan alimenticio completo</Typography><Typography variant="caption" color="text.secondary">Configura 7, 14 o 28 días con recetas, Porciones, Preparación y Alternativas explícitas.</Typography></Box>
      <Stack direction="row" gap={.8}><CgSelect label="Duración" value={String(durationDays)} onChange={(e)=>onDurationChange?.(Number(e.target.value))} options={[7,14,28].map((value)=>({value:String(value),label:`${value} días`}))}/><CgButton type="button" variant="outlined" disabled={disabled} onClick={addMeal}>Agregar comida</CgButton></Stack>
    </Stack>
    {!meals.length?<CgEmptyState title="Sin comidas" description="Agrega una comida y ubícala en un Día del plan."/>:null}
    {meals.map((meal,mealIndex)=><Paper key={mealIndex} variant="outlined" sx={{p:1.2}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Typography variant="subtitle2">Día {meal.dayIndex} · {DAYS[(Number(meal.dayOfWeek||1)-1)%7]}</Typography><CgButton type="button" size="small" variant="outlined" onClick={()=>removeMeal(mealIndex)}>Eliminar comida</CgButton></Stack>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(4,minmax(0,1fr))'},gap:1,mt:1}}>
        <CgTextField label="Día" type="number" inputProps={{min:1,max:durationDays,step:1}} value={meal.dayIndex} onChange={(e)=>{const dayIndex=Math.max(1,Math.min(Number(durationDays),Number(e.target.value||1)));updateMeal(mealIndex,{dayIndex,dayOfWeek:((dayIndex-1)%7)+1});}}/>
        <CgTextField label="Orden" type="number" inputProps={{min:1,max:50,step:1}} value={meal.sortOrder} onChange={(e)=>updateMeal(mealIndex,{sortOrder:Number(e.target.value||1)})}/>
        <CgTextField label="Tipo de comida" value={meal.mealType||''} onChange={(e)=>updateMeal(mealIndex,{mealType:e.target.value})}/>
        <CgTextField label="Hora" type="time" slotProps={{inputLabel:{shrink:true}}} value={meal.plannedAt||''} onChange={(e)=>updateMeal(mealIndex,{plannedAt:e.target.value})}/>
        <CgSelect label="Receta" value={meal.recipeId||''} options={recipeOptions} onChange={(e)=>updateMeal(mealIndex,{recipeId:e.target.value})}/>
        <CgTextField label="Porciones" type="number" inputProps={{min:.001,max:100,step:.001}} value={meal.servings??'1'} onChange={(e)=>updateMeal(mealIndex,{servings:e.target.value})}/>
      </Box>
      <CgTextField fullWidth multiline minRows={2} label="Preparación" value={meal.preparation||''} onChange={(e)=>updateMeal(mealIndex,{preparation:e.target.value})} sx={{mt:1}}/>
      {!meal.recipeId?<Stack gap={.8} mt={1}>
        {(meal.items||[]).map((item,itemIndex)=><Box key={itemIndex} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'2fr 1fr 1fr auto'},gap:.8,alignItems:'center'}}>
          <CgSelect label="Ingrediente" value={item.ingredientId||''} options={ingredientOptions} onChange={(e)=>{const ingredient=ingredients.find((x)=>x.id===e.target.value);updateItem(mealIndex,itemIndex,{ingredientId:e.target.value,unit:ingredient?.defaultUnit||item.unit||'g'});}}/>
          <CgTextField label="Cantidad" type="number" inputProps={{min:.001,step:.001}} value={item.quantity??''} onChange={(e)=>updateItem(mealIndex,itemIndex,{quantity:e.target.value})}/>
          <CgTextField label="Unidad" value={item.unit||''} onChange={(e)=>updateItem(mealIndex,itemIndex,{unit:e.target.value})}/>
          <CgButton type="button" size="small" variant="outlined" onClick={()=>updateMeal(mealIndex,{items:(meal.items||[]).filter((_x,i)=>i!==itemIndex)})}>Quitar</CgButton>
        </Box>)}
        <CgButton type="button" size="small" variant="outlined" disabled={!ingredients.some((x)=>x.active!==false)} onClick={()=>updateMeal(mealIndex,{items:[...(meal.items||[]),newItem()]})}>Agregar ingrediente</CgButton>
      </Stack>:null}
      <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1,fontWeight:700}}>Alternativas</Typography>
      <Stack gap={.7} mt={.6}>
        {(meal.alternatives||[]).map((alt,altIndex)=><Box key={altIndex} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'2fr 2fr auto'},gap:.8}}>
          <CgSelect label="Receta alternativa" value={alt.recipeId||''} options={recipeOptions.slice(1)} onChange={(e)=>updateAlternative(mealIndex,altIndex,{recipeId:e.target.value})}/>
          <CgTextField label="Etiqueta" value={alt.label||''} onChange={(e)=>updateAlternative(mealIndex,altIndex,{label:e.target.value})}/>
          <CgButton type="button" variant="outlined" onClick={()=>updateMeal(mealIndex,{alternatives:(meal.alternatives||[]).filter((_x,i)=>i!==altIndex)})}>Quitar</CgButton>
        </Box>)}
        <CgButton type="button" size="small" variant="outlined" disabled={!recipes.length} onClick={()=>updateMeal(mealIndex,{alternatives:[...(meal.alternatives||[]),newAlternative()]})}>Agregar alternativa</CgButton>
      </Stack>
      <CgTextField fullWidth multiline minRows={2} label="Notas" value={meal.notes||''} onChange={(e)=>updateMeal(mealIndex,{notes:e.target.value})} sx={{mt:1}}/>
    </Paper>)}
  </Stack>;
}
