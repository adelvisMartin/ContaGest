import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { CgButton, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { FitnessProductivityTools } from './FitnessProductivityTools.jsx';
import { RoutineBuilder } from './RoutineBuilder.jsx';
import { ExerciseLibraryPanel } from './ExerciseLibraryPanel.jsx';
import { WeeklyRoutineSchedule } from './WeeklyRoutineSchedule.jsx';
import { PeriodizationPanel } from './PeriodizationPanel.jsx';
import { WorkoutSessionPanel } from './WorkoutSessionPanel.jsx';
import { PerformanceHistoryPanel } from './PerformanceHistoryPanel.jsx';
import { FITNESS_TRAINING_MODES, fitnessTrainingMode, fitnessTrainingModeLabel } from '../../data/fitnessTrainingModes.js';
import { RecordList, Section } from './GymWorkspacePrimitives.jsx';

export function GymTrainingPanel({
  members, Toast, loadAll, selectedMemberId, exerciseLibrary, setExerciseLibrary,
  routines, routineForm, setRoutineForm, memberOpts, trainerOpts, submitRoutine,
  selectedMember, loadMemberData
}){
  const memberTracking=<CgSelect label="Cliente de seguimiento" value={selectedMemberId} onChange={(e)=>void loadMemberData(e.target.value)} options={memberOpts}/>;
  return <Stack gap={1.25}><FitnessProductivityTools tab="routines" members={members} Toast={Toast} onDataChanged={(id)=>loadAll({silent:true,memberId:id||selectedMemberId})}/><ExerciseLibraryPanel items={exerciseLibrary} onItemsChange={setExerciseLibrary} Toast={Toast}/><PeriodizationPanel routines={routines} Toast={Toast}/><WorkoutSessionPanel routines={routines} memberId={selectedMemberId} Toast={Toast}/><PerformanceHistoryPanel memberId={selectedMemberId}/><Box className="cg-gym-v1124-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'minmax(0,1.35fr) minmax(320px,.65fr)'},gap:1.25}}>
    <Section title="Constructor de rutina" description="Construye cada ejercicio con campos estructurados; sin formatos de texto ni separadores."><Box component="form" onSubmit={submitRoutine}><Stack gap={1}><CgSelect label="Cliente" value={routineForm.memberId} onChange={(e)=>setRoutineForm({...routineForm,memberId:e.target.value})} options={memberOpts}/><CgSelect label="Instructor" value={routineForm.trainerId} onChange={(e)=>setRoutineForm({...routineForm,trainerId:e.target.value})} options={trainerOpts}/><CgTextField size="small" label="Nombre" required value={routineForm.name} onChange={(e)=>setRoutineForm({...routineForm,name:e.target.value})}/><CgTextField size="small" label="Objetivo" value={routineForm.goal} onChange={(e)=>setRoutineForm({...routineForm,goal:e.target.value})}/><CgSelect label="Nivel" value={routineForm.level} onChange={(e)=>setRoutineForm({...routineForm,level:e.target.value})} options={['beginner','intermediate','advanced'].map((value)=>({value,label:value}))}/><CgSelect label="Modo de entrenamiento" value={routineForm.trainingMode} onChange={(e)=>setRoutineForm({...routineForm,trainingMode:e.target.value})} options={FITNESS_TRAINING_MODES.map(({value,label})=>({value,label}))}/>{fitnessTrainingMode(routineForm.trainingMode)?<CgState severity="info" title={fitnessTrainingModeLabel(routineForm.trainingMode)}>{fitnessTrainingMode(routineForm.trainingMode).description} Foco: {fitnessTrainingMode(routineForm.trainingMode).focus}. Rangos orientativos: {fitnessTrainingMode(routineForm.trainingMode).typicalReps} reps · {fitnessTrainingMode(routineForm.trainingMode).typicalRest} descanso. No modifica automáticamente series, repeticiones ni carga.</CgState>:null}<RoutineBuilder value={routineForm.exercises} onChange={(exercises)=>setRoutineForm({...routineForm,exercises})} disabled={!members.length} catalog={exerciseLibrary}/><WeeklyRoutineSchedule exercises={routineForm.exercises}/><CgButton type="submit" disabled={!members.length||!routineForm.exercises.length}>Crear rutina</CgButton></Stack></Box></Section>
    <Section title="Rutinas activas" description={selectedMember?`Planes de ${selectedMember.fullName}`:'Selecciona un cliente.'}>{memberTracking}<Box mt={1}><RecordList items={routines} empty="No hay rutinas del cliente seleccionado" render={(item)=><Stack direction="row" justifyContent="space-between"><Box><Typography variant="body2" fontWeight={700}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.goal||'Objetivo general'} · {item.level||''} · {fitnessTrainingModeLabel(item.trainingMode)} · {Array.isArray(item.exercises)?item.exercises.length:0} ejercicios</Typography></Box><CgStatusChip label={item.active===false?'Inactiva':'Activa'} tone={item.active===false?'warning':'success'}/></Stack>}/></Box></Section>
  </Box></Stack>;
}
