import React, { useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Checkbox, FormControlLabel, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import {
  CgButton, CgPageHeader, CgProvider, CgSelect, CgState, CgStatusChip, CgTextField
} from '../components/ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../services/verticalService.js';
import { rows, object, localDate, localDateTime, amount, memberOptions, trainerOptions, planOptions, MONTHS } from '../components/fitness/gymWorkspace.helpers.js';
import { Metric, RecordList, Section } from '../components/fitness/GymWorkspacePrimitives.jsx';
import { GymTrainingPanel } from '../components/fitness/GymTrainingPanel.jsx';
import { GymNutritionPanel } from '../components/fitness/GymNutritionPanel.jsx';

function DateOfBirthFields({form,setForm}){
  return <Box className="cg-gym-v1124-fields" sx={{display:'grid',gridTemplateColumns:'minmax(0,.7fr) minmax(0,1fr) minmax(0,1fr)',gap:1}}>
    <CgTextField size="small" label="Día nacimiento" type="number" inputProps={{min:1,max:31}} value={form.birthDay} onChange={(e)=>setForm({...form,birthDay:e.target.value})}/>
    <CgSelect label="Mes nacimiento" value={form.birthMonth} onChange={(e)=>setForm({...form,birthMonth:e.target.value})} options={[{value:'',label:'Mes'},...MONTHS.map((label,index)=>({value:String(index+1).padStart(2,'0'),label}))]}/>
    <CgTextField size="small" label="Año nacimiento" type="number" inputProps={{min:1900,max:2100}} value={form.birthYear} onChange={(e)=>setForm({...form,birthYear:e.target.value})}/>
  </Box>;
}

function GymWorkspace({state,context}){
  const route=state.route||'gimnasio';
  const initial=state.gymVertical||{};
  const initialTab=route==='rutinas'?'routines':route==='nutricion'?'nutrition':initial.tab||'overview';
  const [tab,setTab]=useState(initialTab);
  const [summary,setSummary]=useState(object(initial.summary));
  const [members,setMembers]=useState(rows(initial.members));
  const [trainers,setTrainers]=useState(rows(initial.trainers));
  const [plans,setPlans]=useState(rows(initial.plans));
  const [classes,setClasses]=useState(rows(initial.classes));
  const [selectedMemberId,setSelectedMemberId]=useState(initial.selectedMemberId||rows(initial.members)[0]?.id||'');
  const [assessments,setAssessments]=useState(rows(initial.assessments));
  const [routines,setRoutines]=useState(rows(initial.routines));
  const [nutrition,setNutrition]=useState(rows(initial.nutrition));
  const [ingredients,setIngredients]=useState(rows(initial.ingredients));
  const [nutritionRecipes,setNutritionRecipes]=useState(rows(initial.nutritionRecipes));
  const [exerciseLibrary,setExerciseLibrary]=useState(rows(initial.exerciseLibrary));
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const Toast=context.Toast;

  const [memberForm,setMemberForm]=useState({memberCode:`GYM-${Date.now().toString().slice(-5)}`,fullName:'',email:'',phone:'',birthDay:'',birthMonth:'',birthYear:'',sex:'',goals:'',medicalNotes:''});
  const [trainerForm,setTrainerForm]=useState({fullName:'',phone:'',specialties:''});
  const [planForm,setPlanForm]=useState({name:'',durationDays:'30',price:'20',currency:'USD'});
  const [membershipForm,setMembershipForm]=useState({memberId:'',planId:'',startsAt:localDate(),autoRenew:false});
  const [checkInForm,setCheckInForm]=useState({memberId:'',method:'manual'});
  const [assessmentForm,setAssessmentForm]=useState({memberId:'',trainerId:'',weightKg:'',heightCm:'',bodyFatPct:'',muscleMassKg:'',notes:''});
  const [routineForm,setRoutineForm]=useState({memberId:'',trainerId:'',name:'',goal:'',level:'beginner',trainingMode:'hypertrophy',daysPerWeek:'3',exercises:[]});
  const [nutritionForm,setNutritionForm]=useState({memberId:'',trainerId:'',name:'',goal:'',durationDays:7,targetCalories:'',waterMl:'',startsAt:localDate(),endsAt:'',meals:[]});
  const [classForm,setClassForm]=useState({name:'',trainerId:'',startsAt:localDateTime(60),endsAt:localDateTime(120),capacity:'20',location:''});

  const notify=(message,tone='success')=>Toast?.show?.(message,tone);
  const selectedMember=useMemo(()=>members.find((item)=>item.id===selectedMemberId)||null,[members,selectedMemberId]);
  const highOccupancy=useMemo(()=>classes.filter((item)=>Number(item.capacity||0)>0&&Number(item.bookings||0)/Number(item.capacity)>=.8).length,[classes]);
  const memberOpts=useMemo(()=>memberOptions(members),[members]);
  const trainerOpts=useMemo(()=>trainerOptions(trainers),[trainers]);
  const planOpts=useMemo(()=>planOptions(plans),[plans]);

  async function loadMemberData(memberId){
    setSelectedMemberId(memberId);
    if(!memberId){setAssessments([]);setRoutines([]);setNutrition([]);return;}
    const [assessmentResponse,routineResponse,nutritionResponse]=await Promise.all([
      GymVerticalService.assessments(memberId),GymVerticalService.routines(memberId),GymVerticalService.nutrition(memberId)
    ]);
    setAssessments(rows(assessmentResponse));setRoutines(rows(routineResponse));setNutrition(rows(nutritionResponse));
  }

  async function loadAll({silent=false,memberId=selectedMemberId}={}){
    if(!silent)setLoading(true);setError('');
    try{
      const [summaryResponse,membersResponse,trainersResponse,plansResponse,classesResponse,exerciseResponse,ingredientResponse,recipeResponse]=await Promise.all([
        GymVerticalService.summary(),GymVerticalService.members(),GymVerticalService.trainers(),GymVerticalService.plans(),GymVerticalService.classes(),GymVerticalService.exercises({active:'true'}),GymVerticalService.ingredients({active:'true'}),GymVerticalService.recipes()
      ]);
      const nextMembers=rows(membersResponse),nextTrainers=rows(trainersResponse),nextPlans=rows(plansResponse),nextClasses=rows(classesResponse),nextExercises=rows(exerciseResponse),nextIngredients=rows(ingredientResponse),nextRecipes=rows(recipeResponse);
      setSummary(object(summaryResponse));setMembers(nextMembers);setTrainers(nextTrainers);setPlans(nextPlans);setClasses(nextClasses);setExerciseLibrary(nextExercises);setIngredients(nextIngredients);setNutritionRecipes(nextRecipes);
      const nextMemberId=memberId&&nextMembers.some((item)=>item.id===memberId)?memberId:(nextMembers[0]?.id||'');
      setMembershipForm((current)=>({...current,memberId:current.memberId||nextMembers[0]?.id||'',planId:current.planId||nextPlans[0]?.id||''}));
      setCheckInForm((current)=>({...current,memberId:current.memberId||nextMembers[0]?.id||''}));
      setAssessmentForm((current)=>({...current,memberId:current.memberId||nextMemberId}));
      setRoutineForm((current)=>({...current,memberId:current.memberId||nextMemberId}));
      setNutritionForm((current)=>({...current,memberId:current.memberId||nextMemberId}));
      setClassForm((current)=>({...current,trainerId:current.trainerId||nextTrainers[0]?.id||''}));
      await loadMemberData(nextMemberId);
      if(!silent)notify('Control de gimnasio actualizado.','success');
    }catch(cause){const message=cause?.message||'No se pudo actualizar gimnasio.';setError(message);if(!silent)notify(message,'error');}
    finally{if(!silent)setLoading(false);}
  }

  useEffect(()=>{void loadAll({silent:true});},[]);

  const selectTab=(next)=>{
    if(next==='routines'&&route!=='rutinas')return context.navigate('rutinas');
    if(next==='nutrition'&&route!=='nutricion')return context.navigate('nutricion');
    if((route==='rutinas'||route==='nutricion')&&!['routines','nutrition'].includes(next))return context.navigate('gimnasio',{tab:next});
    setTab(next);
  };

  async function execute(task,success,after){
    try{await task();notify(success,'success');await after?.();}
    catch(cause){notify(cause?.message||'No se pudo completar la operación.','error');}
  }

  const submitMember=(event)=>{event.preventDefault();void execute(async()=>{
    const anyDate=memberForm.birthDay||memberForm.birthMonth||memberForm.birthYear;
    if(anyDate&&!(memberForm.birthDay&&memberForm.birthMonth&&String(memberForm.birthYear).length===4))throw new Error('Completa día, mes y año de nacimiento o deja la fecha vacía.');
    const birthDate=anyDate?`${memberForm.birthYear}-${memberForm.birthMonth}-${String(memberForm.birthDay).padStart(2,'0')}`:null;
    await GymVerticalService.createMember({memberCode:memberForm.memberCode,fullName:memberForm.fullName,email:memberForm.email,phone:memberForm.phone,birthDate,sex:memberForm.sex,goals:String(memberForm.goals||'').split(',').map((item)=>item.trim()).filter(Boolean),medicalNotes:memberForm.medicalNotes,emergencyContact:{},status:'active'});
    setMemberForm({memberCode:`GYM-${Date.now().toString().slice(-5)}`,fullName:'',email:'',phone:'',birthDay:'',birthMonth:'',birthYear:'',sex:'',goals:'',medicalNotes:''});
  },'Cliente registrado.',()=>loadAll({silent:true}));};

  const submitTrainer=(event)=>{event.preventDefault();void execute(async()=>{
    await GymVerticalService.createTrainer({fullName:trainerForm.fullName,phone:trainerForm.phone,specialties:String(trainerForm.specialties||'').split(',').map((item)=>item.trim()).filter(Boolean),status:'active'});
    setTrainerForm({fullName:'',phone:'',specialties:''});
  },'Instructor registrado.',()=>loadAll({silent:true}));};

  const submitPlan=(event)=>{event.preventDefault();void execute(async()=>{
    await GymVerticalService.createPlan({name:planForm.name,durationDays:Number(planForm.durationDays||30),price:Number(planForm.price||0),currency:planForm.currency,active:true,metadata:{}});
    setPlanForm({name:'',durationDays:'30',price:'20',currency:'USD'});
  },'Plan guardado.',()=>loadAll({silent:true}));};

  const submitMembership=(event)=>{event.preventDefault();if(!membershipForm.memberId||!membershipForm.planId)return notify('Selecciona cliente y plan.','warning');void execute(
    ()=>GymVerticalService.createMembership({...membershipForm,balance:0}),'Membresía activada.',()=>loadAll({silent:true})
  );};

  const submitCheckIn=(event)=>{event.preventDefault();if(!checkInForm.memberId)return notify('Selecciona un cliente.','warning');void execute(
    ()=>GymVerticalService.checkIn({...checkInForm,device:navigator.userAgentData?.platform||navigator.platform||'web'}),'Entrada procesada.',()=>loadAll({silent:true})
  );};

  const submitAssessment=(event)=>{event.preventDefault();if(!assessmentForm.memberId)return notify('Selecciona un cliente.','warning');void execute(
    ()=>GymVerticalService.createAssessment(assessmentForm),'Evaluación corporal guardada.',()=>loadAll({silent:true,memberId:assessmentForm.memberId})
  );};

  const submitRoutine=(event)=>{event.preventDefault();if(!routineForm.memberId)return notify('Selecciona un cliente.','warning');if(!routineForm.exercises.length)return notify('Agrega al menos un ejercicio.','warning');void execute(async()=>{
    const exercises=routineForm.exercises.map((exercise,index)=>({
      exerciseId:exercise.exerciseId||null,
      exerciseName:String(exercise.exerciseName||'').trim(),
      muscleGroup:String(exercise.muscleGroup||'').trim(),
      equipment:String(exercise.equipment||'').trim(),
      instructions:String(exercise.instructions||'').trim(),
      dayOfWeek:Number(exercise.dayOfWeek||1),
      sortOrder:index+1,
      sets:Number(exercise.sets||3),
      reps:String(exercise.reps||'10').trim(),
      loadKg:exercise.loadKg===''||exercise.loadKg==null?null:Number(exercise.loadKg),
      restSeconds:Number(exercise.restSeconds||0),
      tempo:String(exercise.tempo||'').trim(),
      notes:String(exercise.notes||'').trim(),
      intensityTechnique:String(exercise.intensityTechnique||'standard'),
      techniqueConfig:exercise.intensityTechnique&&exercise.intensityTechnique!=='standard'?{
        rounds:exercise.techniqueConfig?.rounds==null?null:Number(exercise.techniqueConfig.rounds),
        intraRestSeconds:exercise.techniqueConfig?.intraRestSeconds==null?null:Number(exercise.techniqueConfig.intraRestSeconds),
        loadDropPct:exercise.techniqueConfig?.loadDropPct==null?null:Number(exercise.techniqueConfig.loadDropPct),
        groupKey:String(exercise.techniqueConfig?.groupKey||'').trim()||null,
        holdSeconds:exercise.techniqueConfig?.holdSeconds==null?null:Number(exercise.techniqueConfig.holdSeconds),
        techniqueNotes:String(exercise.techniqueConfig?.techniqueNotes||'').trim()||null
      }:{},
      progressionStrategy:String(exercise.progressionStrategy||'manual'),
      progressionConfig:exercise.progressionStrategy&&exercise.progressionStrategy!=='manual'?{
        repRangeMin:exercise.progressionConfig?.repRangeMin==null?null:Number(exercise.progressionConfig.repRangeMin),
        repRangeMax:exercise.progressionConfig?.repRangeMax==null?null:Number(exercise.progressionConfig.repRangeMax),
        repIncrement:exercise.progressionConfig?.repIncrement==null?null:Number(exercise.progressionConfig.repIncrement),
        loadIncrementKg:exercise.progressionConfig?.loadIncrementKg==null?null:Number(exercise.progressionConfig.loadIncrementKg),
        targetRir:exercise.progressionConfig?.targetRir==null?null:Number(exercise.progressionConfig.targetRir),
        targetRpe:exercise.progressionConfig?.targetRpe==null?null:Number(exercise.progressionConfig.targetRpe),
        oneRepMaxKg:exercise.progressionConfig?.oneRepMaxKg==null?null:Number(exercise.progressionConfig.oneRepMaxKg),
        percent1Rm:exercise.progressionConfig?.percent1Rm==null?null:Number(exercise.progressionConfig.percent1Rm),
        stallAfter:exercise.progressionConfig?.stallAfter==null?null:Number(exercise.progressionConfig.stallAfter),
        resetPct:exercise.progressionConfig?.resetPct==null?null:Number(exercise.progressionConfig.resetPct)
      }:{}
    }));
    if(exercises.some((exercise)=>!exercise.exerciseName))throw new Error('Todos los ejercicios necesitan nombre.');
    const scheduledDays=new Set(routineForm.exercises.map((exercise)=>Number(exercise.dayOfWeek||1)));
    await GymVerticalService.createRoutine({...routineForm,trainingMode:routineForm.trainingMode,daysPerWeek:scheduledDays.length,exercises});
    setRoutineForm((current)=>({...current,name:'',goal:'',level:'beginner',trainingMode:'hypertrophy',daysPerWeek:'3',exercises:[]}));
  },'Rutina creada.',()=>loadAll({silent:true,memberId:routineForm.memberId}));};

  const submitNutrition=(event)=>{event.preventDefault();if(!nutritionForm.memberId)return notify('Selecciona un cliente.','warning');void execute(async()=>{
    const durationDays=Number(nutritionForm.durationDays||7);
    const meals=(nutritionForm.meals||[]).map((meal)=>({
      dayIndex:Number(meal.dayIndex),
      dayOfWeek:Number(meal.dayOfWeek),
      sortOrder:Number(meal.sortOrder),
      mealType:String(meal.mealType||'').trim(),
      plannedAt:String(meal.plannedAt||'').trim()||null,
      recipeId:String(meal.recipeId||'').trim()||null,
      servings:Number(meal.servings||1),
      preparation:String(meal.preparation||'').trim()||null,
      alternatives:(meal.alternatives||[]).map((item)=>({recipeId:String(item.recipeId||'').trim(),label:String(item.label||'').trim()||null,servings:Number(item.servings||1)})).filter((item)=>item.recipeId),
      calories:null,
      proteinG:null,
      carbsG:null,
      fatG:null,
      notes:String(meal.notes||'').trim()||null,
      items:(meal.items||[]).map((item)=>({
        ingredientId:String(item.ingredientId||'').trim(),
        quantity:Number(item.quantity),
        unit:String(item.unit||'').trim(),
        notes:String(item.notes||'').trim()||null
      }))
    }));
    if(![7,14,28].includes(durationDays))throw new Error('La duración debe ser 7, 14 o 28 días.');
    if(!meals.length)throw new Error('Agrega al menos una comida al plan.');
    if(meals.some((meal)=>!meal.mealType||!Number.isInteger(meal.dayIndex)||meal.dayIndex<1||meal.dayIndex>durationDays||!Number.isInteger(meal.sortOrder)||meal.sortOrder<1))throw new Error('Todas las comidas necesitan día real, posición y tipo válidos.');
    if(meals.some((meal)=>!meal.recipeId&&!meal.items.length))throw new Error('Cada comida necesita una receta o ingredientes directos.');
    if(meals.some((meal)=>meal.items.some((item)=>!item.ingredientId||!Number.isFinite(item.quantity)||item.quantity<=0||!item.unit)))throw new Error('Cada ingrediente necesita identidad, cantidad positiva y unidad.');
    await GymVerticalService.createNutrition({...nutritionForm,durationDays,targetCalories:Number(nutritionForm.targetCalories||0)||null,waterMl:Number(nutritionForm.waterMl||0)||null,meals});
    setNutritionForm((current)=>({...current,name:'',goal:'',durationDays:7,targetCalories:'',waterMl:'',startsAt:localDate(),endsAt:'',meals:[]}));
  },'Plan alimenticio completo creado.',()=>loadAll({silent:true,memberId:nutritionForm.memberId}));};

  const submitClass=(event)=>{event.preventDefault();if(!classForm.trainerId)return notify('Selecciona un instructor.','warning');void execute(
    ()=>GymVerticalService.createClass({...classForm,capacity:Number(classForm.capacity||20)}),'Clase programada.',()=>loadAll({silent:true})
  );};

  const panelMembers=<Box className="cg-gym-v1124-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:1.25}}>
    <Stack gap={1.25}><FitnessProductivityTools tab="members" members={members} Toast={Toast} onDataChanged={()=>loadAll({silent:true})}/><Section title="Nuevo cliente" description="Alta operativa sin salir del módulo."><Box component="form" onSubmit={submitMember}><Stack gap={1}>
      <Box className="cg-gym-v1124-fields" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 2fr'},gap:1}}><CgTextField size="small" label="Código" value={memberForm.memberCode} onChange={(e)=>setMemberForm({...memberForm,memberCode:e.target.value})}/><CgTextField size="small" label="Nombre completo" required value={memberForm.fullName} onChange={(e)=>setMemberForm({...memberForm,fullName:e.target.value})}/></Box>
      <Box className="cg-gym-v1124-fields" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:1}}><CgTextField size="small" label="Correo" type="email" value={memberForm.email} onChange={(e)=>setMemberForm({...memberForm,email:e.target.value})}/><CgTextField size="small" label="Teléfono" value={memberForm.phone} onChange={(e)=>setMemberForm({...memberForm,phone:e.target.value})}/></Box>
      <DateOfBirthFields form={memberForm} setForm={setMemberForm}/><CgSelect label="Sexo" value={memberForm.sex} onChange={(e)=>setMemberForm({...memberForm,sex:e.target.value})} options={[['','No indicado'],['Femenino','Femenino'],['Masculino','Masculino'],['Otro','Otro']].map(([value,label])=>({value,label}))}/>
      <CgTextField size="small" label="Objetivos, separados por coma" value={memberForm.goals} onChange={(e)=>setMemberForm({...memberForm,goals:e.target.value})}/><CgTextField size="small" multiline minRows={2} label="Observaciones médicas" value={memberForm.medicalNotes} onChange={(e)=>setMemberForm({...memberForm,medicalNotes:e.target.value})}/><CgButton type="submit">Guardar cliente</CgButton>
    </Stack></Box></Section></Stack>
    <Section title="Clientes registrados" description="Selecciona uno para abrir su seguimiento."><RecordList items={members} empty="Todavía no hay clientes" render={(member)=><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Box><Typography variant="body2" fontWeight={700}>{member.fullName}</Typography><Typography variant="caption" color="text.secondary">{member.memberCode||'Sin código'} · {member.phone||member.email||'Sin contacto'}</Typography></Box><CgButton variant="outlined" size="small" onClick={()=>{void loadMemberData(member.id);setTab('assessments');}}>Abrir</CgButton></Stack>}/></Section>
  </Box>;

  const panelTrainers=<Box className="cg-gym-v1124-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:1.25}}>
    <Section title="Nuevo instructor" description="Responsable para clases, rutinas y evaluaciones."><Box component="form" onSubmit={submitTrainer}><Stack gap={1}><CgTextField size="small" label="Nombre completo" required value={trainerForm.fullName} onChange={(e)=>setTrainerForm({...trainerForm,fullName:e.target.value})}/><CgTextField size="small" label="Teléfono" value={trainerForm.phone} onChange={(e)=>setTrainerForm({...trainerForm,phone:e.target.value})}/><CgTextField size="small" label="Especialidades" value={trainerForm.specialties} onChange={(e)=>setTrainerForm({...trainerForm,specialties:e.target.value})}/><CgButton type="submit">Guardar instructor</CgButton></Stack></Box></Section>
    <Section title="Equipo de instructores" description="Personal disponible para asignaciones."><RecordList items={trainers} empty="Todavía no hay instructores" render={(trainer)=><Stack direction="row" justifyContent="space-between" gap={1}><Box><Typography variant="body2" fontWeight={700}>{trainer.fullName}</Typography><Typography variant="caption" color="text.secondary">{(trainer.specialties||[]).join(', ')||trainer.phone||'Instructor'}</Typography></Box><CgStatusChip label={trainer.status||'active'} tone="success"/></Stack>}/></Section>
  </Box>;

  const memberTracking=<CgSelect label="Cliente de seguimiento" value={selectedMemberId} onChange={(e)=>void loadMemberData(e.target.value)} options={memberOpts}/>;

  const panelAssessments=<Box className="cg-gym-v1124-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:1.25}}>
    <Section title="Nueva evaluación" description="Mediciones y composición corporal."><Box component="form" onSubmit={submitAssessment}><Stack gap={1}><CgSelect label="Cliente" value={assessmentForm.memberId} onChange={(e)=>setAssessmentForm({...assessmentForm,memberId:e.target.value})} options={memberOpts}/><CgSelect label="Instructor" value={assessmentForm.trainerId} onChange={(e)=>setAssessmentForm({...assessmentForm,trainerId:e.target.value})} options={trainerOpts}/><Box className="cg-gym-v1124-fields" sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1}}><CgTextField size="small" label="Peso kg" type="number" value={assessmentForm.weightKg} onChange={(e)=>setAssessmentForm({...assessmentForm,weightKg:e.target.value})}/><CgTextField size="small" label="Altura cm" type="number" value={assessmentForm.heightCm} onChange={(e)=>setAssessmentForm({...assessmentForm,heightCm:e.target.value})}/><CgTextField size="small" label="Grasa %" type="number" value={assessmentForm.bodyFatPct} onChange={(e)=>setAssessmentForm({...assessmentForm,bodyFatPct:e.target.value})}/><CgTextField size="small" label="Músculo kg" type="number" value={assessmentForm.muscleMassKg} onChange={(e)=>setAssessmentForm({...assessmentForm,muscleMassKg:e.target.value})}/></Box><CgTextField size="small" multiline minRows={2} label="Observaciones" value={assessmentForm.notes} onChange={(e)=>setAssessmentForm({...assessmentForm,notes:e.target.value})}/><CgButton type="submit" disabled={!members.length}>Guardar evaluación</CgButton></Stack></Box></Section>
    <Section title="Evolución" description={selectedMember?`Historial de ${selectedMember.fullName}`:'Selecciona un cliente.'}>{memberTracking}<Box mt={1}><RecordList items={assessments} empty="No hay evaluaciones del cliente seleccionado" render={(item)=><Stack direction="row" justifyContent="space-between"><Box><Typography variant="body2" fontWeight={700}>{new Date(item.measuredAt||item.createdAt).toLocaleDateString('es-VE')}</Typography><Typography variant="caption" color="text.secondary">Peso {item.weightKg??'—'} kg · Grasa {item.bodyFatPct??'—'}% · Músculo {item.muscleMassKg??'—'} kg</Typography></Box><CgStatusChip label={`IMC ${item.bmi??'—'}`} tone="info"/></Stack>}/></Box></Section>
  </Box>;

  const panelRoutines=<GymTrainingPanel
    members={members}
    Toast={Toast}
    loadAll={loadAll}
    selectedMemberId={selectedMemberId}
    exerciseLibrary={exerciseLibrary}
    setExerciseLibrary={setExerciseLibrary}
    routines={routines}
    routineForm={routineForm}
    setRoutineForm={setRoutineForm}
    memberOpts={memberOpts}
    trainerOpts={trainerOpts}
    submitRoutine={submitRoutine}
    selectedMember={selectedMember}
    loadMemberData={loadMemberData}
  />;

  const panelNutrition=<GymNutritionPanel
    members={members}
    Toast={Toast}
    loadAll={loadAll}
    selectedMemberId={selectedMemberId}
    ingredients={ingredients}
    setIngredients={setIngredients}
    nutritionRecipes={nutritionRecipes}
    nutritionForm={nutritionForm}
    setNutritionForm={setNutritionForm}
    memberOpts={memberOpts}
    trainerOpts={trainerOpts}
    submitNutrition={submitNutrition}
    selectedMember={selectedMember}
    nutrition={nutrition}
    loadMemberData={loadMemberData}
  />;

  const readyForClass=members.length>0&&trainers.length>0;
  const panelClasses=<Box className="cg-gym-v1124-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:1.25}}>
    <Section title="Nueva clase" description="Programa capacidad, instructor y sala.">{!readyForClass?<CgState severity="warning" title="Configuración incompleta">{!members.length?'Falta registrar al menos un cliente. ':''}{!trainers.length?'Falta registrar al menos un instructor.':''}</CgState>:null}<Box component="form" onSubmit={submitClass} sx={{mt:1}}><Stack gap={1}><CgTextField size="small" label="Nombre de la clase" required value={classForm.name} onChange={(e)=>setClassForm({...classForm,name:e.target.value})}/><CgSelect label="Instructor" value={classForm.trainerId} onChange={(e)=>setClassForm({...classForm,trainerId:e.target.value})} options={trainerOpts}/><Box className="cg-gym-v1124-fields" sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1}}><CgTextField size="small" label="Inicio" type="datetime-local" slotProps={{inputLabel:{shrink:true}}} value={classForm.startsAt} onChange={(e)=>setClassForm({...classForm,startsAt:e.target.value})}/><CgTextField size="small" label="Fin" type="datetime-local" slotProps={{inputLabel:{shrink:true}}} value={classForm.endsAt} onChange={(e)=>setClassForm({...classForm,endsAt:e.target.value})}/><CgTextField size="small" label="Cupo" type="number" value={classForm.capacity} onChange={(e)=>setClassForm({...classForm,capacity:e.target.value})}/><CgTextField size="small" label="Sala / sede" value={classForm.location} onChange={(e)=>setClassForm({...classForm,location:e.target.value})}/></Box><CgButton type="submit" disabled={!readyForClass}>Programar clase</CgButton></Stack></Box></Section>
    <Section title="Próximas clases" description="Calendario operativo."><RecordList items={classes} empty="No hay clases próximas" render={(item)=><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Box><Typography variant="body2" fontWeight={700}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{new Date(item.startsAt).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})} · {item.trainerName||'Sin instructor'} · {item.location||'Sin sala'}</Typography></Box><CgStatusChip label={`${Number(item.bookings||0)} / ${Number(item.capacity||0)}`} tone="info"/></Stack>}/></Section>
  </Box>;

  const overview=<Box className="cg-gym-v1124-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:1.25}}>
    <Section title="Preparación operativa" description="Clientes, instructores y planes disponibles en este módulo."><Box className="cg-gym-v1124-status" sx={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:1}}><Metric label="Clientes" value={members.length}/><Metric label="Instructores" value={trainers.length}/><Metric label="Planes" value={plans.length}/></Box>{!members.length||!trainers.length?<CgState severity="info" title="Completa la configuración básica">{!members.length?'Registra al menos un cliente. ':''}{!trainers.length?'Registra al menos un instructor.':''}</CgState>:null}</Section>
    <Section title="Registrar entrada" description="Control de acceso de clientes ya creados."><Box component="form" onSubmit={submitCheckIn}><Stack gap={1}><CgSelect label="Cliente" value={checkInForm.memberId} onChange={(e)=>setCheckInForm({...checkInForm,memberId:e.target.value})} options={memberOpts}/><CgSelect label="Método" value={checkInForm.method} onChange={(e)=>setCheckInForm({...checkInForm,method:e.target.value})} options={['manual','qr','barcode','nfc'].map((value)=>({value,label:value.toUpperCase()}))}/><CgButton type="submit" disabled={!members.length}>Registrar entrada</CgButton></Stack></Box></Section>
    <Section title="Nuevo plan comercial" description="Configura una membresía antes de asignarla."><Box component="form" onSubmit={submitPlan}><Stack gap={1}><CgTextField size="small" label="Nombre" required value={planForm.name} onChange={(e)=>setPlanForm({...planForm,name:e.target.value})}/><Box className="cg-gym-v1124-fields" sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1}}><CgTextField size="small" label="Duración (días)" type="number" value={planForm.durationDays} onChange={(e)=>setPlanForm({...planForm,durationDays:e.target.value})}/><CgTextField size="small" label="Precio" type="number" value={planForm.price} onChange={(e)=>setPlanForm({...planForm,price:e.target.value})}/></Box><CgSelect label="Moneda" value={planForm.currency} onChange={(e)=>setPlanForm({...planForm,currency:e.target.value})} options={['USD','VES'].map((value)=>({value,label:value}))}/><CgButton type="submit">Guardar plan</CgButton></Stack></Box><Box mt={1}><RecordList items={plans} empty="No hay planes comerciales configurados" render={(plan)=><Stack direction="row" justifyContent="space-between"><Box><Typography variant="body2" fontWeight={700}>{plan.name}</Typography><Typography variant="caption" color="text.secondary">{Number(plan.durationDays||0)} días</Typography></Box><Typography variant="body2">{amount(plan.price,plan.currency)}</Typography></Stack>}/></Box></Section>
    <Section title="Activar membresía" description="Asigna un plan comercial a un cliente."><Box component="form" onSubmit={submitMembership}><Stack gap={1}><CgSelect label="Cliente" value={membershipForm.memberId} onChange={(e)=>setMembershipForm({...membershipForm,memberId:e.target.value})} options={memberOpts}/><CgSelect label="Plan" value={membershipForm.planId} onChange={(e)=>setMembershipForm({...membershipForm,planId:e.target.value})} options={planOpts}/><CgTextField size="small" label="Inicio" type="date" slotProps={{inputLabel:{shrink:true}}} value={membershipForm.startsAt} onChange={(e)=>setMembershipForm({...membershipForm,startsAt:e.target.value})}/><FormControlLabel control={<Checkbox checked={membershipForm.autoRenew} onChange={(e)=>setMembershipForm({...membershipForm,autoRenew:e.target.checked})}/>} label="Renovación automática"/><CgButton type="submit" disabled={!members.length||!plans.length}>Activar membresía</CgButton></Stack></Box></Section>
    <Section wide title="Próximas clases" description="Agenda disponible para operación diaria." action={<CgButton variant="outlined" onClick={()=>selectTab('classes')}>Programar clase</CgButton>}><RecordList items={classes} empty="No hay clases próximas" render={(item)=><Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between"><Box><Typography variant="body2" fontWeight={700}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{new Date(item.startsAt).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})} · {item.trainerName||'Sin instructor'}</Typography></Box><Typography variant="body2">{Number(item.bookings||0)} / {Number(item.capacity||0)}</Typography></Stack>}/></Section>
  </Box>;

  const panels={overview,members:panelMembers,trainers:panelTrainers,assessments:panelAssessments,routines:panelRoutines,nutrition:panelNutrition,classes:panelClasses};

  return <Stack className="cg-vertical-page cg-gym-page" gap={1.5} sx={{minWidth:0,maxWidth:'100%',width:'100%',overflowX:'hidden'}}>
    <CgPageHeader eyebrow="Vertical Fitness" title="Control integral de gimnasio" description="Clientes, instructores, membresías, asistencia, evaluaciones, rutinas, nutrición y clases desde una sola vista funcional." actions={<Stack direction="row" gap={.8} flexWrap="wrap" sx={{minWidth:0,maxWidth:'100%'}}><CgButton variant="outlined" onClick={()=>void loadAll()} disabled={loading}>Actualizar</CgButton><CgButton variant="outlined" onClick={()=>context.navigate('mensajes')}>Mensajes WhatsApp</CgButton></Stack>}/>
    {error?<CgState severity="error" title="No se pudo actualizar">{error}</CgState>:null}
    {loading?<CgState severity="info" title="Actualizando">Cargando operación del gimnasio.</CgState>:null}
    <Box className="cg-vertical-kpis cg-gym-kpis" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:1}}>
      <Metric label="Clientes activos" value={Number(summary.members?.active||0)} hint={`${Number(summary.members?.total||0)} registrados`} tone="primary"/>
      <Metric label="Membresías activas" value={Number(summary.memberships?.active||0)} hint={`${Number(summary.memberships?.expiring||0)} vencen en 7 días`} tone="success"/>
      <Metric label="Entradas de hoy" value={Number(summary.checkinsToday||0)} hint="Control de acceso" tone="info"/>
      <Metric label="Ingresos del mes" value={`$ ${Number(summary.revenueThisMonth||0).toLocaleString('es-VE',{minimumFractionDigits:2})}`} hint="Pagos confirmados" tone="secondary"/>
    </Box>
    <Section title="Coaching y retención" description="Señales operativas para seguimiento antes de perder una membresía."><Box className="cg-gym-v1124-grid cg-gym-retention-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(3,1fr)'},gap:1}}><Metric label="Renovaciones próximas" value={Number(summary.memberships?.expiring||0)}/><Metric label="Clases ≥ 80%" value={highOccupancy}/><Metric label="Clientes con coaching" value={Number(summary.members?.active||0)}/></Box></Section>
    <Paper className="cg-gym-v1124-tabs" variant="outlined" sx={{px:1,minWidth:0,maxWidth:'100%',overflow:'hidden'}}><Tabs sx={{minWidth:0,maxWidth:'100%'}} value={tab} onChange={(_e,value)=>selectTab(value)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>{[['overview','Operación'],['members','Clientes'],['trainers','Instructores'],['assessments','Evaluaciones'],['routines','Rutinas'],['nutrition','Nutrición'],['classes','Clases']].map(([value,label])=><Tab key={value} value={value} label={label}/>)}</Tabs></Paper>
    <Box data-gym-panel={tab}>{panels[tab]||overview}</Box>
  </Stack>;
}

let activeRoot=null;
export const GymManagementPage={
  render(){return '<section class="cg-page-stack"><div id="gymReactRoot"></div></section>';},
  mount(state,context){
    const host=document.getElementById('gymReactRoot');
    if(!host)return;
    try{activeRoot?.unmount();}catch{}
    activeRoot=createRoot(host);
    activeRoot.render(<CgProvider state={state}><GymWorkspace state={state} context={context}/></CgProvider>);
  }
};
