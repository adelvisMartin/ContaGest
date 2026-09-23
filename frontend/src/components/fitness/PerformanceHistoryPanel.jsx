import React, { useEffect, useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';

const localDate=(date)=>{const value=new Date(date);return new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const defaultFrom=()=>localDate(Date.now()-89*86400000);
const defaultTo=()=>localDate(Date.now());
const number=(value)=>Number.isFinite(Number(value))?Number(value):0;
const format1=(value)=>number(value).toLocaleString('es-VE',{maximumFractionDigits:1});

function Metric({label,value,hint}){
  return <Paper variant="outlined" sx={{p:1.1,minWidth:0}}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="h6" sx={{fontVariantNumeric:'tabular-nums'}}>{value}</Typography>
    {hint?<Typography variant="caption" color="text.secondary">{hint}</Typography>:null}
  </Paper>;
}

function MiniBarChart({items=[],labelKey,valueKey,title,valueLabel}){
  const visible=items.slice(-30);
  const max=Math.max(1,...visible.map((item)=>number(item[valueKey])));
  if(!visible.length)return <CgEmptyState title="Sin datos para graficar" description="Completa sesiones dentro del período seleccionado."/>;
  return <Box role="img" aria-label={title}>
    <Box sx={{height:150,display:'flex',alignItems:'flex-end',gap:.45,overflowX:'auto',pb:.5}}>
      {visible.map((item,index)=>{
        const value=number(item[valueKey]);
        const height=Math.max(value>0?4:1,Math.round((value/max)*135));
        return <Box key={item[labelKey]??index} title={`${item[labelKey]} · ${format1(value)} ${valueLabel}`} sx={{minWidth:14,flex:'1 0 14px',maxWidth:28,height, bgcolor:'primary.main',borderRadius:'4px 4px 0 0'}}/>;
      })}
    </Box>
    <Stack direction="row" justifyContent="space-between" gap={1}>
      <Typography variant="caption" color="text.secondary">{visible[0]?.[labelKey]||'—'}</Typography>
      <Typography variant="caption" color="text.secondary">{visible.at(-1)?.[labelKey]||'—'}</Typography>
    </Stack>
  </Box>;
}

export function PerformanceHistoryPanel({memberId=''}) {
  const [from,setFrom]=useState(defaultFrom());
  const [to,setTo]=useState(defaultTo());
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  async function load(){
    if(!memberId){setData(null);return;}
    setLoading(true);setError('');
    try{
      const response=await GymVerticalService.performance(memberId,{from,to});
      setData(response?.data||response||null);
    }catch(cause){
      setError(cause?.message||'No se pudo cargar el historial de rendimiento.');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void load();},[memberId]);

  const summary=data?.summary||{};
  const byExercise=Array.isArray(data?.byExercise)?data.byExercise:[];
  const byMuscleGroup=Array.isArray(data?.byMuscleGroup)?data.byMuscleGroup:[];
  const dailyTrend=Array.isArray(data?.dailyTrend)?data.dailyTrend:[];

  const muscleChart=useMemo(()=>byMuscleGroup
    .map((item)=>({label:item.muscleGroup||'Sin grupo',volume:item.totalVolume}))
    .sort((a,b)=>b.volume-a.volume),[byMuscleGroup]);

  if(!memberId)return <Paper variant="outlined" sx={{p:1.5}}>
    <CgEmptyState title="Historial sin cliente" description="Selecciona un cliente para analizar su rendimiento."/>
  </Paper>;

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Historial y performance</Typography>
        <Typography variant="caption" color="text.secondary">PRs, volumen, e1RM estimado, frecuencia, adherencia y tendencias derivadas de sesiones completadas.</Typography>
      </Box>
      <CgStatusChip label="Datos derivados" tone="info"/>
    </Stack>
    <Divider sx={{my:1.2}}/>
    <Stack direction={{xs:'column',sm:'row'}} gap={1} alignItems={{sm:'flex-end'}}>
      <CgTextField size="small" type="date" label="Desde" slotProps={{inputLabel:{shrink:true}}} value={from} onChange={(event)=>setFrom(event.target.value)}/>
      <CgTextField size="small" type="date" label="Hasta" slotProps={{inputLabel:{shrink:true}}} value={to} onChange={(event)=>setTo(event.target.value)}/>
      <CgButton type="button" variant="outlined" disabled={loading} onClick={()=>void load()}>Aplicar período</CgButton>
    </Stack>
    {error?<Box mt={1}><CgState severity="error" title="No se pudo cargar performance">{error}</CgState></Box>:null}
    {loading?<Box mt={1}><CgState severity="info" title="Actualizando">Calculando métricas desde sesiones y series.</CgState></Box>:null}

    {data?<>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(5,minmax(0,1fr))'},gap:.8,mt:1.2}}>
        <Metric label="Sesiones completadas" value={summary.completedSessions||0}/>
        <Metric label="Frecuencia" value={`${format1(summary.sessionsPerWeek)} / semana`} hint={`${summary.trainingDays||0} día(s) con entrenamiento`}/>
        <Metric label="Adherencia de series" value={`${format1(summary.setAdherencePct)}%`} hint={`${summary.completedSets||0}/${summary.plannedSets||0} series prescritas`}/>
        <Metric label="Volumen total" value={format1(summary.totalVolume)} hint="kg·rep"/>
        <Metric label="Series omitidas" value={summary.skippedSets||0}/>
      </Box>

      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'repeat(2,minmax(0,1fr))'},gap:1,mt:1.2}}>
        <Paper variant="outlined" sx={{p:1.2,minWidth:0}}>
          <Typography variant="subtitle1" fontWeight={700}>Volumen por día</Typography>
          <Typography variant="caption" color="text.secondary">Últimos días con series dentro del período.</Typography>
          <Box mt={1}><MiniBarChart items={dailyTrend} labelKey="date" valueKey="totalVolume" title="Gráfica de volumen diario" valueLabel="kg·rep"/></Box>
        </Paper>
        <Paper variant="outlined" sx={{p:1.2,minWidth:0}}>
          <Typography variant="subtitle1" fontWeight={700}>Volumen por grupo muscular</Typography>
          <Typography variant="caption" color="text.secondary">Comparación agregada del período seleccionado.</Typography>
          <Box mt={1}><MiniBarChart items={muscleChart} labelKey="label" valueKey="volume" title="Gráfica de volumen por grupo muscular" valueLabel="kg·rep"/></Box>
        </Paper>
      </Box>

      <Divider sx={{my:1.5}}/>
      <Typography variant="h6">PRs y rendimiento por ejercicio</Typography>
      <Stack gap={.8} mt={.8}>
        {byExercise.length?byExercise.map((item)=><Paper key={item.exerciseId} variant="outlined" sx={{p:1}}>
          <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
            <Box>
              <Typography variant="body2" fontWeight={700}>{item.exerciseName}</Typography>
              <Typography variant="caption" color="text.secondary">{item.muscleGroup||'Sin grupo'} · {item.completedSets} series · volumen {format1(item.totalVolume)} kg·rep</Typography>
            </Box>
            <Stack direction="row" gap={.6} flexWrap="wrap">
              <CgStatusChip label={`PR carga: ${format1(item.maxLoadKg)} kg`} tone="success"/>
              <CgStatusChip label={`PR reps: ${item.maxReps||0}`} tone="info"/>
              <CgStatusChip label={item.bestEstimated1RmKg?`e1RM: ${format1(item.bestEstimated1RmKg)} kg`:'e1RM: N/A'} tone={item.bestEstimated1RmKg?'warning':'default'}/>
            </Stack>
          </Stack>
        </Paper>):<CgEmptyState title="Sin PRs calculables" description="Las series completadas aparecerán aquí."/>}
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" mt={1}>e1RM es una estimación Epley y sólo se calcula con carga positiva y series de 1–12 repeticiones; no sustituye un 1RM medido.</Typography>
    </>:<CgEmptyState title="Sin historial" description="Completa una sesión para habilitar las métricas de rendimiento."/>}
  </Paper>;
}
