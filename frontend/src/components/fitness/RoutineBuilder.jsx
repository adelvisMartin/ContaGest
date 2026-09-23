import React, { useMemo } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgEmptyState, CgSelect, CgTextField
} from '../ui/cg/CgPrimitives.jsx';
import { FITNESS_EXERCISES, FITNESS_MUSCLES } from '../../data/fitnessExerciseCatalog.js';
import { FITNESS_WEEK_DAYS } from '../../data/fitnessWeekDays.js';

const dayOptions=FITNESS_WEEK_DAYS.map((day)=>({value:String(day.value),label:day.label}));
const muscleOptions=[{value:'',label:'Seleccionar grupo'},...FITNESS_MUSCLES.map((value)=>({value,label:value}))];

const newExercise=(dayOfWeek=1,sortOrder=1)=>({
  exerciseId:null,
  dayOfWeek,
  sortOrder,
  exerciseName:'',
  muscleGroup:'',
  equipment:'',
  instructions:'',
  sets:3,
  reps:'10',
  loadKg:'',
  restSeconds:60,
  tempo:'',
  notes:''
});

const normalizeOrder=(items)=>items.map((item,index)=>({...item,sortOrder:index+1}));

export function RoutineBuilder({value=[],onChange,disabled=false,catalog=[]}){
  const exercises=Array.isArray(value)?value:[];
  const persistedCatalog=useMemo(()=>Array.isArray(catalog)?catalog.filter((item)=>item?.active!==false):[],[catalog]);
  const exerciseCatalog=useMemo(()=>{
    const persistedNames=new Set(persistedCatalog.map((item)=>String(item.name||'').toLocaleLowerCase('es')));
    const builtIn=Object.entries(FITNESS_EXERCISES).flatMap(([muscleGroup,items])=>
      items
        .filter((item)=>!persistedNames.has(String(item.name||'').toLocaleLowerCase('es')))
        .map((item)=>({...item,muscleGroup,id:null,defaultSets:3,defaultReps:'10'}))
    );
    return [...persistedCatalog,...builtIn];
  },[persistedCatalog]);

  function commit(next){
    onChange?.(normalizeOrder(next));
  }

  function addExercise(){
    commit([...exercises,newExercise(1,exercises.length+1)]);
  }

  function updateExercise(index,patch){
    commit(exercises.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item));
  }

  function removeExercise(index){
    commit(exercises.filter((_,itemIndex)=>itemIndex!==index));
  }

  function moveExercise(index,direction){
    const nextIndex=index+direction;
    if(nextIndex<0||nextIndex>=exercises.length)return;
    const next=[...exercises];
    [next[index],next[nextIndex]]=[next[nextIndex],next[index]];
    commit(next);
  }

  function duplicateExercise(index){
    const current=exercises[index];
    if(!current)return;
    const copy={...current,exerciseId:null,sortOrder:index+2};
    const next=[...exercises.slice(0,index+1),copy,...exercises.slice(index+1)];
    commit(next);
  }

  function selectCatalogExercise(index,name){
    const selected=exerciseCatalog.find((item)=>item.name===name);
    if(!selected){
      updateExercise(index,{exerciseId:null,exerciseName:name});
      return;
    }
    updateExercise(index,{
      exerciseId:selected.id||null,
      exerciseName:selected.name,
      muscleGroup:selected.muscleGroup||'',
      equipment:selected.equipment||'',
      instructions:selected.instructions||selected.cue||'',
      sets:Number(selected.defaultSets||3),
      reps:String(selected.defaultReps||'10')
    });
  }

  if(!exercises.length){
    return <Stack gap={1}>
      <CgEmptyState title="Rutina sin ejercicios" description="Agrega ejercicios estructurados; ya no necesitas escribir líneas con separadores."/>
      <CgButton type="button" variant="outlined" onClick={addExercise} disabled={disabled}>Agregar ejercicio</CgButton>
    </Stack>;
  }

  return <Stack gap={1}>
    {exercises.map((exercise,index)=>{
      const catalogNames=[
        {value:'',label:'Seleccionar del catálogo'},
        ...exerciseCatalog.map((item)=>({value:item.name,label:`${item.name} · ${item.muscleGroup||'Sin grupo'}${item.id?' · Biblioteca':''}`}))
      ];
      return <Paper key={`${exercise.sortOrder}-${index}`} variant="outlined" sx={{p:1.2}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Ejercicio {index+1}</Typography>
            <Typography variant="caption" color="text.secondary">Posición {exercise.sortOrder||index+1} · Día {exercise.dayOfWeek||1}</Typography>
          </Box>
          <Stack direction="row" gap={.5} flexWrap="wrap">
            <CgButton type="button" size="small" variant="outlined" onClick={()=>moveExercise(index,-1)} disabled={disabled||index===0}>Subir</CgButton>
            <CgButton type="button" size="small" variant="outlined" onClick={()=>moveExercise(index,1)} disabled={disabled||index===exercises.length-1}>Bajar</CgButton>
            <CgButton type="button" size="small" variant="outlined" onClick={()=>duplicateExercise(index)} disabled={disabled}>Duplicar</CgButton>
            <CgButton type="button" size="small" variant="outlined" color="error" onClick={()=>removeExercise(index)} disabled={disabled}>Quitar</CgButton>
          </Stack>
        </Stack>

        <Divider sx={{my:1}}/>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>
          <CgSelect
            label="Día"
            value={String(exercise.dayOfWeek||1)}
            onChange={(event)=>updateExercise(index,{dayOfWeek:Number(event.target.value)})}
            options={dayOptions}
          />
          <CgSelect
            label="Catálogo"
            value={exerciseCatalog.some((item)=>item.name===exercise.exerciseName)?exercise.exerciseName:''}
            onChange={(event)=>selectCatalogExercise(index,event.target.value)}
            options={catalogNames}
          />
          <CgTextField
            size="small"
            label="Ejercicio"
            required
            value={exercise.exerciseName}
            onChange={(event)=>updateExercise(index,{exerciseId:null,exerciseName:event.target.value})}
          />
          <CgSelect
            label="Grupo muscular"
            value={exercise.muscleGroup||''}
            onChange={(event)=>updateExercise(index,{muscleGroup:event.target.value})}
            options={muscleOptions}
          />
          <CgTextField size="small" label="Equipo" value={exercise.equipment||''} onChange={(event)=>updateExercise(index,{equipment:event.target.value})}/>
          <CgTextField size="small" label="Series" type="number" inputProps={{min:1,max:20,step:1}} value={exercise.sets} onChange={(event)=>updateExercise(index,{sets:Number(event.target.value||1)})}/>
          <CgTextField size="small" label="Repeticiones" value={exercise.reps} onChange={(event)=>updateExercise(index,{reps:event.target.value})}/>
          <CgTextField size="small" label="Carga kg" type="number" inputProps={{min:0,step:.25}} value={exercise.loadKg??''} onChange={(event)=>updateExercise(index,{loadKg:event.target.value===''?'':Number(event.target.value)})}/>
          <CgTextField size="small" label="Descanso (s)" type="number" inputProps={{min:0,max:3600,step:5}} value={exercise.restSeconds} onChange={(event)=>updateExercise(index,{restSeconds:Number(event.target.value||0)})}/>
          <CgTextField size="small" label="Tempo" placeholder="Ej. 3-1-1" value={exercise.tempo||''} onChange={(event)=>updateExercise(index,{tempo:event.target.value})}/>
          <CgTextField size="small" multiline minRows={2} label="Instrucciones" value={exercise.instructions||''} onChange={(event)=>updateExercise(index,{instructions:event.target.value})} sx={{gridColumn:'1/-1'}}/>
          <CgTextField size="small" multiline minRows={2} label="Notas" value={exercise.notes||''} onChange={(event)=>updateExercise(index,{notes:event.target.value})} sx={{gridColumn:'1/-1'}}/>
        </Box>
      </Paper>;
    })}
    <CgButton type="button" variant="outlined" onClick={addExercise} disabled={disabled}>Agregar ejercicio</CgButton>
  </Stack>;
}
