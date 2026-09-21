import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgEmptyState, CgMoney, CgState, CgStatusChip
} from '../ui/cg/CgPrimitives.jsx';
import { HealthVerticalService } from '../../services/verticalService.js';

const invoiceTone=(status)=>status==='paid'?'success':status==='overdue'?'error':status==='issued'?'warning':'info';
const invoiceLabel=(status)=>status==='paid'?'Pagada':status==='overdue'?'Vencida':status==='issued'?'Emitida':status==='cancelled'?'Anulada':'Borrador';
const acceptedPlan=(item)=>{
  const plan=item?.clinicalData?.treatmentPlan;
  return item?.type==='dental-treatment-plan'
    && item?.status==='signed'
    && plan?.status==='accepted'
    && plan?.acceptance?.status==='accepted';
};

function MoneyMetric({label,value,currency,hint}){
  return <Paper variant="outlined" sx={{p:1.1,minWidth:0}}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="subtitle1" fontWeight={800} sx={{fontVariantNumeric:'tabular-nums'}}>
      <CgMoney value={value||'0.00'} currency={currency||'VES'}/>
    </Typography>
    {hint?<Typography variant="caption" color="text.secondary">{hint}</Typography>:null}
  </Paper>;
}

export function DentalFinancialPanel({selectedPatientId,encounters,notify}){
  const [overview,setOverview]=useState(null);
  const [patientFinancial,setPatientFinancial]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [creatingPlanId,setCreatingPlanId]=useState('');
  const requestSequence=useRef(0);

  const acceptedPlans=useMemo(()=>encounters
    .filter(acceptedPlan)
    .sort((left,right)=>new Date(right.createdAt||0)-new Date(left.createdAt||0)),[encounters]);

  const patientLinks=patientFinancial?.links||[];
  const linksByPlan=useMemo(()=>new Map(patientLinks.map((item)=>[item.treatmentPlanId,item])),[patientLinks]);

  async function refresh(){
    const sequence=++requestSequence.current;
    setLoading(true);
    setError('');
    try{
      const [globalResponse,patientResponse]=await Promise.all([
        HealthVerticalService.dentalFinancial(),
        selectedPatientId?HealthVerticalService.dentalFinancial({patientId:selectedPatientId}):Promise.resolve(null)
      ]);
      if(sequence!==requestSequence.current)return;
      setOverview(globalResponse);
      setPatientFinancial(patientResponse);
    }catch(cause){
      if(sequence!==requestSequence.current)return;
      setOverview(null);
      setPatientFinancial(null);
      setError(cause?.message||'No se pudo cargar la integración financiera odontológica.');
    }finally{
      if(sequence===requestSequence.current)setLoading(false);
    }
  }

  useEffect(()=>{void refresh();},[selectedPatientId]);

  async function createDraft(planId){
    if(!planId||creatingPlanId)return;
    setCreatingPlanId(planId);
    try{
      const created=await HealthVerticalService.createDentalFinancialLink(planId);
      notify?.(created?.replayed?'El plan ya tenía un borrador ERP vinculado.':'Borrador ERP creado sin contabilizar; revisa cliente, impuestos y tasa antes de emitir.','success');
      await refresh();
    }catch(cause){
      notify?.(`No se creó el borrador ERP: ${cause?.message||'Error'}`,'error');
    }finally{
      setCreatingPlanId('');
    }
  }

  const totals=overview?.summary?.totalsByCurrency||[];
  const professionals=overview?.professionals||[];
  const procedures=overview?.procedures||[];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1} alignItems={{md:'flex-start'}}>
      <Box>
        <Typography variant="h6">Presupuesto, cobranza y analítica ERP</Typography>
        <Typography variant="caption" color="text.secondary">Conecta planes aceptados con la autoridad comercial SalesInvoice sin crear una segunda contabilidad.</Typography>
      </Box>
      <CgButton size="small" variant="outlined" onClick={()=>void refresh()} disabled={loading}>
        {loading?'Actualizando…':'Actualizar finanzas'}
      </CgButton>
    </Stack>

    <Divider sx={{my:1.2}}/>
    <CgState severity="info" title="Frontera clínica ↔ ERP">Un plan aceptado puede originar como máximo un SalesInvoice en borrador. Salud no contabiliza asientos: antes de emitir, Ventas debe validar cliente, tratamiento fiscal y tasa de cambio.</CgState>
    {error?<Box sx={{mt:1}}><CgState severity="warning" title="Finanzas no disponibles">{error} Verifica permisos health.manage + sales.view/sales.manage.</CgState></Box>:null}

    {overview?<>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'repeat(4,minmax(0,1fr))'},gap:1,mt:1.2}}>
        <Paper variant="outlined" sx={{p:1.1}}><Typography variant="caption" color="text.secondary">Planes aceptados</Typography><Typography variant="h6">{overview.summary?.acceptedPlans||0}</Typography></Paper>
        <Paper variant="outlined" sx={{p:1.1}}><Typography variant="caption" color="text.secondary">Pendientes</Typography><Typography variant="h6">{overview.summary?.pendingPlans||0}</Typography></Paper>
        <Paper variant="outlined" sx={{p:1.1}}><Typography variant="caption" color="text.secondary">Vinculados ERP</Typography><Typography variant="h6">{overview.summary?.linkedPlans||0}</Typography></Paper>
        <Paper variant="outlined" sx={{p:1.1}}><Typography variant="caption" color="text.secondary">Aceptados sin ERP</Typography><Typography variant="h6">{overview.summary?.unlinkedAcceptedPlans||0}</Typography></Paper>
      </Box>

      <Typography variant="subtitle1" fontWeight={800} sx={{mt:1.5}}>Cobranza por moneda</Typography>
      <Typography variant="caption" color="text.secondary">“Cobrado” se deriva únicamente de SalesInvoice.status=paid; VES y USD nunca se suman entre sí.</Typography>
      {totals.length?<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1,mt:1}}>
        {totals.map((item)=><Paper key={item.currency} variant="outlined" sx={{p:1}}>
          <Typography variant="subtitle2">{item.currency}</Typography>
          <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},gap:.7,mt:.7}}>
            <MoneyMetric label="Presupuestado" value={item.quotedTotal} currency={item.currency}/>
            <MoneyMetric label="Borradores" value={item.draftTotal} currency={item.currency}/>
            <MoneyMetric label="Por cobrar" value={item.receivableTotal} currency={item.currency} hint="Emitida + vencida"/>
            <MoneyMetric label="Cobrado" value={item.paidTotal} currency={item.currency}/>
          </Box>
        </Paper>)}
      </Box>:<CgEmptyState title="Sin actividad financiera odontológica" description="Los indicadores aparecerán al vincular el primer plan aceptado con ERP."/>}

      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:1,mt:1.5}}>
        <Paper variant="outlined" sx={{p:1.2,minWidth:0}}>
          <Typography variant="subtitle1" fontWeight={800}>Producción por profesional</Typography>
          <Stack gap=.7 mt={1}>
            {professionals.slice(0,8).map((item)=><Paper key={item.key} variant="outlined" sx={{p:.9}}>
              <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                <Box sx={{minWidth:0}}><Typography variant="body2" fontWeight={700} noWrap>{item.professionalName}</Typography><Typography variant="caption" color="text.secondary">{item.currency}</Typography></Box>
                <CgMoney value={item.quotedTotal} currency={item.currency}/>
              </Stack>
            </Paper>)}
            {!professionals.length?<CgEmptyState title="Sin producción por profesional" description="No hay borradores ERP odontológicos vinculados todavía."/>:null}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{p:1.2,minWidth:0}}>
          <Typography variant="subtitle1" fontWeight={800}>Producción por procedimiento</Typography>
          <Stack gap=.7 mt={1}>
            {procedures.slice(0,8).map((item)=><Paper key={item.key} variant="outlined" sx={{p:.9}}>
              <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                <Box sx={{minWidth:0}}><Typography variant="body2" fontWeight={700} noWrap>{item.procedure}</Typography><Typography variant="caption" color="text.secondary">{item.quantity} unidad(es) · {item.currency}</Typography></Box>
                <CgMoney value={item.quotedTotal} currency={item.currency}/>
              </Stack>
            </Paper>)}
            {!procedures.length?<CgEmptyState title="Sin producción por procedimiento" description="La analítica se alimenta del snapshot comercial del plan aceptado."/>:null}
          </Stack>
        </Paper>
      </Box>
    </>:null}

    <Divider sx={{my:1.5}}/>
    <Typography variant="h6">Planes aceptados del paciente</Typography>
    {!selectedPatientId?<Box sx={{mt:1}}><CgEmptyState title="Selecciona un paciente" description="El vínculo con ERP se crea desde un plan de tratamiento aceptado del paciente activo."/></Box>:null}
    {selectedPatientId&&acceptedPlans.length===0?<Box sx={{mt:1}}><CgEmptyState title="Sin planes aceptados" description="Acepta primero un plan de tratamiento; el presupuesto clínico no genera contabilidad automáticamente."/></Box>:null}
    {selectedPatientId&&acceptedPlans.length>0?<Stack gap={1} mt={1}>
      {acceptedPlans.map((item)=>{
        const plan=item.clinicalData?.treatmentPlan||{};
        const link=linksByPlan.get(item.id);
        const currency=plan.budget?.currency||'VES';
        const total=plan.budget?.estimatedTotal||'0.00';
        return <Paper key={item.id} variant="outlined" sx={{p:1.1}}>
          <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} alignItems={{sm:'center'}}>
            <Box sx={{minWidth:0}}>
              <Typography variant="body2" fontWeight={800}>Plan aceptado · <CgMoney value={total} currency={currency}/></Typography>
              <Typography variant="caption" color="text.secondary">ID {item.id}</Typography>
            </Box>
            {link?<Stack direction="row" gap={.7} alignItems="center" flexWrap="wrap">
              <CgStatusChip size="small" label={invoiceLabel(link.invoiceStatus)} tone={invoiceTone(link.invoiceStatus)}/>
              <Typography variant="caption">{link.invoiceNumber}</Typography>
            </Stack>:<CgButton size="small" onClick={()=>void createDraft(item.id)} disabled={Boolean(creatingPlanId)}>
              {creatingPlanId===item.id?'Creando borrador…':'Crear borrador ERP'}
            </CgButton>}
          </Stack>
        </Paper>;
      })}
    </Stack>:null}
  </Paper>;
}
