import React, { useMemo } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { CgEmptyState, CgStatusChip } from '../ui/cg/CgPrimitives.jsx';
import { FITNESS_WEEK_DAYS } from '../../data/fitnessWeekDays.js';

export function WeeklyRoutineSchedule({exercises=[]}){
  const items=Array.isArray(exercises)?exercises:[];
  const exercisesByDay=useMemo(()=>FITNESS_WEEK_DAYS.map((day)=>({
    ...day,
    exercises:items
      .filter((exercise)=>Number(exercise.dayOfWeek)===day.value)
      .sort((left,right)=>Number(left.sortOrder||0)-Number(right.sortOrder||0))
  })),[items]);

  if(!items.length)return <CgEmptyState title="Semana sin programación" description="Agrega ejercicios y asigna lunes–domingo para visualizar la semana real."/>;

  return <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',xl:'repeat(7,minmax(140px,1fr))'},gap:1}}>
    {exercisesByDay.map((day)=><Paper key={day.value} variant="outlined" sx={{p:1,minWidth:0}}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={.5}>
        <Typography variant="subtitle2">{day.label}</Typography>
        <CgStatusChip size="small" label={day.exercises.length?(day.exercises.length+' ejercicio(s)'):'Descanso'} tone={day.exercises.length?'primary':'default'}/>
      </Stack>
      <Stack gap={.6} mt={.8}>
        {day.exercises.length?day.exercises.map((exercise,index)=><Box key={(exercise.sortOrder||index)+'-'+(exercise.exerciseName||index)}>
          <Typography variant="body2" fontWeight={650}>{exercise.exerciseName||'Ejercicio'}</Typography>
          <Typography variant="caption" color="text.secondary">{exercise.sets||3} × {exercise.reps||'10'} · descanso {exercise.restSeconds??60}s</Typography>
        </Box>):<Typography variant="caption" color="text.secondary">Día de descanso</Typography>}
      </Stack>
    </Paper>)}
  </Box>;
}
