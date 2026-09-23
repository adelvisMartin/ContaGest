import React from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgTextField } from '../ui/cg/CgPrimitives.jsx';

const newMeal=(index=0)=>({mealType:index===0?'Desayuno':'Comida',plannedAt:'',calories:'',notes:'',items:[]});
const newItem=()=>({ingredientId:'',quantity:'',unit:'g',notes:''});

export function NutritionMealBuilder({value=[],onChange,ingredients=[],disabled=false}){
  const meals=Array.isArray(value)?value:[];

  const commit=(next)=>onChange?.(next);

  function updateMeal(index,patch){
    commit(meals.map((meal,current)=>current===index?{...meal,...patch}:meal));
  }

  function removeMeal(index){commit(meals.filter((_meal,current)=>current!==index));}

  function updateItem(mealIndex,itemIndex,patch){
    const meal=meals[mealIndex];
    const items=(meal.items||[]).map((item,current)=>current===itemIndex?{...item,...patch}:item);
    updateMeal(mealIndex,{items});
  }

  function addItem(mealIndex){
    const meal=meals[mealIndex];
    updateMeal(mealIndex,{items:[...(meal.items||[]),newItem()]});
  }

  function removeItem(mealIndex,itemIndex){
    const meal=meals[mealIndex];
    updateMeal(mealIndex,{items:(meal.items||[]).filter((_item,current)=>current!==itemIndex)});
  }

  const ingredientOptions=[
    {value:'',label:'Seleccionar ingrediente'},
    ...ingredients.filter((item)=>item.active!==false).map((item)=>({value:item.id,label:`${item.name} · ${item.defaultUnit||'g'}`}))
  ];

  return <Stack gap={1}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700}>Comidas por ingrediente</Typography>
        <Typography variant="caption" color="text.secondary">Cada alimento conserva identidad, cantidad y unidad; no se interpretan listas de texto.</Typography>
      </Box>
      <CgButton type="button" variant="outlined" disabled={disabled} onClick={()=>commit([...meals,newMeal(meals.length)])}>Agregar comida</CgButton>
    </Stack>

    {!meals.length?<CgEmptyState title="Sin comidas estructuradas" description="Agrega una comida y selecciona ingredientes del catálogo."/>:null}

    {meals.map((meal,mealIndex)=><Paper key={mealIndex} variant="outlined" sx={{p:1.2}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}>
        <Typography variant="subtitle2">Comida {mealIndex+1}</Typography>
        <CgButton type="button" size="small" variant="outlined" onClick={()=>removeMeal(mealIndex)}>Eliminar comida</CgButton>
      </Stack>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'2fr 1fr 1fr'},gap:1,mt:1}}>
        <CgTextField size="small" label="Tipo de comida" value={meal.mealType||''} onChange={(event)=>updateMeal(mealIndex,{mealType:event.target.value})}/>
        <CgTextField size="small" label="Hora" type="time" slotProps={{inputLabel:{shrink:true}}} value={meal.plannedAt||''} onChange={(event)=>updateMeal(mealIndex,{plannedAt:event.target.value})}/>
        <CgTextField size="small" label="kcal manuales" type="number" inputProps={{min:0,step:1}} value={meal.calories??''} onChange={(event)=>updateMeal(mealIndex,{calories:event.target.value})}/>
      </Box>

      <Stack gap={.8} mt={1}>
        {(meal.items||[]).map((item,itemIndex)=><Paper key={itemIndex} variant="outlined" sx={{p:1}}>
          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'2fr 1fr 1fr auto'},gap:1,alignItems:'center'}}>
            <CgSelect label="Ingrediente" value={item.ingredientId||''} options={ingredientOptions} onChange={(event)=>{
              const ingredient=ingredients.find((candidate)=>candidate.id===event.target.value);
              updateItem(mealIndex,itemIndex,{ingredientId:event.target.value,unit:ingredient?.defaultUnit||item.unit||'g'});
            }}/>
            <CgTextField size="small" label="Cantidad" type="number" inputProps={{min:.001,step:.001}} value={item.quantity??''} onChange={(event)=>updateItem(mealIndex,itemIndex,{quantity:event.target.value})}/>
            <CgTextField size="small" label="Unidad" value={item.unit||''} onChange={(event)=>updateItem(mealIndex,itemIndex,{unit:event.target.value})}/>
            <CgButton type="button" size="small" variant="outlined" onClick={()=>removeItem(mealIndex,itemIndex)}>Quitar</CgButton>
          </Box>
          <CgTextField size="small" fullWidth label="Nota del ingrediente" value={item.notes||''} onChange={(event)=>updateItem(mealIndex,itemIndex,{notes:event.target.value})} sx={{mt:.8}}/>
        </Paper>)}
        <CgButton type="button" size="small" variant="outlined" disabled={!ingredients.some((item)=>item.active!==false)} onClick={()=>addItem(mealIndex)}>Agregar ingrediente</CgButton>
      </Stack>
      <CgTextField size="small" fullWidth multiline minRows={2} label="Notas de la comida" value={meal.notes||''} onChange={(event)=>updateMeal(mealIndex,{notes:event.target.value})} sx={{mt:1}}/>
    </Paper>)}
  </Stack>;
}
