import React, { useMemo, useState } from 'react';
import { Box, Checkbox, Divider, FormControlLabel, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { FitnessRoutineService } from '../../services/fitnessRoutineService.js';
import { FitnessNutritionService } from '../../services/fitnessNutritionService.js';
import { FitnessClientTransferService } from '../../services/fitnessClientTransferService.js';
import { FoodDataCentralService } from '../../services/foodDataCentralService.js';
import { GymVerticalService } from '../../services/verticalService.js';

const memberOptions=(members)=>[{value:'',label:'Usuario test / sin registrar'},...members.map((member)=>({value:member.id,label:member.fullName||member.memberCode||'Cliente'}))];
const notify=(Toast,message,tone='success')=>Toast?.show?.(message,tone);

async function copyText(value,Toast,successMessage){
  if(!navigator.clipboard?.writeText){notify(Toast,'El navegador no habilitó el portapapeles.','warning');return false;}
  await navigator.clipboard.writeText(value);
  notify(Toast,successMessage,'success');
  return true;
}

function RoutineResult({routine}){
  if(!routine)return <CgEmptyState title="Sin rutina generada" description="Selecciona músculos y genera una sugerencia para verla aquí."/>;
  return <Paper variant="outlined" sx={{p:1.4}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}>
      <Box><Typography variant="subtitle1" fontWeight={700}>{routine.name}</Typography><Typography variant="caption" color="text.secondary">{routine.impact}</Typography></Box>
      <CgStatusChip label={`${routine.totalSets} series`} tone="primary"/>
    </Stack>
    <Typography variant="body2" sx={{mt:1}}><strong>Calentamiento:</strong> {routine.warmup}</Typography>
    <Stack gap={.8} mt={1.2}>{routine.exercises.map((item)=><Paper key={`${item.muscle}-${item.sortOrder}-${item.name}`} variant="outlined" sx={{p:1}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={.7}>
        <Box><Typography variant="body2" fontWeight={700}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.muscle} · {item.equipment}</Typography></Box>
        <Typography variant="body2">{item.sets} × {item.reps} · {item.restSeconds}s</Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">{item.cue}</Typography>
    </Paper>)}</Stack>
  </Paper>;
}

export function FitnessRoutineQuickTool({members,Toast,onDataChanged}){
  const [memberId,setMemberId]=useState('');
  const [level,setLevel]=useState('Intermedio');
  const [goal,setGoal]=useState('Hipertrofia / volumen');
  const [durationMin,setDurationMin]=useState('60');
  const [notes,setNotes]=useState('');
  const [muscles,setMuscles]=useState(['Pecho','Tríceps']);
  const [generated,setGenerated]=useState(null);
  const options=useMemo(()=>memberOptions(members),[members]);

  const toggleMuscle=(muscle)=>setMuscles((current)=>current.includes(muscle)?current.filter((item)=>item!==muscle):[...current,muscle]);
  const generate=()=>{
    if(!muscles.length)return notify(Toast,'Selecciona al menos un grupo muscular.','warning');
    setGenerated(FitnessRoutineService.generate({muscles,level,goal,durationMin,notes}));
  };
  const copy=async()=>{
    if(!generated)return;
    const client=members.find((item)=>item.id===memberId);
    try{await copyText(FitnessRoutineService.whatsapp(generated,{clientName:client?.fullName||'',guest:!client}),Toast,'Rutina copiada. En usuario test no se incluye un nombre ficticio.');}
    catch(error){notify(Toast,`No se pudo copiar: ${error.message}`,'error');}
  };
  const save=async()=>{
    if(!generated)return;
    if(!memberId)return notify(Toast,'Selecciona un cliente real para guardar.','warning');
    try{
      await GymVerticalService.createRoutine({memberId,trainerId:null,name:generated.name,goal:generated.goal,level:generated.level.toLowerCase(),daysPerWeek:1,exercises:FitnessRoutineService.toApiExercises(generated),notes:generated.notes,active:true});
      notify(Toast,'Rutina guardada al cliente.','success');
      await onDataChanged?.(memberId);
    }catch(error){notify(Toast,`No se pudo guardar: ${error.message}`,'error');}
  };

  return <Paper className="cg-fast-coach" variant="outlined" sx={{p:1.5}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Box><Typography variant="h6">Rutina rápida del entrenador</Typography><Typography variant="caption" color="text.secondary">Usuario test / sin registrar permite resolver una sesión cara a cara sin crear un cliente.</Typography></Box><CgStatusChip label="Sin formulario largo" tone="info"/></Stack>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(4,minmax(0,1fr))'},gap:1,mt:1.4}}>
      <CgSelect label="Cliente opcional" value={memberId} onChange={(e)=>setMemberId(e.target.value)} options={options}/>
      <CgSelect label="Nivel" value={level} onChange={(e)=>setLevel(e.target.value)} options={['Principiante','Intermedio','Avanzado'].map((value)=>({value,label:value}))}/>
      <CgSelect label="Objetivo" value={goal} onChange={(e)=>setGoal(e.target.value)} options={['Hipertrofia / volumen','Fuerza','Resistencia muscular','Potencia / acondicionamiento'].map((value)=>({value,label:value}))}/>
      <CgSelect label="Duración" value={durationMin} onChange={(e)=>setDurationMin(e.target.value)} options={[40,60,80,100].map((value)=>({value:String(value),label:`${value} min`}))}/>
    </Box>
    <Box sx={{mt:1.25}}><Typography variant="caption" color="text.secondary" fontWeight={700}>Músculos de hoy</Typography><Stack direction="row" flexWrap="wrap" gap={.65} mt={.6}>{FitnessRoutineService.muscles.map((muscle)=><CgButton key={muscle} type="button" size="small" variant={muscles.includes(muscle)?'contained':'outlined'} aria-pressed={muscles.includes(muscle)} onClick={()=>toggleMuscle(muscle)}>{muscle}</CgButton>)}</Stack></Box>
    <CgTextField fullWidth size="small" label="Nota rápida del entrenador" value={notes} onChange={(e)=>setNotes(e.target.value)} sx={{mt:1.2}}/>
    <Stack direction="row" flexWrap="wrap" gap={.8} mt={1.2}><CgButton onClick={generate}>Generar sugerencia</CgButton><CgButton variant="outlined" onClick={()=>void copy()} disabled={!generated}>Copiar para WhatsApp</CgButton><CgButton variant="outlined" onClick={()=>void save()} disabled={!generated||!memberId}>Guardar al cliente</CgButton></Stack>
    <Box mt={1.3}><RoutineResult routine={generated}/></Box>
  </Paper>;
}

function NutritionResult({plan}){
  if(!plan)return <CgEmptyState title="Sin plan generado" description="Configura objetivo, datos de referencia y días para generar una propuesta."/>;
  if(plan.blocked)return <CgState severity="warning" title="Generación bloqueada">{plan.reason}</CgState>;
  return <Paper variant="outlined" sx={{p:1.4}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Box><Typography variant="subtitle1" fontWeight={700}>{plan.goal}</Typography><Typography variant="caption" color="text.secondary">{plan.calories} kcal · P {plan.proteinG}g · C {plan.carbsG}g · G {plan.fatG}g · agua {plan.waterMl} ml</Typography></Box><CgStatusChip label={`${plan.days.length} día(s)`} tone="success"/></Stack>
    <Stack gap={1} mt={1.2}>{plan.days.map((day)=><Paper key={day.day} variant="outlined" sx={{p:1}}><Typography variant="subtitle2">Día {day.day}</Typography>{day.meals.map((meal)=><Box key={`${day.day}-${meal.type}`} sx={{mt:.6}}><Typography variant="body2"><strong>{meal.type}:</strong> {meal.name} · ~{meal.calories} kcal</Typography><Typography variant="caption" color="text.secondary">{meal.items}</Typography>{meal.proteinAlternatives?.length?<Typography variant="caption" color="text.secondary" display="block"><strong>Proteína alternativa:</strong> {meal.proteinAlternatives.join(' · ')}</Typography>:null}</Box>)}</Paper>)}</Stack>
    <Typography variant="caption" color="text.secondary" display="block" mt={1}>{plan.disclaimer}</Typography>
  </Paper>;
}

export function FitnessNutritionQuickTool({members,Toast,onDataChanged}){
  const [memberId,setMemberId]=useState('');
  const [form,setForm]=useState({goal:'Pérdida de grasa',weightKg:'75',heightCm:'175',age:'30',sex:'other',activity:'moderate',preference:'Equilibrada',days:'7',clinicalRisk:false});
  const [generated,setGenerated]=useState(null);
  const [foodQuery,setFoodQuery]=useState('');
  const [foods,setFoods]=useState([]);
  const [foodLoading,setFoodLoading]=useState(false);
  const options=useMemo(()=>memberOptions(members),[members]);
  const set=(key)=>(event)=>setForm((current)=>({...current,[key]:event.target.value}));

  const generate=()=>setGenerated(FitnessNutritionService.generate({...form,clinicalRisk:Boolean(form.clinicalRisk)}));
  const copy=async()=>{
    if(!generated)return;
    const client=members.find((item)=>item.id===memberId);
    try{await copyText(FitnessNutritionService.whatsapp(generated,{clientName:client?.fullName||'',guest:!client}),Toast,'Plan copiado para WhatsApp.');}
    catch(error){notify(Toast,`No se pudo copiar: ${error.message}`,'error');}
  };
  const save=async()=>{
    if(!generated||generated.blocked||!memberId)return;
    try{
      await GymVerticalService.createNutrition({memberId,trainerId:null,name:`Plan ${generated.goal} · ${generated.days.length} días`,goal:generated.goal,targetCalories:generated.calories,waterMl:generated.waterMl,meals:FitnessNutritionService.toApiMeals(generated),notes:generated.disclaimer,active:true});
      notify(Toast,'Plan nutricional guardado.','success');
      await onDataChanged?.(memberId);
    }catch(error){notify(Toast,`No se pudo guardar: ${error.message}`,'error');}
  };
  const searchFood=async()=>{
    const query=foodQuery.trim();
    if(query.length<2)return notify(Toast,'Escribe al menos dos caracteres para buscar alimentos.','warning');
    setFoodLoading(true);
    try{setFoods(await FoodDataCentralService.search(query,{pageSize:8}));}
    catch(error){setFoods([]);notify(Toast,error.message,'error');}
    finally{setFoodLoading(false);}
  };

  return <Stack gap={1.25}>
    <Paper className="cg-fast-coach" variant="outlined" sx={{p:1.5}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Box><Typography variant="h6">Plan nutricional rápido</Typography><Typography variant="caption" color="text.secondary">Propuesta editable por objetivos; el modo test no registra cliente.</Typography></Box><CgStatusChip label="1–7 días" tone="success"/></Stack>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',lg:'repeat(3,minmax(0,1fr))'},gap:1,mt:1.3}}>
        <CgSelect label="Cliente opcional" value={memberId} onChange={(e)=>setMemberId(e.target.value)} options={options}/>
        <CgSelect label="Objetivo" value={form.goal} onChange={set('goal')} options={['Pérdida de grasa','Mantenimiento','Ganancia de masa'].map((value)=>({value,label:value}))}/>
        <CgTextField size="small" label="Peso kg" type="number" value={form.weightKg} onChange={set('weightKg')}/>
        <CgTextField size="small" label="Altura cm" type="number" value={form.heightCm} onChange={set('heightCm')}/>
        <CgTextField size="small" label="Edad" type="number" value={form.age} onChange={set('age')}/>
        <CgSelect label="Sexo para estimación" value={form.sex} onChange={set('sex')} options={[['other','No especificar'],['female','Femenino'],['male','Masculino']].map(([value,label])=>({value,label}))}/>
        <CgSelect label="Actividad" value={form.activity} onChange={set('activity')} options={[['light','Ligera'],['moderate','Moderada'],['high','Alta']].map(([value,label])=>({value,label}))}/>
        <CgSelect label="Preferencia" value={form.preference} onChange={set('preference')} options={['Equilibrada','Vegetariana','Vegana'].map((value)=>({value,label:value}))}/>
        <CgSelect label="Días" value={form.days} onChange={set('days')} options={['1','3','7'].map((value)=>({value,label:value}))}/>
      </Box>
      <FormControlLabel sx={{mt:1}} control={<Checkbox checked={Boolean(form.clinicalRisk)} onChange={(e)=>setForm((current)=>({...current,clinicalRisk:e.target.checked}))}/>} label="Existe embarazo, trastorno alimentario, enfermedad renal/metabólica, medicación relevante o dieta terapéutica"/>
      <Stack direction="row" flexWrap="wrap" gap={.8} mt={1}><CgButton onClick={generate}>Generar plan</CgButton><CgButton variant="outlined" onClick={()=>void copy()} disabled={!generated}>Copiar para WhatsApp</CgButton><CgButton variant="outlined" onClick={()=>void save()} disabled={!generated||generated.blocked||!memberId}>Guardar al cliente</CgButton></Stack>
      <Box mt={1.3}><NutritionResult plan={generated}/></Box>
    </Paper>

    <Paper className="cg-fooddata-tool" variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Verificar alimento · USDA FoodData Central</Typography><Typography variant="caption" color="text.secondary">La clave API permanece sólo en servidor.</Typography>
      <Stack direction={{xs:'column',sm:'row'}} gap={1} mt={1.2}><CgTextField fullWidth size="small" label="Buscar alimento" value={foodQuery} onChange={(e)=>setFoodQuery(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'){e.preventDefault();void searchFood();}}}/><CgButton variant="outlined" onClick={()=>void searchFood()} disabled={foodLoading}>{foodLoading?'Consultando…':'Buscar'}</CgButton></Stack>
      <Stack gap={.7} mt={1.2}>{foods.length?foods.map((food)=><Paper key={food.fdcId||food.description} variant="outlined" sx={{p:1}}><Typography variant="body2" fontWeight={700}>{food.description}</Typography><Typography variant="caption" color="text.secondary">{food.brandOwner||food.dataType||'USDA'}</Typography><Typography variant="body2" mt={.4}>{Math.round(Number(food.nutrients?.calories||0))} kcal · P {Number(food.nutrients?.proteinG||0).toFixed(1)}g · C {Number(food.nutrients?.carbsG||0).toFixed(1)}g · G {Number(food.nutrients?.fatG||0).toFixed(1)}g</Typography><Typography variant="caption" color="text.secondary">Fibra {Number(food.nutrients?.fiberG||0).toFixed(1)}g · Na {Math.round(Number(food.nutrients?.sodiumMg||0))}mg · K {Math.round(Number(food.nutrients?.potassiumMg||0))}mg</Typography></Paper>):<CgEmptyState title="Sin resultados USDA" description="Busca un alimento real para revisar energía, proteína y micronutrientes."/>}</Stack>
    </Paper>
  </Stack>;
}

export function FitnessClientTransferTool({members,Toast,onDataChanged}){
  const [status,setStatus]=useState('');
  const importFile=async(event)=>{
    const file=event.target.files?.[0];
    if(!file)return;
    try{
      const parsed=FitnessClientTransferService.parse(await file.text());
      if(!parsed.length)return notify(Toast,'La plantilla no contiene clientes válidos.','warning');
      const created=[];
      for(const payload of parsed)created.push(await GymVerticalService.createMember(payload));
      setStatus(`${created.length} cliente(s) importados correctamente.`);
      notify(Toast,`${created.length} clientes importados.`,'success');
      await onDataChanged?.();
    }catch(error){notify(Toast,`No se pudo importar: ${error.message}`,'error');}
    finally{event.target.value='';}
  };
  return <Paper className="cg-client-transfer" variant="outlined" sx={{p:1.5}}>
    <Typography variant="h6">Importar / exportar clientes</Typography><Typography variant="caption" color="text.secondary">CSV compatible con Excel para altas masivas y respaldo operativo.</Typography>
    <Stack direction="row" flexWrap="wrap" gap={.8} mt={1.2}>
      <CgButton variant="outlined" onClick={()=>FitnessClientTransferService.download('plantilla-clientes-gimnasio.csv',FitnessClientTransferService.template())}>Descargar plantilla</CgButton>
      <CgButton variant="outlined" onClick={()=>FitnessClientTransferService.download('clientes-gimnasio.csv',FitnessClientTransferService.export(members))}>Exportar {members.length} clientes</CgButton>
      <CgButton component="label">Importar lista<input hidden type="file" accept=".csv,text/csv" onChange={(event)=>void importFile(event)}/></CgButton>
    </Stack>
    {status?<Typography variant="caption" color="success.main" display="block" mt={1}>{status}</Typography>:null}
  </Paper>;
}

export function FitnessProductivityTools({tab,members,Toast,onDataChanged}){
  if(tab==='members')return <FitnessClientTransferTool members={members} Toast={Toast} onDataChanged={onDataChanged}/>;
  if(tab==='routines')return <FitnessRoutineQuickTool members={members} Toast={Toast} onDataChanged={onDataChanged}/>;
  if(tab==='nutrition')return <FitnessNutritionQuickTool members={members} Toast={Toast} onDataChanged={onDataChanged}/>;
  return null;
}
