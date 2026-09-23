import React from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgTextField } from '../ui/cg/CgPrimitives.jsx';

const PHASE_KINDS=[
  {value:'accumulation',label:'Acumulación'},
  {value:'intensification',label:'Intensificación'},
  {value:'realization',label:'Realización'},
  {value:'deload',label:'Descarga'},
  {value:'custom',label:'Personalizada'}
];

const WEEK_TYPES=[
  {value:'load',label:'Carga'},
  {value:'deload',label:'Descarga'}
];

const newWeek=()=>({weekType:'load',volumePct:100,intensityPct:100,notes:''});
const newPhase=(index)=>({name:`Mesociclo ${index+1}`,kind:'accumulation',weeks:[newWeek()],notes:''});

export const emptyPeriodizationStructure=()=>({phases:[]});

export function PeriodizationBuilder({value,onChange,disabled=false}){
  const structure=value&&typeof value==='object'?value:emptyPeriodizationStructure();
  const phases=Array.isArray(structure.phases)?structure.phases:[];

  const commit=(nextPhases)=>onChange?.({phases:nextPhases});

  const updatePhase=(index,patch)=>commit(phases.map((phase,i)=>i===index?{...phase,...patch}:phase));
  const removePhase=(index)=>commit(phases.filter((_,i)=>i!==index));
  const addPhase=()=>commit([...phases,newPhase(phases.length)]);

  const updateWeek=(phaseIndex,weekIndex,patch)=>{
    const phase=phases[phaseIndex];
    if(!phase)return;
    const weeks=(phase.weeks||[]).map((week,i)=>i===weekIndex?{...week,...patch}:week);
    updatePhase(phaseIndex,{weeks});
  };
  const addWeek=(phaseIndex)=>{
    const phase=phases[phaseIndex];
    if(!phase)return;
    updatePhase(phaseIndex,{weeks:[...(phase.weeks||[]),newWeek()]});
  };
  const removeWeek=(phaseIndex,weekIndex)=>{
    const phase=phases[phaseIndex];
    if(!phase||phase.weeks?.length<=1)return;
    updatePhase(phaseIndex,{weeks:phase.weeks.filter((_,i)=>i!==weekIndex)});
  };

  if(!phases.length)return <Stack gap={1}>
    <CgEmptyState title="Programa sin mesociclos" description="Agrega fases y define semanas explícitas de carga o descarga."/>
    <CgButton type="button" variant="outlined" onClick={addPhase} disabled={disabled}>Agregar mesociclo</CgButton>
  </Stack>;

  let globalWeek=0;
  return <Stack gap={1}>
    {phases.map((phase,phaseIndex)=><Paper key={phaseIndex} variant="outlined" sx={{p:1.2}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>Mesociclo {phaseIndex+1}</Typography>
          <Typography variant="caption" color="text.secondary">{phase.weeks?.length||0} semana(s)</Typography>
        </Box>
        <CgButton type="button" size="small" variant="outlined" color="error" disabled={disabled} onClick={()=>removePhase(phaseIndex)}>Quitar mesociclo</CgButton>
      </Stack>
      <Divider sx={{my:1}}/>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>
        <CgTextField size="small" label="Nombre de fase" required value={phase.name||''} onChange={(event)=>updatePhase(phaseIndex,{name:event.target.value})}/>
        <CgSelect label="Tipo de fase" value={phase.kind||'custom'} onChange={(event)=>updatePhase(phaseIndex,{kind:event.target.value})} options={PHASE_KINDS}/>
        <CgTextField size="small" multiline minRows={2} label="Notas de fase" value={phase.notes||''} onChange={(event)=>updatePhase(phaseIndex,{notes:event.target.value})} sx={{gridColumn:'1/-1'}}/>
      </Box>
      <Stack gap={.8} mt={1}>
        {(phase.weeks||[]).map((week,weekIndex)=>{
          globalWeek+=1;
          const weekNumber=globalWeek;
          return <Paper key={weekIndex} variant="outlined" sx={{p:1}}>
            <Stack direction={{xs:'column',md:'row'}} gap={1} alignItems={{md:'center'}}>
              <Typography variant="subtitle2" sx={{minWidth:80}}>Semana {weekNumber}</Typography>
              <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(3,minmax(0,1fr))'},gap:1,flex:1}}>
                <CgSelect label="Semana" value={week.weekType||'load'} onChange={(event)=>updateWeek(phaseIndex,weekIndex,{weekType:event.target.value})} options={WEEK_TYPES}/>
                <CgTextField size="small" type="number" label="Volumen objetivo (%)" inputProps={{min:1,max:200,step:1}} value={week.volumePct??100} onChange={(event)=>updateWeek(phaseIndex,weekIndex,{volumePct:Number(event.target.value||100)})}/>
                <CgTextField size="small" type="number" label="Intensidad objetivo (%)" inputProps={{min:1,max:200,step:1}} value={week.intensityPct??100} onChange={(event)=>updateWeek(phaseIndex,weekIndex,{intensityPct:Number(event.target.value||100)})}/>
                <CgTextField size="small" label="Notas de semana" value={week.notes||''} onChange={(event)=>updateWeek(phaseIndex,weekIndex,{notes:event.target.value})} sx={{gridColumn:{sm:'1/-1'}}}/>
              </Box>
              <CgButton type="button" size="small" variant="outlined" color="error" disabled={disabled||(phase.weeks||[]).length<=1} onClick={()=>removeWeek(phaseIndex,weekIndex)}>Quitar</CgButton>
            </Stack>
          </Paper>;
        })}
        <CgButton type="button" size="small" variant="outlined" disabled={disabled} onClick={()=>addWeek(phaseIndex)}>Agregar semana</CgButton>
      </Stack>
    </Paper>)}
    <CgButton type="button" variant="outlined" disabled={disabled} onClick={addPhase}>Agregar mesociclo</CgButton>
  </Stack>;
}
