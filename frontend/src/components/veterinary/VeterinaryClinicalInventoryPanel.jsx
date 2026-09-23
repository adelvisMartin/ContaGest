import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, MenuItem, Paper, Stack, TextField, Typography
} from '@mui/material';
import { VeterinaryService } from '../../services/verticalService.js';
import { reportVeterinaryError } from './veterinaryError.js';

const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const exact=(value)=>String(value??'0');
const isExpired=(value)=>{
  if(!value)return false;
  const expiry=new Date(String(value).slice(0,10)+'T00:00:00.000Z');
  const today=new Date(); today.setUTCHours(0,0,0,0);
  return expiry.getTime()<today.getTime();
};
const nextClinicalActId=()=>{
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const template='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g,(token)=>{
    const value=Math.floor(Math.random()*16);
    const nibble=token==='x'?value:(value&0x3)|0x8;
    return nibble.toString(16);
  });
};

export function VeterinaryClinicalInventoryPanel({selectedPatient,prescriptions=[]}){
  const [inventory,setInventory]=useState({products:[],lots:[]});
  const [consumptions,setConsumptions]=useState([]);
  const [loading,setLoading]=useState(false);
  const [permissionBlocked,setPermissionBlocked]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [lotSaving,setLotSaving]=useState(false);
  const [consumeSaving,setConsumeSaving]=useState(false);
  const [lotForm,setLotForm]=useState({productId:'',lotNumber:'',expiresAt:'',receivedQuantity:'0',unitCost:'',notes:''});
  const [consumeForm,setConsumeForm]=useState({prescriptionId:'',lotId:'',quantity:'',note:'',clinicalActId:nextClinicalActId()});

  async function refresh(){
    if(!selectedPatient?.id){
      setInventory({products:[],lots:[]});
      setConsumptions([]);
      return;
    }
    setLoading(true);
    setError('');
    try{
      const [inventoryResponse,consumptionResponse]=await Promise.all([
        VeterinaryService.clinicalInventory(),
        VeterinaryService.clinicalConsumptions(selectedPatient.id)
      ]);
      setInventory(inventoryResponse?.data||inventoryResponse||{products:[],lots:[]});
      setConsumptions(rows(consumptionResponse));
      setPermissionBlocked(false);
    }catch(cause){
      const message=reportVeterinaryError('clinicalInventory.refresh',cause,'No se pudo cargar el inventario clínico.');
      if(cause?.status===403){
        setPermissionBlocked(true);
        setInventory({products:[],lots:[]});
        setConsumptions([]);
      }else{
        setError(message);
      }
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void refresh();},[selectedPatient?.id]);

  const products=rows(inventory?.products);
  const lots=rows(inventory?.lots);
  const linkedPrescriptions=useMemo(
    ()=>prescriptions.filter((item)=>item.status==='active'&&item.productId),
    [prescriptions]
  );
  const selectedPrescription=useMemo(
    ()=>linkedPrescriptions.find((item)=>item.id===consumeForm.prescriptionId)||null,
    [linkedPrescriptions,consumeForm.prescriptionId]
  );
  const eligibleLots=useMemo(
    ()=>lots.filter((lot)=>lot.productId===selectedPrescription?.productId),
    [lots,selectedPrescription?.productId]
  );

  const setLot=(name)=>(event)=>setLotForm((current)=>({...current,[name]:event.target.value}));
  const setConsume=(name)=>(event)=>setConsumeForm((current)=>({
    ...current,
    [name]:event.target.value,
    ...(name==='prescriptionId'?{lotId:''}:{})
  }));

  async function createLot(event){
    event.preventDefault();
    if(!lotForm.productId||!lotForm.lotNumber.trim()||lotSaving)return;
    setLotSaving(true);setError('');setSuccess('');
    try{
      const result=await VeterinaryService.createClinicalInventoryLot({
        productId:lotForm.productId,
        lotNumber:lotForm.lotNumber.trim(),
        expiresAt:lotForm.expiresAt||null,
        receivedQuantity:lotForm.receivedQuantity||'0',
        unitCost:lotForm.unitCost||undefined,
        notes:lotForm.notes.trim()||null
      });
      setSuccess(result?.replayed?'El lote ya existía; no se duplicó la recepción.':'Lote registrado en el inventario canónico.');
      setLotForm({productId:'',lotNumber:'',expiresAt:'',receivedQuantity:'0',unitCost:'',notes:''});
      await refresh();
    }catch(cause){
      setError(reportVeterinaryError('clinicalInventory.createLot',cause,'No se pudo registrar el lote.'));
    }
    finally{setLotSaving(false);}
  }

  async function consume(event){
    event.preventDefault();
    if(!consumeForm.prescriptionId||!consumeForm.lotId||!consumeForm.quantity||consumeSaving)return;
    setConsumeSaving(true);setError('');setSuccess('');
    try{
      const result=await VeterinaryService.consumeClinicalInventory({
        prescriptionId:consumeForm.prescriptionId,
        lotId:consumeForm.lotId,
        quantity:consumeForm.quantity,
        clinicalActId:consumeForm.clinicalActId,
        note:consumeForm.note.trim()||null
      });
      setSuccess(result?.replayed?'El consumo ya había sido registrado; se devolvió el movimiento existente.':'Consumo clínico registrado como InventoryMovement de salida.');
      setConsumeForm({prescriptionId:'',lotId:'',quantity:'',note:'',clinicalActId:nextClinicalActId()});
      await refresh();
    }catch(cause){
      setError(reportVeterinaryError('clinicalInventory.consume',cause,'No se pudo registrar el consumo clínico.'));
    }
    finally{setConsumeSaving(false);}
  }

  return <Paper variant="outlined" sx={{p:1.3,minWidth:0}}>
    <Typography variant="h6">Inventario clínico</Typography>
    <Typography variant="caption" color="text.secondary">
      Lote, vencimiento, mínimo, reorden y consumo derivado de una prescripción; el saldo se conserva en Product + InventoryMovement.
    </Typography>
    <Divider sx={{my:1}}/>

    {!selectedPatient?<Alert severity="info">Selecciona una mascota para consultar trazabilidad de consumo.</Alert>:null}
    {permissionBlocked?<Alert severity="info">El inventario clínico requiere permiso <b>inventory.manage</b>. La historia y prescripción clínica permanecen disponibles.</Alert>:null}
    {error?<Alert severity="error" sx={{mb:1}} action={<Button color="inherit" size="small" onClick={()=>void refresh()}>Reintentar</Button>}>{error}</Alert>:null}
    {success?<Alert severity="success" sx={{mb:1}}>{success}</Alert>:null}
    {loading?<Alert severity="info">Actualizando lotes y consumos…</Alert>:null}

    {!permissionBlocked&&selectedPatient?<>
      <Typography variant="subtitle1" fontWeight={700}>Mínimos y reorden</Typography>
      {products.length?<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:.8,mt:.8}}>
        {products.map((product)=><Paper key={product.id} variant="outlined" sx={{p:.9}}>
          <Stack direction="row" justifyContent="space-between" gap={1}>
            <Box sx={{minWidth:0}}><Typography variant="body2" fontWeight={700} noWrap>{product.name}</Typography><Typography variant="caption" color="text.secondary">SKU {product.sku} · {product.unit}</Typography></Box>
            <Chip size="small" label={product.reorder?'Reorden':'Stock OK'} color={product.reorder?'warning':'success'} variant="outlined"/>
          </Stack>
          <Typography variant="caption" display="block" mt={.6}>Disponible: {exact(product.available)} · Mínimo: {exact(product.minStock)}</Typography>
        </Paper>)}
      </Box>:<Alert severity="info" sx={{mt:.8}}>No hay productos activos en inventario.</Alert>}

      <Divider sx={{my:1.3}}/>
      <Typography variant="subtitle1" fontWeight={700}>Registrar lote / recepción inicial</Typography>
      <Box component="form" onSubmit={createLot} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1,mt:.8}}>
        <TextField select required label="Producto" value={lotForm.productId} onChange={setLot('productId')}>
          <MenuItem value="">Seleccionar</MenuItem>
          {products.map((item)=><MenuItem key={item.id} value={item.id}>{item.name} · {item.sku}</MenuItem>)}
        </TextField>
        <TextField required label="Lote" value={lotForm.lotNumber} onChange={setLot('lotNumber')}/>
        <TextField label="Vencimiento" type="date" value={lotForm.expiresAt} onChange={setLot('expiresAt')} slotProps={{inputLabel:{shrink:true}}}/>
        <TextField label="Cantidad recibida" type="number" inputProps={{min:0,step:.001}} value={lotForm.receivedQuantity} onChange={setLot('receivedQuantity')}/>
        <TextField label="Costo unitario" type="number" inputProps={{min:0,step:.01}} value={lotForm.unitCost} onChange={setLot('unitCost')}/>
        <TextField label="Notas" value={lotForm.notes} onChange={setLot('notes')}/>
        <Button type="submit" disabled={lotSaving||!lotForm.productId||!lotForm.lotNumber.trim()}>{lotSaving?'Guardando…':'Registrar lote'}</Button>
      </Box>

      <Stack gap={.6} mt={1}>
        {lots.map((lot)=>{
          const product=products.find((item)=>item.id===lot.productId);
          const expired=isExpired(lot.expiresAt);
          return <Paper key={lot.id} variant="outlined" sx={{p:.8}}>
            <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={.6}>
              <Box><Typography variant="body2" fontWeight={700}>{product?.name||lot.productId} · Lote {lot.lotNumber}</Typography><Typography variant="caption" color="text.secondary">Vence: {lot.expiresAt?String(lot.expiresAt).slice(0,10):'Sin fecha'} · Saldo lote: {exact(lot.onHand)}</Typography></Box>
              <Chip size="small" label={expired?'Vencido':'Vigente'} color={expired?'error':'success'} variant="outlined"/>
            </Stack>
          </Paper>;
        })}
      </Stack>

      <Divider sx={{my:1.3}}/>
      <Typography variant="subtitle1" fontWeight={700}>Consumo derivado del acto clínico</Typography>
      <Alert severity="info" sx={{mt:.7,mb:.8}}>El consumo requiere una prescripción activa vinculada a producto y un lote explícito. No hay selección automática de dosis ni de lote.</Alert>
      <Box component="form" onSubmit={consume} sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>
        <TextField select required label="Prescripción" value={consumeForm.prescriptionId} onChange={setConsume('prescriptionId')}>
          <MenuItem value="">Seleccionar</MenuItem>
          {linkedPrescriptions.map((item)=><MenuItem key={item.id} value={item.id}>{item.medication} · {item.dose} · {item.productName||item.productId}</MenuItem>)}
        </TextField>
        <TextField select required label="Lote" value={consumeForm.lotId} onChange={setConsume('lotId')} disabled={!selectedPrescription}>
          <MenuItem value="">Seleccionar</MenuItem>
          {eligibleLots.map((lot)=><MenuItem key={lot.id} value={lot.id} disabled={isExpired(lot.expiresAt)||Number(lot.onHand)<=0}>
            {lot.lotNumber} · saldo {exact(lot.onHand)} · vence {lot.expiresAt?String(lot.expiresAt).slice(0,10):'—'}
          </MenuItem>)}
        </TextField>
        <TextField required label="Cantidad consumida" type="number" inputProps={{min:.001,step:.001}} value={consumeForm.quantity} onChange={setConsume('quantity')}/>
        <TextField label="Nota del acto clínico" value={consumeForm.note} onChange={setConsume('note')}/>
        <Button type="submit" disabled={consumeSaving||!consumeForm.prescriptionId||!consumeForm.lotId||!consumeForm.quantity}>{consumeSaving?'Registrando…':'Registrar consumo'}</Button>
      </Box>

      <Divider sx={{my:1.3}}/>
      <Typography variant="subtitle1" fontWeight={700}>Trazabilidad de consumos</Typography>
      {consumptions.length?<Stack gap={.6} mt={.7}>{consumptions.map((item)=><Paper key={item.id} variant="outlined" sx={{p:.8}}>
        <Typography variant="body2" fontWeight={700}>{item.medication} · {item.productName}</Typography>
        <Typography variant="caption" color="text.secondary">Lote {item.lotNumber||'—'} · {item.quantity} {products.find((p)=>p.id===item.productId)?.unit||''} · {new Date(item.createdAt).toLocaleString('es-VE')}</Typography>
      </Paper>)}</Stack>:<Alert severity="info" sx={{mt:.7}}>Sin consumos clínicos registrados para esta mascota.</Alert>}
    </>:null}
  </Paper>;
}
