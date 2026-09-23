import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { CgButton, CgTextField } from '../ui/cg/CgPrimitives.jsx';

export function NutritionTargetFields({value,onChange,disabled=false}){
  const targets=Array.isArray(value.micronutrientTargets)?value.micronutrientTargets:[];
  const set=(patch)=>onChange?.(patch);
  const updateMicro=(index,patch)=>set({micronutrientTargets:targets.map((item,i)=>i===index?{...item,...patch}:item)});

  return <Stack gap={1}>
    <Typography variant="subtitle2">Objetivos nutricionales diarios</Typography>
    <Typography variant="caption" color="text.secondary">Objetivos explícitos del plan. No se calculan ni recomiendan automáticamente.</Typography>
    <Box className="cg-gym-v1124-fields" sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',md:'repeat(4,minmax(0,1fr))'},gap:1}}>
      <CgTextField size="small" label="Calorías kcal" type="number" inputProps={{min:0,step:1}} value={value.targetCalories??''} onChange={(e)=>set({targetCalories:e.target.value})} disabled={disabled}/>
      <CgTextField size="small" label="Proteína g" type="number" inputProps={{min:0,step:.1}} value={value.proteinG??''} onChange={(e)=>set({proteinG:e.target.value})} disabled={disabled}/>
      <CgTextField size="small" label="Carbohidratos g" type="number" inputProps={{min:0,step:.1}} value={value.carbsG??''} onChange={(e)=>set({carbsG:e.target.value})} disabled={disabled}/>
      <CgTextField size="small" label="Grasa g" type="number" inputProps={{min:0,step:.1}} value={value.fatG??''} onChange={(e)=>set({fatG:e.target.value})} disabled={disabled}/>
      <CgTextField size="small" label="Fibra g" type="number" inputProps={{min:0,step:.1}} value={value.fiberG??''} onChange={(e)=>set({fiberG:e.target.value})} disabled={disabled}/>
      <CgTextField size="small" label="Agua ml" type="number" inputProps={{min:0,step:1}} value={value.waterMl??''} onChange={(e)=>set({waterMl:e.target.value})} disabled={disabled}/>
    </Box>
    <Stack gap={.7}>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>Objetivos de micronutrientes disponibles</Typography>
      {targets.map((item,index)=><Box key={index} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'2fr 1fr 1fr auto'},gap:.7}}>
        <CgTextField size="small" label="Micronutriente" value={item.name||''} onChange={(e)=>updateMicro(index,{name:e.target.value})} disabled={disabled}/>
        <CgTextField size="small" label="Cantidad" type="number" inputProps={{min:0,step:.001}} value={item.amount??''} onChange={(e)=>updateMicro(index,{amount:e.target.value})} disabled={disabled}/>
        <CgTextField size="small" label="Unidad" value={item.unit||''} onChange={(e)=>updateMicro(index,{unit:e.target.value})} disabled={disabled}/>
        <CgButton type="button" size="small" variant="outlined" disabled={disabled} onClick={()=>set({micronutrientTargets:targets.filter((_x,i)=>i!==index)})}>Quitar</CgButton>
      </Box>)}
      <CgButton type="button" size="small" variant="outlined" disabled={disabled||targets.length>=64} onClick={()=>set({micronutrientTargets:[...targets,{name:'',amount:'',unit:''}]})}>Agregar objetivo micronutricional</CgButton>
    </Stack>
  </Stack>;
}
