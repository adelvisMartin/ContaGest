import React, { useState } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgDataTable, CgEmptyState, CgSelect, CgState } from '../ui/cg/CgPrimitives.jsx';
import { GymVerticalService } from '../../services/verticalService.js';

export function NutritionShoppingListPanel({plans=[]}){
  const [planId,setPlanId]=useState('');
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const options=[{value:'',label:'Seleccionar plan'},...plans.map((plan)=>({value:plan.id,label:`${plan.name} · ${plan.durationDays||7} días`}))];

  async function load(){
    if(!planId)return;
    setLoading(true);setError('');
    try{setData(await GymVerticalService.shoppingList(planId));}
    catch(cause){setError(cause?.message||'No se pudo generar la lista de compras.');}
    finally{setLoading(false);}
  }

  const columns=[
    {key:'name',label:'Ingrediente'},
    {key:'quantity',label:'Cantidad',align:'right',render:(row)=>Number(row.quantity||0).toLocaleString('es-VE',{maximumFractionDigits:3})},
    {key:'unit',label:'Unidad'}
  ];

  return <Paper variant="outlined" sx={{p:1.5}}>
    <Typography variant="h6">Lista de compras</Typography>
    <Typography variant="caption" color="text.secondary">Derivada sólo de las comidas principales; las Alternativas no inflan las compras.</Typography>
    <Stack direction={{xs:'column',sm:'row'}} gap={1} mt={1}><CgSelect label="Plan guardado" value={planId} onChange={(e)=>{setPlanId(e.target.value);setData(null);}} options={options}/><CgButton variant="outlined" disabled={!planId||loading} onClick={()=>void load()}>{loading?'Calculando…':'Generar lista'}</CgButton></Stack>
    {error?<Box mt={1}><CgState severity="warning" title="Lista no disponible">{error}</CgState></Box>:null}
    <Box mt={1}>{data?.shoppingList?.length?<CgDataTable columns={columns} rows={data.shoppingList} getRowId={(row)=>`${row.ingredientId}:${row.unit}`} empty="Lista vacía"/>:data?<CgEmptyState title="Lista vacía" description="El plan no tiene ingredientes principales para comprar."/>:null}</Box>
  </Paper>;
}
