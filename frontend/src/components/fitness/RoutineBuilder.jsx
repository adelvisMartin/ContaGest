import React, { useMemo } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgEmptyState, CgSelect, CgTextField
} from '../ui/cg/CgPrimitives.jsx';
import { FITNESS_EXERCISES, FITNESS_MUSCLES } from '../../data/fitnessExerciseCatalog.js';
import { FITNESS_WEEK_DAYS } from '../../data/fitnessWeekDays.js';
import { FITNESS_INTENSITY_TECHNIQUES, fitnessIntensityTechnique } from '../../data/fitnessIntensityTechniques.js';
import { FITNESS_PROGRESSION_STRATEGIES, fitnessProgressionStrategy } from '../../data/fitnessProgressionStrategies.js';

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
  notes:'',
  intensityTechnique:'standard',
  techniqueConfig:{},
  progressionStrategy:'manual',
  progressionConfig:{}
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
    const copy={...current,exerciseId:null,sortOrder:index+2,techniqueConfig:{...(current.techniqueConfig||{})},progressionConfig:{...(current.progressionConfig||{})}};
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
      const intensityTechnique=exercise.intensityTechnique||'standard';
      const technique=fitnessIntensityTechnique(intensityTechnique);
      const techniqueConfig=exercise.techniqueConfig||{};
      const updateTechniqueConfig=(patch)=>updateExercise(index,{techniqueConfig:{...techniqueConfig,...patch}});
      const progressionStrategy=exercise.progressionStrategy||'manual';
      const progression=fitnessProgressionStrategy(progressionStrategy);
      const progressionConfig=exercise.progressionConfig||{};
      const updateProgressionConfig=(patch)=>updateExercise(index,{progressionConfig:{...progressionConfig,...patch}});
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
          <CgSelect
            label="Técnica de intensidad"
            value={intensityTechnique}
            onChange={(event)=>updateExercise(index,{intensityTechnique:event.target.value,techniqueConfig:event.target.value==='standard'?{}:{...techniqueConfig}})}
            options={FITNESS_INTENSITY_TECHNIQUES.map(({value,label})=>({value,label}))}
          />
          <Box sx={{gridColumn:'1/-1'}}>
            <Typography variant="caption" color="text.secondary">{technique.description}</Typography>
          </Box>
          {technique.config.includes('rounds')?<CgTextField size="small" label="Rondas" type="number" inputProps={{min:1,max:12,step:1}} value={techniqueConfig.rounds??''} onChange={(event)=>updateTechniqueConfig({rounds:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {technique.config.includes('intraRestSeconds')?<CgTextField size="small" label="Descanso intra-técnica (s)" type="number" inputProps={{min:1,max:600,step:5}} value={techniqueConfig.intraRestSeconds??''} onChange={(event)=>updateTechniqueConfig({intraRestSeconds:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {technique.config.includes('loadDropPct')?<CgTextField size="small" label="Reducción de carga (%)" type="number" inputProps={{min:1,max:90,step:1}} value={techniqueConfig.loadDropPct??''} onChange={(event)=>updateTechniqueConfig({loadDropPct:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {technique.config.includes('groupKey')?<CgTextField size="small" label="Clave de grupo" placeholder="Ej. A1" value={techniqueConfig.groupKey||''} onChange={(event)=>updateTechniqueConfig({groupKey:event.target.value})}/>:null}
          {technique.config.includes('holdSeconds')?<CgTextField size="small" label="Duración isométrica (s)" type="number" inputProps={{min:1,max:300,step:1}} value={techniqueConfig.holdSeconds??''} onChange={(event)=>updateTechniqueConfig({holdSeconds:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {intensityTechnique!=='standard'?<CgTextField size="small" multiline minRows={2} label="Notas de técnica" value={techniqueConfig.techniqueNotes||''} onChange={(event)=>updateTechniqueConfig({techniqueNotes:event.target.value})} sx={{gridColumn:'1/-1'}}/>:null}
          <CgSelect
            label="Estrategia de progresión"
            value={progressionStrategy}
            onChange={(event)=>updateExercise(index,{progressionStrategy:event.target.value,progressionConfig:event.target.value==='manual'?{}:{...progressionConfig}})}
            options={FITNESS_PROGRESSION_STRATEGIES.map(({value,label})=>({value,label}))}
          />
          <Box sx={{gridColumn:'1/-1'}}>
            <Typography variant="caption" color="text.secondary">{progression.description} La recomendación nunca se aplica automáticamente.</Typography>
          </Box>
          {progression.config.includes('repRangeMin')?<CgTextField size="small" label="Rango reps mín." type="number" inputProps={{min:1,max:100,step:1}} value={progressionConfig.repRangeMin??''} onChange={(event)=>updateProgressionConfig({repRangeMin:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {progression.config.includes('repRangeMax')?<CgTextField size="small" label="Rango reps máx." type="number" inputProps={{min:1,max:100,step:1}} value={progressionConfig.repRangeMax??''} onChange={(event)=>updateProgressionConfig({repRangeMax:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {progression.config.includes('repIncrement')?<CgTextField size="small" label="Incremento reps" type="number" inputProps={{min:1,max:20,step:1}} value={progressionConfig.repIncrement??''} onChange={(event)=>updateProgressionConfig({repIncrement:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {progression.config.includes('loadIncrementKg')?<CgTextField size="small" label="Incremento carga (kg)" type="number" inputProps={{min:.01,max:100,step:.25}} value={progressionConfig.loadIncrementKg??''} onChange={(event)=>updateProgressionConfig({loadIncrementKg:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {progression.config.includes('targetRir')?<CgTextField size="small" label="RIR objetivo" type="number" inputProps={{min:0,max:10,step:.5}} value={progressionConfig.targetRir??''} onChange={(event)=>updateProgressionConfig({targetRir:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {progression.config.includes('targetRpe')?<CgTextField size="small" label="RPE objetivo" type="number" inputProps={{min:1,max:10,step:.5}} value={progressionConfig.targetRpe??''} onChange={(event)=>updateProgressionConfig({targetRpe:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {progression.config.includes('oneRepMaxKg')?<CgTextField size="small" label="1RM de referencia (kg)" type="number" inputProps={{min:.01,max:1000,step:.25}} value={progressionConfig.oneRepMaxKg??''} onChange={(event)=>updateProgressionConfig({oneRepMaxKg:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {progression.config.includes('percent1Rm')?<CgTextField size="small" label="% de 1RM" type="number" inputProps={{min:1,max:100,step:1}} value={progressionConfig.percent1Rm??''} onChange={(event)=>updateProgressionConfig({percent1Rm:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {progression.config.includes('stallAfter')?<CgTextField size="small" label="Estancamiento tras (sesiones)" type="number" inputProps={{min:1,max:12,step:1}} value={progressionConfig.stallAfter??''} onChange={(event)=>updateProgressionConfig({stallAfter:event.target.value===''?null:Number(event.target.value)})}/>:null}
          {progression.config.includes('resetPct')?<CgTextField size="small" label="Reset de carga (%)" type="number" inputProps={{min:1,max:50,step:1}} value={progressionConfig.resetPct??''} onChange={(event)=>updateProgressionConfig({resetPct:event.target.value===''?null:Number(event.target.value)})}/>:null}
          <CgTextField size="small" multiline minRows={2} label="Instrucciones" value={exercise.instructions||''} onChange={(event)=>updateExercise(index,{instructions:event.target.value})} sx={{gridColumn:'1/-1'}}/>
          <CgTextField size="small" multiline minRows={2} label="Notas" value={exercise.notes||''} onChange={(event)=>updateExercise(index,{notes:event.target.value})} sx={{gridColumn:'1/-1'}}/>
        </Box>
      </Paper>;
    })}
    <CgButton type="button" variant="outlined" onClick={addExercise} disabled={disabled}>Agregar ejercicio</CgButton>
  </Stack>;
}
