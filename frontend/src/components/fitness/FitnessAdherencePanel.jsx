import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, Divider, FormControlLabel, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';
import { MediaService } from '../../services/mediaService.js';

const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const object=(value)=>value?.data||value||{};
const localDate=(days=0)=>{const now=new Date(Date.now()+days*86400000-new Date().getTimezoneOffset()*60000);return now.toISOString().slice(0,10);};
const localDateTime=()=>{const now=new Date(Date.now()-new Date().getTimezoneOffset()*60000);return now.toISOString().slice(0,16);};
const pct=(value)=>value==null?'—':`${Number(value).toLocaleString('es-VE',{maximumFractionDigits:1})}%`;

const GOAL_KINDS=[
  {value:'workouts_per_week',label:'Entrenamientos por semana',unit:'sesiones/semana'},
  {value:'meal_adherence_pct',label:'Adherencia de comidas',unit:'%'},
  {value:'habit_adherence_pct',label:'Adherencia de hábitos',unit:'%'},
  {value:'weight_kg',label:'Peso objetivo',unit:'kg'},
  {value:'custom',label:'Objetivo personalizado',unit:''}
];

export function FitnessAdherencePanel({members=[],memberId='',onMemberChange,nutritionPlans=[],Toast}){
  const [from,setFrom]=useState(localDate(-27));
  const [to,setTo]=useState(localDate());
  const [data,setData]=useState(null);
  const [signedPhotos,setSignedPhotos]=useState(new Map());
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [mealForm,setMealForm]=useState({planId:'',mealId:'',status:'completed',notes:''});
  const [habitForm,setHabitForm]=useState({name:'',targetPerWeek:'7',notes:''});
  const [goalForm,setGoalForm]=useState({kind:'workouts_per_week',label:'',targetValue:'',unit:'sesiones/semana',dueAt:'',notes:''});
  const [photoForm,setPhotoForm]=useState({file:null,capturedAt:localDateTime(),authorized:false,notes:''});

  const memberOptions=useMemo(()=>[{value:'',label:'Seleccionar cliente'},...members.map((item)=>({value:item.id,label:item.fullName||item.memberCode||'Cliente'}))],[members]);
  const planOptions=useMemo(()=>[{value:'',label:'Seleccionar plan'},...nutritionPlans.map((item)=>({value:item.id,label:item.name||'Plan nutricional'}))],[nutritionPlans]);
  const selectedPlan=nutritionPlans.find((item)=>item.id===mealForm.planId)||null;
  const mealOptions=useMemo(()=>[
    {value:'',label:'Seleccionar comida'},
    ...rows(selectedPlan?.meals).map((meal)=>({value:meal.id,label:`Día ${meal.dayIndex||'—'} · ${meal.mealType||'Comida'}`}))
  ],[selectedPlan]);
  const payload=object(data);
  const summary=payload.summary||{};
  const habits=rows(payload.habits);
  const goals=rows(payload.goals);
  const meals=rows(payload.meals);
  const workouts=rows(payload.workouts);
  const assessments=rows(payload.assessments);
  const photos=rows(payload.photos);
  const notify=(message,tone='success')=>Toast?.show?.(message,tone);

  async function load(){
    if(!memberId){setData(null);setSignedPhotos(new Map());return;}
    setLoading(true);setError('');
    try{
      const response=await GymVerticalService.adherence(memberId,{from,to});
      setData(response);
      const photoRows=rows(object(response).photos);
      try{setSignedPhotos(await MediaService.signPaths(photoRows.map((item)=>item.storagePath),3600));}
      catch{setSignedPhotos(new Map());}
    }catch(cause){setError(cause?.message||'No se pudo cargar la adherencia integral.');}
    finally{setLoading(false);}
  }

  useEffect(()=>{void load();},[memberId]);

  async function action(task,success){
    setSaving(true);setError('');
    try{await task();notify(success,'success');await load();}
    catch(cause){const message=cause?.message||'No se pudo completar la operación.';setError(message);notify(message,'error');}
    finally{setSaving(false);}
  }

  async function logMeal(event){
    event.preventDefault();
    if(!memberId||!mealForm.planId||!mealForm.mealId)return;
    await action(()=>GymVerticalService.logMealAdherence({
      memberId,planId:mealForm.planId,mealId:mealForm.mealId,status:mealForm.status,
      occurredAt:new Date().toISOString(),notes:mealForm.notes.trim()||null
    }),'Adherencia de comida registrada.');
    setMealForm((current)=>({...current,mealId:'',notes:''}));
  }

  async function createHabit(event){
    event.preventDefault();
    if(!memberId||!habitForm.name.trim())return;
    await action(()=>GymVerticalService.createHabit({
      memberId,name:habitForm.name.trim(),targetPerWeek:Number(habitForm.targetPerWeek||7),notes:habitForm.notes.trim()||null
    }),'Hábito creado.');
    setHabitForm({name:'',targetPerWeek:'7',notes:''});
  }

  async function checkHabit(habit,status){
    await action(()=>GymVerticalService.checkInHabit(habit.id,{status,occurredAt:new Date().toISOString(),notes:null}),
      status==='completed'?'Hábito marcado como completado.':'Hábito marcado como omitido.');
  }

  async function toggleHabit(habit){
    await action(()=>GymVerticalService.updateHabit(habit.id,{active:!habit.active}),habit.active?'Hábito archivado.':'Hábito reactivado.');
  }

  async function createGoal(event){
    event.preventDefault();
    if(!memberId||!goalForm.label.trim()||!Number.isFinite(Number(goalForm.targetValue)))return;
    await action(()=>GymVerticalService.createAdherenceGoal({
      memberId,kind:goalForm.kind,label:goalForm.label.trim(),targetValue:Number(goalForm.targetValue),
      unit:goalForm.unit.trim()||GOAL_KINDS.find((item)=>item.value===goalForm.kind)?.unit||'valor',
      dueAt:goalForm.dueAt||null,notes:goalForm.notes.trim()||null
    }),'Objetivo guardado.');
    const meta=GOAL_KINDS.find((item)=>item.value===goalForm.kind);
    setGoalForm((current)=>({...current,label:'',targetValue:'',unit:meta?.unit||'',dueAt:'',notes:''}));
  }

  async function toggleGoal(goal){
    await action(()=>GymVerticalService.updateAdherenceGoal(goal.id,{active:!goal.active}),goal.active?'Objetivo archivado.':'Objetivo reactivado.');
  }

  async function savePhoto(event){
    event.preventDefault();
    if(!memberId||!photoForm.file||!photoForm.authorized){setError('Selecciona una foto y confirma la autorización explícita.');return;}
    await action(async()=>{
      const dataUrl=await MediaService.fileToDataUrl(photoForm.file,{maxBytes:3*1024*1024});
      const uploaded=await MediaService.upload({entityType:'gym-progress',entityId:memberId,dataUrl,alt:'Foto de progreso autorizada'});
      await GymVerticalService.createProgressPhoto({
        memberId,storagePath:uploaded.path,capturedAt:new Date(photoForm.capturedAt).toISOString(),
        authorizationConfirmed:true,notes:photoForm.notes.trim()||null
      });
    },'Foto de progreso autorizada guardada.');
    setPhotoForm({file:null,capturedAt:localDateTime(),authorized:false,notes:''});
  }

  const goalKindChanged=(kind)=>{
    const meta=GOAL_KINDS.find((item)=>item.value===kind);
    setGoalForm((current)=>({...current,kind,unit:meta?.unit||''}));
  };

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',lg:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Adherencia integral</Typography>
        <Typography variant="caption" color="text.secondary">Comidas, entrenamientos, hábitos, medidas, fotos autorizadas y objetivos. Los entrenamientos y mediciones se leen desde sus registros canónicos existentes.</Typography>
      </Box>
      <Stack direction={{xs:'column',sm:'row'}} gap={.8}>
        <CgTextField label="Desde" type="date" slotProps={{inputLabel:{shrink:true}}} value={from} onChange={(e)=>setFrom(e.target.value)}/>
        <CgTextField label="Hasta" type="date" slotProps={{inputLabel:{shrink:true}}} value={to} onChange={(e)=>setTo(e.target.value)}/>
        <CgButton variant="outlined" disabled={!memberId||loading} onClick={()=>void load()}>{loading?'Actualizando…':'Actualizar'}</CgButton>
      </Stack>
    </Stack>
    <Box mt={1}><CgSelect label="Cliente" value={memberId} onChange={(e)=>onMemberChange?.(e.target.value)} options={memberOptions}/></Box>
    {error?<Box mt={1}><CgState severity="warning" title="Adherencia no disponible">{error}</CgState></Box>:null}
    {!memberId?<Box mt={1}><CgEmptyState title="Selecciona un cliente" description="La adherencia se muestra por cliente y período."/></Box>:null}

    {memberId&&data?<>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'repeat(4,minmax(0,1fr))'},gap:1,mt:1.2}}>
        <Paper variant="outlined" sx={{p:1}}><Typography variant="caption" color="text.secondary">Adherencia comidas</Typography><Typography variant="h6">{pct(summary.mealAdherencePct)}</Typography><Typography variant="caption">{summary.completedMeals||0} completas · {summary.partialMeals||0} parciales · {summary.unloggedMeals||0} sin registro</Typography></Paper>
        <Paper variant="outlined" sx={{p:1}}><Typography variant="caption" color="text.secondary">Entrenamientos completados</Typography><Typography variant="h6">{summary.completedWorkouts||0}</Typography><Typography variant="caption">Derivado de sesiones reales</Typography></Paper>
        <Paper variant="outlined" sx={{p:1}}><Typography variant="caption" color="text.secondary">Evaluaciones</Typography><Typography variant="h6">{summary.assessments||0}</Typography><Typography variant="caption">Peso y medidas existentes</Typography></Paper>
        <Paper variant="outlined" sx={{p:1}}><Typography variant="caption" color="text.secondary">Fotos autorizadas</Typography><Typography variant="h6">{summary.authorizedPhotos||0}</Typography><Typography variant="caption">Solo consentimiento explícito</Typography></Paper>
      </Box>

      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'repeat(2,minmax(0,1fr))'},gap:1.2,mt:1.2}}>
        <Paper variant="outlined" sx={{p:1.2}}>
          <Typography variant="subtitle1" fontWeight={700}>Registro de comidas</Typography>
          <Box component="form" onSubmit={logMeal} sx={{mt:1}}>
            <Stack gap={.8}>
              <CgSelect label="Plan" value={mealForm.planId} onChange={(e)=>setMealForm({...mealForm,planId:e.target.value,mealId:''})} options={planOptions}/>
              <CgSelect label="Comida" value={mealForm.mealId} onChange={(e)=>setMealForm({...mealForm,mealId:e.target.value})} options={mealOptions}/>
              <CgSelect label="Estado" value={mealForm.status} onChange={(e)=>setMealForm({...mealForm,status:e.target.value})} options={[{value:'completed',label:'Completada'},{value:'partial',label:'Parcial'},{value:'skipped',label:'Omitida'}]}/>
              <CgTextField label="Notas" multiline minRows={2} value={mealForm.notes} onChange={(e)=>setMealForm({...mealForm,notes:e.target.value})}/>
              <CgButton type="submit" disabled={saving||!mealForm.mealId}>Registrar comida</CgButton>
            </Stack>
          </Box>
          <Divider sx={{my:1}}/>
          {meals.length?<Stack gap={.5}>{meals.slice(0,12).map((meal)=><Stack key={meal.mealId} direction="row" justifyContent="space-between" gap={1}><Typography variant="body2">{meal.plannedDate} · {meal.mealType}</Typography><CgStatusChip label={meal.status==='completed'?'Completada':meal.status==='partial'?'Parcial':meal.status==='skipped'?'Omitida':'Sin registro'} tone={meal.status==='completed'?'success':meal.status?'warning':'default'}/></Stack>)}</Stack>:<CgEmptyState title="Sin comidas planificadas" description="No hay comidas fechadas en el período seleccionado."/>}
        </Paper>

        <Paper variant="outlined" sx={{p:1.2}}>
          <Typography variant="subtitle1" fontWeight={700}>Hábitos</Typography>
          <Box component="form" onSubmit={createHabit} sx={{mt:1}}>
            <Stack gap={.8}>
              <CgTextField label="Hábito" value={habitForm.name} onChange={(e)=>setHabitForm({...habitForm,name:e.target.value})}/>
              <CgTextField label="Objetivo por semana" type="number" inputProps={{min:1,max:14}} value={habitForm.targetPerWeek} onChange={(e)=>setHabitForm({...habitForm,targetPerWeek:e.target.value})}/>
              <CgTextField label="Notas" value={habitForm.notes} onChange={(e)=>setHabitForm({...habitForm,notes:e.target.value})}/>
              <CgButton type="submit" disabled={saving||!habitForm.name.trim()}>Crear hábito</CgButton>
            </Stack>
          </Box>
          <Divider sx={{my:1}}/>
          {habits.length?<Stack gap={.7}>{habits.map((habit)=><Paper key={habit.id} variant="outlined" sx={{p:.8}}><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={.8}><Box><Typography variant="body2" fontWeight={700}>{habit.name}</Typography><Typography variant="caption" color="text.secondary">{habit.completedCount||0}/{habit.expectedCount||0} completados · {pct(habit.adherencePct)}</Typography></Box><Stack direction="row" gap={.5} flexWrap="wrap"><CgButton size="small" onClick={()=>void checkHabit(habit,'completed')} disabled={saving||!habit.active}>Completar</CgButton><CgButton size="small" variant="outlined" onClick={()=>void checkHabit(habit,'skipped')} disabled={saving||!habit.active}>Omitir</CgButton><CgButton size="small" variant="outlined" onClick={()=>void toggleHabit(habit)} disabled={saving}>{habit.active?'Archivar':'Reactivar'}</CgButton></Stack></Stack></Paper>)}</Stack>:<CgEmptyState title="Sin hábitos" description="Crea hábitos explícitos para seguimiento; no se generan rachas ni puntos."/>}
        </Paper>

        <Paper variant="outlined" sx={{p:1.2}}>
          <Typography variant="subtitle1" fontWeight={700}>Objetivos y evolución</Typography>
          <Box component="form" onSubmit={createGoal} sx={{mt:1}}>
            <Stack gap={.8}>
              <CgSelect label="Tipo" value={goalForm.kind} onChange={(e)=>goalKindChanged(e.target.value)} options={GOAL_KINDS.map(({value,label})=>({value,label}))}/>
              <CgTextField label="Objetivo" value={goalForm.label} onChange={(e)=>setGoalForm({...goalForm,label:e.target.value})}/>
              <Stack direction={{xs:'column',sm:'row'}} gap={.8}><CgTextField label="Valor" type="number" inputProps={{min:0,step:.1}} value={goalForm.targetValue} onChange={(e)=>setGoalForm({...goalForm,targetValue:e.target.value})}/><CgTextField label="Unidad" value={goalForm.unit} onChange={(e)=>setGoalForm({...goalForm,unit:e.target.value})}/><CgTextField label="Fecha objetivo" type="date" slotProps={{inputLabel:{shrink:true}}} value={goalForm.dueAt} onChange={(e)=>setGoalForm({...goalForm,dueAt:e.target.value})}/></Stack>
              <CgTextField label="Notas" value={goalForm.notes} onChange={(e)=>setGoalForm({...goalForm,notes:e.target.value})}/>
              <CgButton type="submit" disabled={saving||!goalForm.label.trim()||goalForm.targetValue===''}>Guardar objetivo</CgButton>
            </Stack>
          </Box>
          <Divider sx={{my:1}}/>
          {goals.length?<Stack gap={.6}>{goals.map((goal)=><Stack key={goal.id} direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={.7}><Box><Typography variant="body2" fontWeight={700}>{goal.label}</Typography><Typography variant="caption" color="text.secondary">{goal.targetValue} {goal.unit}{goal.dueAt?` · ${goal.dueAt}`:''}</Typography></Box><CgButton size="small" variant="outlined" disabled={saving} onClick={()=>void toggleGoal(goal)}>{goal.active?'Archivar':'Reactivar'}</CgButton></Stack>)}</Stack>:<CgEmptyState title="Sin objetivos" description="Registra objetivos explícitos del cliente."/>}
          <Divider sx={{my:1}}/>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>Mediciones canónicas</Typography>
          {assessments.length?<Stack gap={.4} mt={.5}>{assessments.slice(0,8).map((item)=><Typography key={item.id} variant="body2">{new Date(item.measuredAt||item.createdAt).toLocaleDateString('es-VE')} · Peso {item.weightKg??'—'} kg · Grasa {item.bodyFatPct??'—'}% · Músculo {item.muscleMassKg??'—'} kg</Typography>)}</Stack>:<Typography variant="body2" mt={.5}>Sin evaluaciones en el período.</Typography>}
          <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" mt={1}>Entrenamientos canónicos</Typography>
          <Typography variant="body2">{workouts.length} sesión(es) completada(s) en el período.</Typography>
        </Paper>

        <Paper variant="outlined" sx={{p:1.2}}>
          <Typography variant="subtitle1" fontWeight={700}>Fotos de progreso autorizadas</Typography>
          <Typography variant="caption" color="text.secondary">La foto se almacena de forma privada y separada de la foto de perfil. Requiere autorización explícita para cada carga.</Typography>
          <Box component="form" onSubmit={savePhoto} sx={{mt:1}}>
            <Stack gap={.8}>
              <Button component="label" variant="outlined">Seleccionar foto<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>setPhotoForm({...photoForm,file:e.target.files?.[0]||null})}/></Button>
              {photoForm.file?<Typography variant="caption">{photoForm.file.name}</Typography>:null}
              <CgTextField label="Fecha y hora" type="datetime-local" slotProps={{inputLabel:{shrink:true}}} value={photoForm.capturedAt} onChange={(e)=>setPhotoForm({...photoForm,capturedAt:e.target.value})}/>
              <CgTextField label="Notas" value={photoForm.notes} onChange={(e)=>setPhotoForm({...photoForm,notes:e.target.value})}/>
              <FormControlLabel control={<Checkbox checked={photoForm.authorized} onChange={(e)=>setPhotoForm({...photoForm,authorized:e.target.checked})}/>} label="Confirmo que existe autorización explícita para guardar esta foto de progreso."/>
              <CgButton type="submit" disabled={saving||!photoForm.file||!photoForm.authorized}>Guardar foto autorizada</CgButton>
            </Stack>
          </Box>
          <Divider sx={{my:1}}/>
          {photos.length?<Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',sm:'repeat(3,minmax(0,1fr))'},gap:.8}}>{photos.map((photo)=><Paper key={photo.id} variant="outlined" sx={{p:.6}}>{signedPhotos.get(photo.storagePath)?<Box component="img" src={signedPhotos.get(photo.storagePath)} alt="Foto de progreso autorizada" sx={{display:'block',width:'100%',aspectRatio:'1 / 1',objectFit:'cover',borderRadius:1}}/>:<CgState severity="info" title="Foto privada">URL temporal no disponible.</CgState>}<Typography variant="caption" display="block" mt={.4}>{new Date(photo.capturedAt).toLocaleString('es-VE')}</Typography></Paper>)}</Box>:<CgEmptyState title="Sin fotos autorizadas" description="Las fotos de progreso requieren consentimiento explícito."/>}
        </Paper>
      </Box>
    </>:null}
  </Paper>;
}
