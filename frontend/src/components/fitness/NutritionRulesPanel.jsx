import React, { useEffect, useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';

const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const RULES=[
  {value:'allergy',label:'Alergia declarada',tone:'error'},
  {value:'intolerance',label:'Intolerancia declarada',tone:'warning'},
  {value:'exclusion',label:'Exclusión',tone:'warning'},
  {value:'preferred',label:'Preferido',tone:'success'}
];
const meta=(kind)=>RULES.find((item)=>item.value===kind)||{label:kind,tone:'default'};

export function NutritionRulesPanel({memberId,ingredients=[],Toast}){
  const [rules,setRules]=useState([]);
  const [kind,setKind]=useState('exclusion');
  const [ingredientId,setIngredientId]=useState('');
  const [notes,setNotes]=useState('');
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  const options=useMemo(()=>[
    {value:'',label:'Seleccionar ingrediente'},
    ...ingredients.filter((item)=>item.active!==false).map((item)=>({value:item.id,label:item.name}))
  ],[ingredients]);

  async function load(){
    if(!memberId){setRules([]);return;}
    setLoading(true);setError('');
    try{setRules(rows(await GymVerticalService.nutritionRules(memberId)));}
    catch(cause){setError(cause?.message||'No se pudieron cargar las reglas nutricionales.');}
    finally{setLoading(false);}
  }

  useEffect(()=>{void load();},[memberId]);

  async function submit(event){
    event.preventDefault();
    if(!memberId||!ingredientId)return;
    setSaving(true);setError('');
    try{
      await GymVerticalService.createNutritionRule({memberId,ingredientId,kind,notes:notes.trim()||null});
      setIngredientId('');setNotes('');
      Toast?.show?.('Regla nutricional guardada.','success');
      await load();
    }catch(cause){
      const message=cause?.message||'No se pudo guardar la regla nutricional.';
      setError(message);Toast?.show?.(message,'error');
    }finally{setSaving(false);}
  }

  async function toggle(rule){
    setSaving(true);setError('');
    try{
      await GymVerticalService.updateNutritionRule(rule.id,{active:!rule.active});
      Toast?.show?.(rule.active?'Regla archivada.':'Regla reactivada.','success');
      await load();
    }catch(cause){
      const message=cause?.message||'No se pudo cambiar la regla nutricional.';
      setError(message);Toast?.show?.(message,'error');
    }finally{setSaving(false);}
  }

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Typography variant="h6">Restricciones y preferencias</Typography>
    <Typography variant="caption" color="text.secondary">Solo reglas declaradas explícitamente. Alergia, intolerancia y exclusión bloquean coincidencias exactas; Preferido nunca modifica el plan automáticamente.</Typography>
    {!memberId?<Box mt={1}><CgEmptyState title="Selecciona un cliente" description="Las reglas se guardan por cliente e ingrediente."/></Box>:<>
      {error?<Box mt={1}><CgState severity="warning" title="Reglas no disponibles">{error}</CgState></Box>:null}
      <Box component="form" onSubmit={submit} sx={{mt:1}}>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1.5fr'},gap:1}}>
          <CgSelect label="Tipo de regla" value={kind} onChange={(event)=>setKind(event.target.value)} options={RULES.map(({value,label})=>({value,label}))}/>
          <CgSelect label="Ingrediente" value={ingredientId} onChange={(event)=>setIngredientId(event.target.value)} options={options}/>
        </Box>
        <CgTextField fullWidth multiline minRows={2} label="Nota declarada" value={notes} onChange={(event)=>setNotes(event.target.value)} sx={{mt:1}}/>
        <CgButton type="submit" disabled={saving||loading||!ingredientId} sx={{mt:1}}>{saving?'Guardando…':'Agregar regla'}</CgButton>
      </Box>
      <Divider sx={{my:1.2}}/>
      {loading?<CgState severity="info" title="Cargando reglas">Actualizando restricciones y preferencias…</CgState>:rules.length?<Stack gap={.7}>{rules.map((rule)=><Paper key={rule.id} variant="outlined" sx={{p:1}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
          <Box><Typography variant="body2" fontWeight={700}>{rule.ingredientName||'Ingrediente'}</Typography><Typography variant="caption" color="text.secondary">{rule.notes||'Sin nota adicional'}</Typography></Box>
          <Stack direction="row" gap={.6} flexWrap="wrap"><CgStatusChip label={meta(rule.kind).label} tone={meta(rule.kind).tone}/><CgStatusChip label={rule.active?'Activa':'Archivada'} tone={rule.active?'success':'default'}/><CgButton size="small" variant="outlined" disabled={saving} onClick={()=>void toggle(rule)}>{rule.active?'Archivar':'Reactivar'}</CgButton></Stack>
        </Stack>
      </Paper>)}</Stack>:<CgEmptyState title="Sin reglas declaradas" description="No hay restricciones ni preferencias registradas para este cliente."/>}
    </>}
  </Paper>;
}
