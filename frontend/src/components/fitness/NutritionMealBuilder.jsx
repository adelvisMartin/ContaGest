import React, { useMemo } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { FITNESS_WEEK_DAYS } from '../../data/fitnessWeekDays.js';

const weekday=(dayIndex)=>FITNESS_WEEK_DAYS[(Number(dayIndex)-1)%7]||FITNESS_WEEK_DAYS[0];
const newMeal=(dayIndex=1,sortOrder=1)=>({
  dayIndex,
  dayOfWeek:weekday(dayIndex).value,
  sortOrder,
  mealType:'Comida',
  plannedAt:'',
  recipeId:'',
  servings:'1',
  preparation:'',
  calories:'',
  notes:'',
  alternatives:[],
  items:[]
});
const newItem=()=>({ingredientId:'',quantity:'',unit:'g',notes:''});

const normalizeOrders=(items)=>items
  .map((meal)=>({...meal,dayOfWeek:weekday(meal.dayIndex).value}))
  .sort((a,b)=>Number(a.dayIndex)-Number(b.dayIndex)||Number(a.sortOrder)-Number(b.sortOrder))
  .reduce((acc,meal)=>{
    const order=acc.filter((item)=>Number(item.dayIndex)===Number(meal.dayIndex)).length+1;
    acc.push({...meal,sortOrder:order});
    return acc;
  },[]);

