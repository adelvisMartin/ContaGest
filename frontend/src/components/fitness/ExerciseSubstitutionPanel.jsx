import React, { useEffect, useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';

const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const list=(value)=>String(value||'').split(',').map((item)=>item.trim()).filter(Boolean);

export function ExerciseSubstitutionPanel({routineExercise,selected,onSelect,disabled=false}){
  const [catalog,setCatalog]=useState([]);
  const [availableEquipment,setAvailableEquipment]=useState('');
  const [preferredExerciseId,setPreferredExerciseId]=useState('');
  const [excludedExerciseId,setExcludedExerciseId]=useState('');
  const [declaredLimitation,setDeclaredLimitation]=useState('');
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    GymVerticalService.exercises({active:'true'})
      .then((response)=>{if(active)setCatalog(rows(response));})
      .catch((cause)=>{if(active)setError(cause?.message||'No se pudo cargar el catálogo para sustituciones.');});
    return ()=>{active=false;};
  },[]);

  useEffect(()=>{
    setResult(null);setError('');
    onSelect?.(null);
  },[routineExercise?.id]);

  const alternatives=useMemo(()=>catalog.filter((item)=>item.id!==routineExercise?.exerciseId),[catalog,routineExercise?.exerciseId]);
  const options=[{value:'',label:'Sin preferencia'},...alternatives.map((item)=>({value:item.id,label:item.name||'Ejercicio'}))];
  const excludeOptions=[{value:'',label:'Sin exclusión'},...alternatives.map((item)=>({value:item.id,label:item.name||'Ejercicio'}))];

  async function suggest(){
    if(!routineExercise?.id)return;
    setLoading(true);setError('');
    try{
      const response=await GymVerticalService.suggestExerciseSubstitutions({
        routineExerciseId:routineExercise.id,
        availableEquipment:list(availableEquipment),
        preferredExerciseIds:preferredExerciseId?[preferredExerciseId]:[],
        excludedExerciseIds:excludedExerciseId?[excludedExerciseId]:[],
        declaredLimitations:declaredLimitation.trim()?[declaredLimitation.trim()]:[],
        limit:5
      });
      setResult(response?.data||response||null);
    }catch(cause){
      setError(cause?.message||'No se pudieron calcular sustituciones.');
    }finally{
      setLoading(false);
    }
  }

  if(!routineExercise)return null;

  return <Paper variant="outlined" sx={{p:1.1}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700}>Sustitución contextual</Typography>
        <Typography variant="caption" color="text.secondary">Usa equipamiento, preferencias y exclusiones declaradas. Las limitaciones de salud requieren revisión humana.</Typography>
      </Box>
      {selected?<CgStatusChip label={`Usando: ${selected.name}`} tone="warning"/>:<CgStatusChip label="Ejercicio prescrito" tone="default"/>}
    </Stack>
    <Divider sx={{my:1}}/>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>
      <CgTextField size="small" label="Equipamiento disponible" placeholder="mancuernas, polea, banco" value={availableEquipment} onChange={(event)=>setAvailableEquipment(event.target.value)}/>
      <CgSelect label="Ejercicio preferido" value={preferredExerciseId} onChange={(event)=>setPreferredExerciseId(event.target.value)} options={options}/>
      <CgSelect label="Ejercicio a excluir" value={excludedExerciseId} onChange={(event)=>setExcludedExerciseId(event.target.value)} options={excludeOptions}/>
      <CgTextField size="small" label="Limitación declarada" placeholder="No se interpreta automáticamente" value={declaredLimitation} onChange={(event)=>setDeclaredLimitation(event.target.value)}/>
    </Box>
    <Stack direction={{xs:'column',sm:'row'}} gap={.7} mt={1}>
      <CgButton type="button" variant="outlined" disabled={disabled||loading} onClick={()=>void suggest()}>{loading?'Evaluando…':'Buscar sustituciones'}</CgButton>
      {selected?<CgButton type="button" variant="outlined" disabled={disabled} onClick={()=>onSelect?.(null)}>Volver al prescrito</CgButton>:null}
    </Stack>
    {error?<Box mt={1}><CgState severity="error" title="Sustitución">{error}</CgState></Box>:null}
    {result?.humanReviewRequired?<Box mt={1}><CgState severity="warning" title="Revisión humana requerida">Existe una limitación declarada. El sistema no la interpreta ni selecciona ejercicios automáticamente.</CgState></Box>:null}
    {result&&!result.humanReviewRequired?<Stack gap={.7} mt={1}>
      <Typography variant="caption" color="text.secondary">Sugerencias explicables; ninguna se aplica automáticamente.</Typography>
      {rows(result.suggestions).length?rows(result.suggestions).map((item)=><Paper key={item.id} variant="outlined" sx={{p:.9}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
          <Box>
            <Typography variant="body2" fontWeight={700}>{item.name}</Typography>
            <Typography variant="caption" color="text.secondary">{item.muscleGroup||'Sin grupo'} · {item.equipment||'Sin equipo'} · {rows(item.reasons).join(' · ')}</Typography>
          </Box>
          <CgButton type="button" size="small" variant="outlined" disabled={disabled} onClick={()=>onSelect?.({id:item.id,name:item.name,reasons:rows(item.reasons)})}>Usar en esta sesión</CgButton>
        </Stack>
      </Paper>):<CgEmptyState title="Sin sustituciones compatibles" description="Ajusta equipamiento, preferencia o exclusiones declaradas."/>}
    </Stack>:null}
  </Paper>;
}
