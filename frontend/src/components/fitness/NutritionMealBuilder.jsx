import React, { useMemo } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { FITNESS_WEEK_DAYS } from '../../data/fitnessWeekDays.js';

const newMeal=(dayOfWeek=1,sortOrder=1)=>({dayOfWeek,sortOrder,mealType:'Comida',plannedAt:'',calories:'',notes:'',items:[]});
const newItem=()=>({ingredientId:'',quantity:'',unit:'g',notes:''});

const normalizeOrders=(items)=>FITNESS_WEEK_DAYS.flatMap((day)=>
  items
    .filter((meal)=>Number(meal.dayOfWeek)===day.value)
    .map((meal,index)=>({...meal,dayOfWeek:day.value,sortOrder:index+1}))
);

export function NutritionMealBuilder({value=[],onChange,ingredients=[],disabled=false}){
  const meals=Array.isArray(value)?value:[];

  const grouped=useMemo(()=>FITNESS_WEEK_DAYS.map((day)=>({
    ...day,
    meals:meals
      .filter((meal)=>Number(meal.dayOfWeek)===day.value)
      .sort((left,right)=>Number(left.sortOrder||0)-Number(right.sortOrder||0))
  })),[meals]);

  const commit=(next)=>onChange?.(normalizeOrders(next));

  function updateMeal(target,patch){
    commit(meals.map((meal)=>meal===target?{...meal,...patch}:meal));
  }

  function removeMeal(target){commit(meals.filter((meal)=>meal!==target));}

  function duplicateMeal(target){
    const copy={...target,items:(target.items||[]).map((item)=>({...item}))};
    const position=meals.indexOf(target);
    commit([...meals.slice(0,position+1),copy,...meals.slice(position+1)]);
  }

  function moveMeal(target,direction){
    const dayMeals=meals.filter((meal)=>Number(meal.dayOfWeek)===Number(target.dayOfWeek));
    const index=dayMeals.indexOf(target);
    const swap=index+direction;
    if(index<0||swap<0||swap>=dayMeals.length)return;
    const left=dayMeals[index],right=dayMeals[swap];
    commit(meals.map((meal)=>{
      if(meal===left)return {...meal,sortOrder:right.sortOrder};
      if(meal===right)return {...meal,sortOrder:left.sortOrder};
      return meal;
    }).sort((a,b)=>Number(a.dayOfWeek)-Number(b.dayOfWeek)||Number(a.sortOrder)-Number(b.sortOrder)));
  }

  function updateItem(target,itemIndex,patch){
    updateMeal(target,{items:(target.items||[]).map((item,current)=>current===itemIndex?{...item,...patch}:item)});
  }

  function addItem(target){updateMeal(target,{items:[...(target.items||[]),newItem()]});}
  function removeItem(target,itemIndex){updateMeal(target,{items:(target.items||[]).filter((_item,current)=>current!==itemIndex)});}

  const ingredientOptions=[
    {value:'',label:'Seleccionar ingrediente'},
    ...ingredients.filter((item)=>item.active!==false).map((item)=>({value:item.id,label:`${item.name} · ${item.defaultUnit||'g'}`}))
  ];

  return <Stack gap={1.1}>
    <Box>
      <Typography variant="subtitle1" fontWeight={700}>Plan alimenticio semanal</Typography>
      <Typography variant="caption" color="text.secondary">Programa comidas de lunes a domingo con orden, hora e ingredientes explícitos.</Typography>
    </Box>

    {grouped.map((day)=><Paper key={day.value} variant="outlined" sx={{p:1.15}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
        <Box>
          <Typography variant="subtitle2">{day.label}</Typography>
          <Typography variant="caption" color="text.secondary">{day.meals.length?`${day.meals.length} comida${day.meals.length===1?'':'s'} programada${day.meals.length===1?'':'s'}`:'Día sin comidas programadas'}</Typography>
        </Box>
        <CgButton type="button" size="small" variant="outlined" disabled={disabled} onClick={()=>commit([...meals,newMeal(day.value,day.meals.length+1)])}>Agregar comida</CgButton>
      </Stack>

      {!day.meals.length?<Box mt={1}><CgEmptyState title="Sin comidas" description={`No hay comidas programadas para ${day.label}.`}/></Box>:null}

      <Stack gap={.8} mt={day.meals.length?1:0}>
        {day.meals.map((meal,index)=><Paper key={`${day.value}-${meal.sortOrder}-${index}`} variant="outlined" sx={{p:1}}>
          <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
            <Typography variant="subtitle2">#{meal.sortOrder} · {meal.mealType||'Comida'}</Typography>
            <Stack direction="row" gap={.5} flexWrap="wrap">
              <CgButton type="button" size="small" variant="outlined" disabled={index===0} onClick={()=>moveMeal(meal,-1)}>Subir</CgButton>
              <CgButton type="button" size="small" variant="outlined" disabled={index===day.meals.length-1} onClick={()=>moveMeal(meal,1)}>Bajar</CgButton>
              <CgButton type="button" size="small" variant="outlined" onClick={()=>duplicateMeal(meal)}>Duplicar</CgButton>
              <CgButton type="button" size="small" variant="outlined" onClick={()=>removeMeal(meal)}>Eliminar</CgButton>
            </Stack>
          </Stack>

          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'2fr 1fr 1fr'},gap:1,mt:1}}>
            <CgTextField size="small" label="Tipo de comida" value={meal.mealType||''} onChange={(event)=>updateMeal(meal,{mealType:event.target.value})}/>
            <CgTextField size="small" label="Hora" type="time" slotProps={{inputLabel:{shrink:true}}} value={meal.plannedAt||''} onChange={(event)=>updateMeal(meal,{plannedAt:event.target.value})}/>
            <CgTextField size="small" label="kcal manuales" type="number" inputProps={{min:0,step:1}} value={meal.calories??''} onChange={(event)=>updateMeal(meal,{calories:event.target.value})}/>
          </Box>

          <Stack gap={.8} mt={1}>
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
              <CgTextField size="small" fullWidth label="Nota del ingrediente" value={item.notes||''} onChange={(event)=>updateItem(meal,itemIndex,{notes:event.target.value})} sx={{mt:.8}}/>
            </Paper>)}
            <CgButton type="button" size="small" variant="outlined" disabled={!ingredients.some((item)=>item.active!==false)} onClick={()=>addItem(meal)}>Agregar ingrediente</CgButton>
          </Stack>
          <CgTextField size="small" fullWidth multiline minRows={2} label="Notas de la comida" value={meal.notes||''} onChange={(event)=>updateMeal(meal,{notes:event.target.value})} sx={{mt:1}}/>
        </Paper>)}
      </Stack>
    </Paper>)}
  </Stack>;
}
