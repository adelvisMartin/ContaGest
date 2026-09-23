import React, { useEffect, useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';
import { ExerciseSubstitutionPanel } from './ExerciseSubstitutionPanel.jsx';

const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const numericReps=(value)=>/^\d+$/.test(String(value||'').trim())?Number(value):'';
const secondsLabel=(value)=>{
  const seconds=Math.max(0,Number(value||0));
  const minutes=Math.floor(seconds/60);
  const rest=seconds%60;
  return `${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')}`;
};

export function WorkoutSessionPanel({routines=[],memberId='',Toast}){
  const routineRows=rows(routines);
  const [sessions,setSessions]=useState([]);
  const [routineId,setRoutineId]=useState(routineRows[0]?.id||'');
  const [sessionNotes,setSessionNotes]=useState('');
  const [exerciseId,setExerciseId]=useState('');
  const [draft,setDraft]=useState({loadKg:'',reps:'',rir:'',rpe:'',restSeconds:60,notes:''});
  const [selectedSubstitution,setSelectedSubstitution]=useState(null);
  const [timerSeconds,setTimerSeconds]=useState(0);
  const [timerRunning,setTimerRunning]=useState(false);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  const activeSession=useMemo(()=>sessions.find((item)=>item.status==='in_progress')||null,[sessions]);
  const activeRoutine=useMemo(()=>routineRows.find((item)=>item.id===(activeSession?.routineId||routineId))||null,[routineRows,activeSession,routineId]);
  const exercises=Array.isArray(activeRoutine?.exercises)?activeRoutine.exercises:[];
  const loggedSets=Array.isArray(activeSession?.sets)?activeSession.sets:[];
  const selectedExercise=exercises.find((item)=>item.id===exerciseId)||exercises[0]||null;

  useEffect(()=>{
    if(activeSession?.routineId){setRoutineId(activeSession.routineId);return;}
    if(routineId&&routineRows.some((item)=>item.id===routineId))return;
    setRoutineId(routineRows[0]?.id||'');
  },[routineRows,routineId,activeSession]);

  useEffect(()=>{
    if(!selectedExercise){setExerciseId('');setSelectedSubstitution(null);return;}
    if(exerciseId!==selectedExercise.id)setExerciseId(selectedExercise.id);
    setSelectedSubstitution(null);
    setDraft((current)=>({
      ...current,
      loadKg:current.loadKg===''?(selectedExercise.loadKg??''):current.loadKg,
      reps:current.reps===''?numericReps(selectedExercise.reps):current.reps,
      restSeconds:Number(selectedExercise.restSeconds??60)
    }));
  },[selectedExercise?.id]);

  useEffect(()=>{
    if(!timerRunning)return undefined;
    const timer=setInterval(()=>{
      setTimerSeconds((current)=>{
        if(current<=1){setTimerRunning(false);return 0;}
        return current-1;
      });
    },1000);
    return ()=>clearInterval(timer);
  },[timerRunning]);

  const notify=(message,tone='success')=>{if(typeof Toast==='function')Toast(message,tone);};

  async function load(){
    if(!memberId){setSessions([]);return;}
    setLoading(true);setError('');
    try{
      const response=await GymVerticalService.workoutSessions(memberId);
      setSessions(rows(response));
    }catch(cause){
      setError(cause?.message||'No se pudieron cargar las sesiones.');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void load();},[memberId]);

  async function startSession(){
    if(!routineId){setError('Selecciona una rutina.');return;}
    setSaving(true);setError('');
    try{
      await GymVerticalService.startWorkoutSession({routineId,notes:sessionNotes.trim()||null});
      setSessionNotes('');
      await load();
      notify('Sesión iniciada.');
    }catch(cause){
      setError(cause?.message||'No se pudo iniciar la sesión.');
    }finally{
      setSaving(false);
    }
  }

  function nextSetNumber(targetExerciseId){
    const used=loggedSets.filter((item)=>item.routineExerciseId===targetExerciseId).map((item)=>Number(item.setNumber||0));
    return used.length?Math.max(...used)+1:1;
  }

  function startRestTimer(seconds=Number(draft.restSeconds||0)){
    const safe=Math.max(0,Math.min(3600,Number(seconds||0)));
    setTimerSeconds(safe);
    setTimerRunning(safe>0);
  }

  async function recordSet(status='completed'){
    if(!activeSession||!selectedExercise){setError('No hay una sesión activa con ejercicio seleccionado.');return;}
    if(status==='completed'&&(draft.reps===''||draft.reps==null)){setError('Indica las repeticiones realizadas.');return;}
    setSaving(true);setError('');
    try{
      await GymVerticalService.recordWorkoutSet(activeSession.id,{
        routineExerciseId:selectedExercise.id,
        setNumber:nextSetNumber(selectedExercise.id),
        status,
        loadKg:status==='completed'&&draft.loadKg!==''?Number(draft.loadKg):null,
        reps:status==='completed'?Number(draft.reps):null,
        rir:status==='completed'&&draft.rir!==''?Number(draft.rir):null,
        rpe:status==='completed'&&draft.rpe!==''?Number(draft.rpe):null,
        restSeconds:Number(draft.restSeconds||0),
        notes:draft.notes.trim()||null,
        performedExerciseId:status==='completed'?(selectedSubstitution?.id||null):null,
        substitutionReason:status==='completed'&&selectedSubstitution
          ? selectedSubstitution.reasons.join(',')
          : null
      });
      if(status==='completed')startRestTimer();
      setDraft((current)=>({...current,rir:'',rpe:'',notes:''}));
      await load();
      notify(status==='completed'?'Serie registrada.':'Serie omitida.','success');
    }catch(cause){
      setError(cause?.message||'No se pudo registrar la serie.');
    }finally{
      setSaving(false);
    }
  }

  async function completeSession(){
    if(!activeSession)return;
    setSaving(true);setError('');
    try{
      await GymVerticalService.completeWorkoutSession(activeSession.id);
      setTimerRunning(false);setTimerSeconds(0);
      await load();
      notify('Sesión completada.');
    }catch(cause){
      setError(cause?.message||'No se pudo completar la sesión.');
    }finally{
      setSaving(false);
    }
  }

  const routineOptions=[
    {value:'',label:'Seleccionar rutina'},
    ...routineRows.map((item)=>({value:item.id,label:item.name||'Rutina'}))
  ];
  const exerciseOptions=[
    {value:'',label:'Seleccionar ejercicio'},
    ...exercises.map((item)=>({value:item.id,label:item.exerciseName||'Ejercicio'}))
  ];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Ejecución de entrenamiento</Typography>
        <Typography variant="caption" color="text.secondary">Sesión-a-sesión con series realizadas u omitidas, carga, reps, RIR/RPE, descanso, notas y temporizador.</Typography>
      </Box>
      <CgStatusChip label={activeSession?'Sesión activa':'Sin sesión activa'} tone={activeSession?'success':'default'}/>
    </Stack>
    <Divider sx={{my:1.2}}/>
    {error?<CgState severity="error" title="Entrenamiento">{error}</CgState>:null}
    {loading?<CgState severity="info" title="Actualizando">Cargando sesiones.</CgState>:null}

    {!activeSession?<Stack gap={1}>
      <CgSelect label="Rutina" value={routineId} onChange={(event)=>setRoutineId(event.target.value)} options={routineOptions}/>
      <CgTextField size="small" multiline minRows={2} label="Notas de inicio" value={sessionNotes} onChange={(event)=>setSessionNotes(event.target.value)}/>
      <CgButton type="button" onClick={()=>void startSession()} disabled={saving||!routineId}>Iniciar sesión</CgButton>
    </Stack>:<Stack gap={1}>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'minmax(0,1fr) 220px'},gap:1}}>
        <Box>
          <CgSelect label="Ejercicio" value={selectedExercise?.id||''} onChange={(event)=>{setExerciseId(event.target.value);setSelectedSubstitution(null);setDraft({loadKg:'',reps:'',rir:'',rpe:'',restSeconds:60,notes:''});}} options={exerciseOptions}/>
          {selectedExercise?<Typography variant="caption" color="text.secondary" display="block" mt={.5}>
            Prescrito: {selectedExercise.sets||3} × {selectedExercise.reps||'—'} · carga {selectedExercise.loadKg??'—'} kg · descanso {selectedExercise.restSeconds??60}s
          </Typography>:null}
        </Box>
        <Paper variant="outlined" sx={{p:1,textAlign:'center'}}>
          <Typography variant="caption" color="text.secondary">Temporizador de descanso</Typography>
          <Typography variant="h4" sx={{fontVariantNumeric:'tabular-nums'}}>{secondsLabel(timerSeconds)}</Typography>
          <Stack direction="row" gap={.5} justifyContent="center">
            <CgButton type="button" size="small" variant="outlined" onClick={()=>startRestTimer()} disabled={saving}>Iniciar</CgButton>
            <CgButton type="button" size="small" variant="outlined" onClick={()=>setTimerRunning(false)} disabled={!timerRunning}>Pausar</CgButton>
            <CgButton type="button" size="small" variant="outlined" onClick={()=>{setTimerRunning(false);setTimerSeconds(0);}}>Reiniciar</CgButton>
          </Stack>
        </Paper>
      </Box>

      {selectedExercise?<ExerciseSubstitutionPanel
        routineExercise={selectedExercise}
        selected={selectedSubstitution}
        onSelect={setSelectedSubstitution}
        disabled={saving}
      />:null}

      {selectedExercise?<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(3,minmax(0,1fr))'},gap:1}}>
        <CgTextField size="small" label="Carga realizada (kg)" type="number" inputProps={{min:0,step:.25}} value={draft.loadKg} onChange={(event)=>setDraft({...draft,loadKg:event.target.value})}/>
        <CgTextField size="small" label="Reps realizadas" type="number" inputProps={{min:0,max:500,step:1}} value={draft.reps} onChange={(event)=>setDraft({...draft,reps:event.target.value})}/>
        <CgTextField size="small" label="Descanso tras serie (s)" type="number" inputProps={{min:0,max:3600,step:5}} value={draft.restSeconds} onChange={(event)=>setDraft({...draft,restSeconds:event.target.value})}/>
        <CgTextField size="small" label="RIR" type="number" inputProps={{min:0,max:10,step:.5}} value={draft.rir} onChange={(event)=>setDraft({...draft,rir:event.target.value})}/>
        <CgTextField size="small" label="RPE" type="number" inputProps={{min:1,max:10,step:.5}} value={draft.rpe} onChange={(event)=>setDraft({...draft,rpe:event.target.value})}/>
        <CgTextField size="small" label="Notas" value={draft.notes} onChange={(event)=>setDraft({...draft,notes:event.target.value})}/>
        <Stack direction="row" gap={.7} sx={{gridColumn:'1/-1'}}>
          <CgButton type="button" disabled={saving} onClick={()=>void recordSet('completed')}>Registrar serie</CgButton>
          <CgButton type="button" variant="outlined" disabled={saving} onClick={()=>void recordSet('skipped')}>Omitir serie</CgButton>
        </Stack>
      </Box>:<CgEmptyState title="Sin ejercicio" description="Selecciona un ejercicio de la rutina activa."/>}

      <Divider/>
      <Typography variant="subtitle1" fontWeight={700}>Progreso de la sesión</Typography>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:.8}}>
        {exercises.map((exercise)=>{
          const sets=loggedSets.filter((item)=>item.routineExerciseId===exercise.id);
          const skipped=sets.filter((item)=>item.status==='skipped').length;
          return <Paper key={exercise.id} variant="outlined" sx={{p:1}}>
            <Stack direction="row" justifyContent="space-between" gap={1}>
              <Box>
                <Typography variant="body2" fontWeight={700}>{exercise.exerciseName}</Typography>
                <Typography variant="caption" color="text.secondary">{sets.length}/{exercise.sets||0} registradas · {skipped} omitida(s)</Typography>
              </Box>
              <CgStatusChip label={sets.length>=Number(exercise.sets||0)?'Completo':'En curso'} tone={sets.length>=Number(exercise.sets||0)?'success':'warning'}/>
            </Stack>
          </Paper>;
        })}
      </Box>
      <CgButton type="button" color="success" disabled={saving} onClick={()=>void completeSession()}>Completar sesión</CgButton>
    </Stack>}

    <Divider sx={{my:1.5}}/>
    <Typography variant="h6">Sesiones recientes</Typography>
    <Stack gap={.7} mt={.8}>
      {sessions.length?sessions.map((session)=><Paper key={session.id} variant="outlined" sx={{p:1}}>
        <Stack direction="row" justifyContent="space-between" gap={1}>
          <Box>
            <Typography variant="body2" fontWeight={700}>{routineRows.find((item)=>item.id===session.routineId)?.name||'Rutina'}</Typography>
            <Typography variant="caption" color="text.secondary">{new Date(session.startedAt).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})} · {Array.isArray(session.sets)?session.sets.length:0} serie(s)</Typography>
          </Box>
          <CgStatusChip label={session.status==='completed'?'Completada':'En curso'} tone={session.status==='completed'?'success':'warning'}/>
        </Stack>
      </Paper>):<CgEmptyState title="Sin sesiones" description="Las sesiones iniciadas aparecerán aquí."/>}
    </Stack>
  </Paper>;
}
