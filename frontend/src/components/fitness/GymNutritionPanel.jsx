import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { CgButton, CgSelect, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { FitnessProductivityTools } from './FitnessProductivityTools.jsx';
import { IngredientLibraryPanel } from './IngredientLibraryPanel.jsx';
import { CompleteMealPlanBuilder } from './CompleteMealPlanBuilder.jsx';
import { NutritionRecipeLibrary } from './NutritionRecipeLibrary.jsx';
import { NutritionShoppingListPanel } from './NutritionShoppingListPanel.jsx';
import { NutritionRulesPanel } from './NutritionRulesPanel.jsx';
import { IngredientNutritionProfilePanel } from './IngredientNutritionProfilePanel.jsx';
import { NutritionSnapshotPanel } from './NutritionSnapshotPanel.jsx';
import { IntegratedAdherencePanel } from './IntegratedAdherencePanel.jsx';
import { RecordList, Section } from './GymWorkspacePrimitives.jsx';

export function GymNutritionPanel({
  members, Toast, loadAll, selectedMemberId, ingredients, setIngredients,
  nutritionRecipes, nutritionForm, setNutritionForm, memberOpts, trainerOpts,
  submitNutrition, selectedMember, nutrition, loadMemberData
}){
  const beginVersion=(plan)=>{
    // Copy editable values, never share mutable meal state with the frozen
    // source revision. The server chooses the planKey/version atomically.
    setNutritionForm({
      memberId:plan.memberId,trainerId:plan.trainerId||'',supersedesId:plan.id,
      name:plan.name||'',goal:plan.goal||'',durationDays:Number(plan.durationDays||7),
      targetCalories:plan.targetCalories==null?'':String(plan.targetCalories),
      waterMl:plan.waterMl==null?'':String(plan.waterMl),
      startsAt:plan.startsAt?String(plan.startsAt).slice(0,10):'',
      endsAt:plan.endsAt?String(plan.endsAt).slice(0,10):'',
      meals:JSON.parse(JSON.stringify(Array.isArray(plan.meals)?plan.meals:[]))
    });
  };
  const latestByKey=nutrition.reduce((map,item)=>{
    const key=item.planKey||item.id;
    map.set(key,Math.max(map.get(key)||0,Number(item.version||1)));
    return map;
  },new Map());
  const memberTracking=<CgSelect label="Cliente de seguimiento" value={selectedMemberId} onChange={(e)=>void loadMemberData(e.target.value)} options={memberOpts}/>;
  return <Stack gap={1.25}>
    <FitnessProductivityTools tab="nutrition" members={members} Toast={Toast} onDataChanged={(id)=>loadAll({silent:true,memberId:id||selectedMemberId})}/>
    <IngredientLibraryPanel items={ingredients} onItemsChange={setIngredients} Toast={Toast}/>
    <IngredientNutritionProfilePanel ingredients={ingredients} Toast={Toast}/>
    <NutritionRulesPanel memberId={selectedMemberId} ingredients={ingredients} Toast={Toast}/>
    <NutritionRecipeLibrary ingredients={ingredients} recipes={nutritionRecipes} Toast={Toast} onChanged={()=>loadAll({silent:true,memberId:selectedMemberId})}/>
    <Box className="cg-gym-v1124-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(0,1.35fr) minmax(320px,.65fr)'},gap:1.25}}>
      <Section title={nutritionForm.supersedesId?'Nueva versión del plan alimenticio':'Plan alimenticio completo'} description="7/14/28 días, recetas, porciones, preparación y alternativas explícitas.">
        <Box component="form" onSubmit={submitNutrition}><Stack gap={1}>
          <CgSelect label="Cliente" value={nutritionForm.memberId} onChange={(e)=>setNutritionForm({...nutritionForm,memberId:e.target.value})} options={memberOpts}/>
          <CgSelect label="Responsable" value={nutritionForm.trainerId} onChange={(e)=>setNutritionForm({...nutritionForm,trainerId:e.target.value})} options={trainerOpts}/>
          <CgTextField size="small" label="Nombre" required value={nutritionForm.name} onChange={(e)=>setNutritionForm({...nutritionForm,name:e.target.value})}/>
          <CgTextField size="small" label="Objetivo" value={nutritionForm.goal} onChange={(e)=>setNutritionForm({...nutritionForm,goal:e.target.value})}/>
          <Box className="cg-gym-v1124-fields" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:1}}>
            <CgTextField size="small" label="Calorías orientativas" type="number" value={nutritionForm.targetCalories} onChange={(e)=>setNutritionForm({...nutritionForm,targetCalories:e.target.value})}/>
            <CgTextField size="small" label="Agua ml" type="number" value={nutritionForm.waterMl} onChange={(e)=>setNutritionForm({...nutritionForm,waterMl:e.target.value})}/>
            <CgTextField size="small" label="Inicio del plan" type="date" slotProps={{inputLabel:{shrink:true}}} value={nutritionForm.startsAt} onChange={(e)=>setNutritionForm({...nutritionForm,startsAt:e.target.value})}/>
            <CgTextField size="small" label="Fin del plan" type="date" slotProps={{inputLabel:{shrink:true}}} value={nutritionForm.endsAt} onChange={(e)=>setNutritionForm({...nutritionForm,endsAt:e.target.value})}/>
          </Box>
          <CompleteMealPlanBuilder durationDays={nutritionForm.durationDays} onDurationChange={(durationDays)=>setNutritionForm({...nutritionForm,durationDays,meals:(nutritionForm.meals||[]).filter((meal)=>Number(meal.dayIndex)<=durationDays)})} value={nutritionForm.meals} onChange={(meals)=>setNutritionForm({...nutritionForm,meals})} ingredients={ingredients} recipes={nutritionRecipes} disabled={!members.length}/>
          <Stack direction={{xs:'column',sm:'row'}} gap={.8}><CgButton type="submit" disabled={!members.length||!nutritionForm.meals.length}>{nutritionForm.supersedesId?'Guardar nueva versión':'Crear plan alimenticio'}</CgButton>{nutritionForm.supersedesId?<CgButton type="button" variant="outlined" onClick={()=>setNutritionForm({...nutritionForm,supersedesId:null})}>Cancelar nueva versión</CgButton>:null}</Stack>
        </Stack></Box>
      </Section>
      <Section title="Planes activos" description={selectedMember?`Seguimiento de ${selectedMember.fullName}`:'Selecciona un cliente.'}>{memberTracking}<Box mt={1}><RecordList items={nutrition} empty="No hay planes nutricionales del cliente seleccionado" assetKey="nutrition" render={(item)=><Stack direction="row" justifyContent="space-between" gap={1}><Box><Typography variant="body2" fontWeight={700}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.goal||'Plan nutricional'} · {item.durationDays||7} días · {Array.isArray(item.meals)?item.meals.length:0} comidas</Typography></Box><Stack direction="row" alignItems="center" gap={.6}><CgStatusChip label={`v${item.version||1}`} tone="info"/><CgStatusChip label={item.active===false?'Histórico':'Activo'} tone={item.active===false?'warning':'success'}/><CgButton type="button" size="small" variant="outlined" disabled={Number(item.version||1)!==latestByKey.get(item.planKey||item.id)} onClick={()=>beginVersion(item)}>Nueva versión</CgButton></Stack></Stack>}/></Box></Section>
    </Box>
    <NutritionShoppingListPanel plans={nutrition}/>
    <NutritionSnapshotPanel plans={nutrition}/>
    <IntegratedAdherencePanel memberId={selectedMemberId} Toast={Toast}/>
  </Stack>;
}
