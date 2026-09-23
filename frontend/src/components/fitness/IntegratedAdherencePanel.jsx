import React, { useEffect, useMemo, useState } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgEmptyState, CgState, CgStatusChip
} from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';

const statusTone=(status)=>status==='completed'?'success':status==='skipped'?'warning':'default';
const statusLabel=(status)=>status==='completed'?'Completada':status==='skipped'?'Omitida':'Pendiente';

function Metric({label,value,hint,tone='default'}){
  return <Paper variant="outlined" sx={{p:1.25,minWidth:0}}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Stack direction="row" gap={.8} alignItems="center" justifyContent="space-between">
      <Typography variant="h6">{value}</Typography>
      {hint?<CgStatusChip size="small" label={hint} tone={tone}/>:null}
    </Stack>
  </Paper>;
}

export function IntegratedAdherencePanel({memberId,Toast}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [busyMealId,setBusyMealId]=useState('');
  const notify=(message,tone='success')=>Toast?.show?.(message,tone);

  async function load(){
    if(!memberId){setData(null);setError('');return;}
    setLoading(true);setError('');
    try{
      setData(await GymVerticalService.adherence(memberId));
    }catch(cause){
      const message=cause?.message||'No se pudo cargar la adherencia.';
      setError(message);
    }finally{setLoading(false);}
  }

  useEffect(()=>{void load();},[memberId]);

  async function recordMeal(meal,status){
    setBusyMealId(meal.mealId);
    try{
      await GymVerticalService.recordMealAdherence({
        memberId,
        nutritionPlanId:meal.nutritionPlanId,
        mealId:meal.mealId,
        status,
        notes:null
      });
      notify(status==='completed'?'Comida marcada como completada.':'Comida marcada como omitida.',status==='completed'?'success':'warning');
      await load();
    }catch(cause){
      notify(cause?.message||'No se pudo registrar la adherencia.','error');
    }finally{setBusyMealId('');}
  }

  const mealRows=useMemo(()=>{
    const rows=Array.isArray(data?.nutrition?.meals)?data.nutrition.meals:[];
    return rows
      .filter((meal)=>meal.due||meal.latestStatus!=='pending')
      .sort((left,right)=>String(right.plannedDate||'').localeCompare(String(left.plannedDate||''))||Number(left.sortOrder||0)-Number(right.sortOrder||0))
      .slice(0,60);
  },[data]);

  if(!memberId)return <CgEmptyState title="Adherencia integral" description="Selecciona un cliente para comparar nutrición, entrenamiento y evolución corporal."/>;
  if(loading&&!data)return <CgState severity="info" title="Adherencia integral">Cargando cumplimiento y evolución del cliente.</CgState>;
  if(error&&!data)return <CgState severity="error" title="No se pudo cargar la adherencia"><Stack gap={1}><Typography variant="body2">{error}</Typography><CgButton variant="outlined" onClick={()=>void load()}>Reintentar</CgButton></Stack></CgState>;

  const nutrition=data?.nutrition||{};
  const training=data?.training||{};
  const evolution=data?.evolution||{};
  const latest=evolution.latestAssessment;
  const previous=evolution.previousAssessment;
  const weightDelta=evolution.weightDeltaKg;
  const goals=Array.isArray(data?.member?.goals)?data.member.goals:[];

  const columns=[
    {key:'date',label:'Fecha planificada',render:(meal)=>meal.plannedDate?new Date(`${meal.plannedDate}T12:00:00`).toLocaleDateString('es-VE'):'Sin fecha'},
    {key:'plan',label:'Plan',render:(meal)=><Box><Typography variant="body2" fontWeight={700}>{meal.planName}</Typography><Typography variant="caption" color="text.secondary">Día {meal.dayIndex} · {meal.mealType}</Typography></Box>},
    {key:'status',label:'Estado',render:(meal)=><CgStatusChip size="small" label={statusLabel(meal.latestStatus)} tone={statusTone(meal.latestStatus)}/>},
    {key:'recorded',label:'Último registro',render:(meal)=>meal.latestEvent?.recordedAt?new Date(meal.latestEvent.recordedAt).toLocaleString('es-VE'):'—'},
    {key:'actions',label:'Acciones',render:(meal)=><Stack direction="row" gap={.6} flexWrap="wrap">
      <CgButton size="small" disabled={busyMealId===meal.mealId} onClick={()=>void recordMeal(meal,'completed')}>Marcar completada</CgButton>
      <CgButton size="small" variant="outlined" disabled={busyMealId===meal.mealId} onClick={()=>void recordMeal(meal,'skipped')}>Marcar omitida</CgButton>
    </Stack>}
  ];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Adherencia integral</Typography>
        <Typography variant="caption" color="text.secondary">Registro explícito de comidas + sesiones reales + evaluaciones corporales existentes. No ajusta planes automáticamente.</Typography>
      </Box>
      <CgButton variant="outlined" onClick={()=>void load()} disabled={loading}>{loading?'Actualizando…':'Actualizar'}</CgButton>
    </Stack>

    {error?<Box mt={1}><CgState severity="warning" title="Actualización parcial">{error}</CgState></Box>:null}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(5,minmax(0,1fr))'},gap:1,mt:1.25}}>
      <Metric label="Adherencia nutricional" value={`${Number(nutrition.adherencePct||0).toFixed(1)}%`} hint={`${nutrition.completedMeals||0}/${nutrition.dueMeals||0}`} tone="success"/>
      <Metric label="Comidas omitidas" value={Number(nutrition.skippedMeals||0)} hint={`${nutrition.pendingMeals||0} pendientes`} tone="warning"/>
      <Metric label="Racha nutricional" value={Number(nutrition.nutritionCompletionStreakDays||0)} hint="días planificados completos" tone="primary"/>
      <Metric label="Sesiones completadas" value={Number(training.trainingCompletedSessions||0)} hint={`${training.trainingDays||0} días / ${training.periodDays||28}d`} tone="info"/>
      <Metric label="Evolución corporal" value={weightDelta==null?'—':`${weightDelta>0?'+':''}${weightDelta} kg`} hint={latest?.weightKg!=null?`${latest.weightKg} kg actual`:'Sin peso'} tone="secondary"/>
    </Box>

    {goals.length?<Stack direction="row" gap={.6} flexWrap="wrap" mt={1.2} alignItems="center">
      <Typography variant="caption" color="text.secondary">Objetivos declarados:</Typography>
      {goals.map((goal)=><CgStatusChip key={goal} size="small" label={String(goal)} tone="default"/>)}
    </Stack>:null}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(0,1.4fr) minmax(280px,.6fr)'},gap:1.25,mt:1.5}}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700}>Cumplimiento de comidas</Typography>
        <Typography variant="caption" color="text.secondary">Cada cambio agrega un evento; el estado mostrado es siempre el último evento explícito de esa comida.</Typography>
        <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}>
          {mealRows.length?<CgDataTable columns={columns} rows={mealRows} getRowId={(row)=>row.mealId} empty="Sin comidas debidas"/>:<CgEmptyState title="Sin comidas debidas" description="El plan necesita fecha de inicio para calcular qué comidas ya vencieron; los planes históricos no se reinterpretan automáticamente."/>}
        </Box>
      </Box>

      <Stack gap={1}>
        <Typography variant="subtitle1" fontWeight={700}>Evolución corporal</Typography>
        {latest?<Paper variant="outlined" sx={{p:1.2}}>
          <Typography variant="body2" fontWeight={700}>Última evaluación</Typography>
          <Typography variant="caption" color="text.secondary">{latest.measuredAt?new Date(latest.measuredAt).toLocaleDateString('es-VE'):'Fecha no disponible'}</Typography>
          <Stack gap={.35} mt={.8}>
            <Typography variant="body2">Peso: {latest.weightKg??'—'} kg</Typography>
            <Typography variant="body2">Grasa corporal: {latest.bodyFatPct??'—'}%</Typography>
            <Typography variant="body2">Masa muscular: {latest.muscleMassKg??'—'} kg</Typography>
          </Stack>
          {previous?<Typography variant="caption" color="text.secondary" display="block" mt={.8}>Comparada contra evaluación del {new Date(previous.measuredAt).toLocaleDateString('es-VE')}.</Typography>:null}
        </Paper>:<CgEmptyState title="Sin evaluación corporal" description="Las medidas se registran en Evaluaciones y aquí sólo se leen para mostrar evolución."/>}
        <CgState severity="info" title="Fuentes canónicas">Entrenamiento: GymWorkoutSession/Set. Medidas: GymAssessment. Nutrición: GymMeal + eventos de adherencia. Este panel no prescribe ni modifica automáticamente rutinas o planes.</CgState>
      </Stack>
    </Box>
  </Paper>;
}