export function NutritionMealBuilder({value=[],onChange,ingredients=[],recipes=[],durationDays=7,disabled=false}){
  const meals=Array.isArray(value)?value:[];
  const horizon=[...Array(Number(durationDays)||7)].map((_item,index)=>index+1);

  const grouped=useMemo(()=>horizon.map((dayIndex)=>({
    dayIndex,
    weekday:weekday(dayIndex),
    meals:meals.filter((meal)=>Number(meal.dayIndex)===dayIndex).sort((a,b)=>Number(a.sortOrder)-Number(b.sortOrder))
  })),[meals,durationDays]);

  const commit=(next)=>onChange?.(normalizeOrders(next));
  const updateMeal=(target,patch)=>commit(meals.map((meal)=>meal===target?{...meal,...patch}:meal));
  const removeMeal=(target)=>commit(meals.filter((meal)=>meal!==target));

  function duplicateMeal(target){
    const copy={...target,items:(target.items||[]).map((item)=>({...item})),alternatives:(target.alternatives||[]).map((item)=>({...item}))};
    const position=meals.indexOf(target);
    commit([...meals.slice(0,position+1),copy,...meals.slice(position+1)]);
  }

  function moveMeal(target,direction){
    const dayMeals=meals.filter((meal)=>Number(meal.dayIndex)===Number(target.dayIndex)).sort((a,b)=>Number(a.sortOrder)-Number(b.sortOrder));
    const index=dayMeals.indexOf(target),swap=index+direction;
    if(index<0||swap<0||swap>=dayMeals.length)return;
    const left=dayMeals[index],right=dayMeals[swap];
    commit(meals.map((meal)=>meal===left?{...meal,sortOrder:right.sortOrder}:meal===right?{...meal,sortOrder:left.sortOrder}:meal));
  }

  function updateItem(target,itemIndex,patch){
    updateMeal(target,{items:(target.items||[]).map((item,current)=>current===itemIndex?{...item,...patch}:item)});
  }
  const addItem=(target)=>updateMeal(target,{items:[...(target.items||[]),newItem()]});
  const removeItem=(target,itemIndex)=>updateMeal(target,{items:(target.items||[]).filter((_item,current)=>current!==itemIndex)});

  const ingredientOptions=[{value:'',label:'Seleccionar ingrediente'},...ingredients.filter((item)=>item.active!==false).map((item)=>({value:item.id,label:`${item.name} · ${item.defaultUnit||'g'}`}))];
  const recipeOptions=[{value:'',label:'Ingredientes directos'},...recipes.filter((item)=>item.active!==false).map((item)=>({value:item.id,label:item.name}))];

  function addAlternative(meal,recipeId){
    if(!recipeId||recipeId===meal.recipeId||(meal.alternatives||[]).some((item)=>item.recipeId===recipeId))return;
    const recipe=recipes.find((item)=>item.id===recipeId);
    updateMeal(meal,{alternatives:[...(meal.alternatives||[]),{recipeId,label:recipe?.name||'Alternativa'}]});
  }

  return <Stack gap={1.1}>
    <Box>
      <Typography variant="subtitle1" fontWeight={700}>Plan alimenticio semanal completo</Typography>
      <Typography variant="caption" color="text.secondary">Comidas por ingrediente o Receta, con 7/14/28 días, Porciones, Preparación y Alternativas explícitas.</Typography>
    </Box>

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'repeat(2,minmax(0,1fr))'},gap:1}}>
      {grouped.map((day)=><Paper key={day.dayIndex} variant="outlined" sx={{p:1.15,minWidth:0}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
          <Box>
            <Typography variant="subtitle2">Día {day.dayIndex} · {day.weekday.label}</Typography>
            <Typography variant="caption" color="text.secondary">{day.meals.length?`${day.meals.length} comida${day.meals.length===1?'':'s'}`:'Día sin comidas programadas'}</Typography>
          </Box>
          <CgButton type="button" size="small" variant="outlined" disabled={disabled} onClick={()=>commit([...meals,newMeal(day.dayIndex,day.meals.length+1)])}>Agregar comida</CgButton>
        </Stack>

        {!day.meals.length?<Box mt={1}><CgEmptyState title="Sin comidas" description="Agrega una comida para este día."/></Box>:null}

        <Stack gap={.8} mt={day.meals.length?1:0}>
          {day.meals.map((meal,index)=><Paper key={`${day.dayIndex}-${meal.sortOrder}-${index}`} variant="outlined" sx={{p:1}}>
            <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
              <Typography variant="subtitle2">#{meal.sortOrder} · {meal.mealType||'Comida'}</Typography>
              <Stack direction="row" gap={.5} flexWrap="wrap">
                <CgButton type="button" size="small" variant="outlined" disabled={index===0} onClick={()=>moveMeal(meal,-1)}>Subir</CgButton>
                <CgButton type="button" size="small" variant="outlined" disabled={index===day.meals.length-1} onClick={()=>moveMeal(meal,1)}>Bajar</CgButton>
                <CgButton type="button" size="small" variant="outlined" onClick={()=>duplicateMeal(meal)}>Duplicar</CgButton>
                <CgButton type="button" size="small" variant="outlined" onClick={()=>removeMeal(meal)}>Eliminar</CgButton>
              </Stack>
            </Stack>

            <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'2fr 1fr'},gap:1,mt:1}}>
              <CgTextField size="small" label="Tipo de comida" value={meal.mealType||''} onChange={(event)=>updateMeal(meal,{mealType:event.target.value})}/>
              <CgTextField size="small" label="Hora" type="time" slotProps={{inputLabel:{shrink:true}}} value={meal.plannedAt||''} onChange={(event)=>updateMeal(meal,{plannedAt:event.target.value})}/>
              <CgSelect label="Receta" value={meal.recipeId||''} options={recipeOptions} onChange={(event)=>updateMeal(meal,{recipeId:event.target.value})}/>
              <CgTextField size="small" label="Porciones" type="number" inputProps={{min:.001,max:100,step:.001}} value={meal.servings??'1'} onChange={(event)=>updateMeal(meal,{servings:event.target.value})}/>
            </Box>
            <CgTextField size="small" fullWidth multiline minRows={2} label="Preparación" value={meal.preparation||''} onChange={(event)=>updateMeal(meal,{preparation:event.target.value})} sx={{mt:1}}/>

            {!meal.recipeId?<Stack gap={.8} mt={1}>
              {(meal.items||[]).map((item,itemIndex)=><Paper key={itemIndex} variant="outlined" sx={{p:1}}>
                <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'2fr 1fr 1fr auto'},gap:1,alignItems:'center'}}>
                  <CgSelect label="Ingrediente" value={item.ingredientId||''} options={ingredientOptions} onChange={(event)=>{
                    const ingredient=ingredients.find((candidate)=>candidate.id===event.target.value);
                    updateItem(meal,itemIndex,{ingredientId:event.target.value,unit:ingredient?.defaultUnit||item.unit||'g'});
                  }}/>
                  <CgTextField size="small" label="Cantidad" type="number" inputProps={{min:.001,step:.001}} value={item.quantity??''} onChange={(event)=>updateItem(meal,itemIndex,{quantity:event.target.value})}/>
                  <CgTextField size="small" label="Unidad" value={item.unit||''} onChange={(event)=>updateItem(meal,itemIndex,{unit:event.target.value})}/>
                  <CgButton type="button" size="small" variant="outlined" onClick={()=>removeItem(meal,itemIndex)}>Quitar</CgButton>
                </Box>
              </Paper>)}
              <CgButton type="button" size="small" variant="outlined" disabled={!ingredients.some((item)=>item.active!==false)} onClick={()=>addItem(meal)}>Agregar ingrediente</CgButton>
            </Stack>:<Typography variant="caption" color="text.secondary" display="block" mt={1}>La Receta aporta sus ingredientes canónicos; las Porciones ajustan la Lista de compras.</Typography>}

            <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'2fr 1fr'},gap:1,mt:1}}>
              <CgSelect label="Alternativas" value="" options={[{value:'',label:'Agregar alternativa'},...recipes.filter((r)=>r.id!==meal.recipeId).map((r)=>({value:r.id,label:r.name}))]} onChange={(event)=>addAlternative(meal,event.target.value)}/>
              <CgTextField size="small" label="kcal manuales" type="number" inputProps={{min:0,step:1}} value={meal.calories??''} onChange={(event)=>updateMeal(meal,{calories:event.target.value})}/>
            </Box>
            {(meal.alternatives||[]).length?<Stack direction="row" gap={.5} flexWrap="wrap" mt={.8}>{meal.alternatives.map((alt)=><CgButton key={alt.recipeId} type="button" size="small" variant="outlined" onClick={()=>updateMeal(meal,{alternatives:meal.alternatives.filter((item)=>item.recipeId!==alt.recipeId)})}>{alt.label||'Alternativa'} ×</CgButton>)}</Stack>:null}
            <CgTextField size="small" fullWidth multiline minRows={2} label="Notas de la comida" value={meal.notes||''} onChange={(event)=>updateMeal(meal,{notes:event.target.value})} sx={{mt:1}}/>
          </Paper>)}
        </Stack>
      </Paper>)}
    </Box>
  </Stack>;
}
