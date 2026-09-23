import React, { useState } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgEmptyState, CgSelect, CgState, CgStatusChip } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';

export function NutritionSnapshotPanel({plans=[]}){
  const [planId,setPlanId]=useState('');
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  const options=[{value:'',label:'Seleccionar plan'},...plans.map((plan)=>({value:plan.id,label:plan.name}))];

  async function load(){
    if(!planId)return;
    setLoading(true);setError('');
    try{setData(await GymVerticalService.nutritionSnapshot(planId));}
    catch(cause){setError(cause?.message||'No se pudo cargar el snapshot nutricional.');}
    finally{setLoading(false);}
  }

  const snapshot=data?.snapshot||data?.data?.snapshot||null;
  const issues=Array.isArray(snapshot?.issues)?snapshot.issues:[];
  const micros=Array.isArray(snapshot?.micronutrients)?snapshot.micronutrients:[];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}>
      <Box><Typography variant="h6">Snapshot nutricional del plan</Typography><Typography variant="caption" color="text.secondary">Totales congelados al crear el plan; no cambian al versionar ingredientes.</Typography></Box>
      {snapshot?<CgStatusChip label={snapshot.complete?'Completo':'Incompleto'} tone={snapshot.complete?'success':'warning'}/>:null}
    </Stack>
    <Stack direction={{xs:'column',sm:'row'}} gap={1} mt={1}><CgSelect label="Plan" value={planId} onChange={(e)=>{setPlanId(e.target.value);setData(null);}} options={options}/><CgButton variant="outlined" disabled={!planId||loading} onClick={()=>void load()}>{loading?'Cargando…':'Ver snapshot'}</CgButton></Stack>
    {error?<Box mt={1}><CgState severity="warning" title="Snapshot no disponible">{error}</CgState></Box>:null}
    {data&&!snapshot?<Box mt={1}><CgEmptyState title="Plan sin snapshot" description="Este plan fue creado antes de 46/51; no se reconstruyen totales históricos con perfiles actuales."/></Box>:null}
    {snapshot&&!snapshot.complete?<Box mt={1}><CgState severity="warning" title="Totales incompletos">No se muestran como totales confiables porque faltó un perfil o hubo una unidad incompatible. {issues.map((item)=>item.code).join(' · ')}</CgState></Box>:null}
    {snapshot?.complete?<Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'repeat(5,minmax(0,1fr))'},gap:1,mt:1}}>
      {[['Energía',snapshot.energyKcal,'kcal'],['Proteína',snapshot.proteinG,'g'],['Carbohidratos',snapshot.carbsG,'g'],['Grasa',snapshot.fatG,'g'],['Fibra',snapshot.fiberG,'g']].map(([label,value,unit])=><Paper key={label} variant="outlined" sx={{p:1}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body1" fontWeight={700}>{Number(value||0).toLocaleString('es-VE',{maximumFractionDigits:3})} {unit}</Typography></Paper>)}
    </Box>:null}
    {snapshot?.complete&&micros.length?<Stack gap={.5} mt={1}>{micros.map((item)=><Typography key={`${item.key}:${item.unit}`} variant="body2">{item.label}: <strong>{Number(item.amount||0).toLocaleString('es-VE',{maximumFractionDigits:3})} {item.unit}</strong></Typography>)}</Stack>:null}
  </Paper>;
}
