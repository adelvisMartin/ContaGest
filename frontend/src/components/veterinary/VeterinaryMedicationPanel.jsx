import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, MenuItem, Paper, Stack, TextField, Typography
} from '@mui/material';
import { VeterinaryService } from '../../services/verticalService.js';

const rows=(value)=>Array.isArray(value)?value:value?.data||[];

function MedicationLabel({prescription}){
  const label=prescription?.labelSnapshot&&typeof prescription.labelSnapshot==='object'
    ? prescription.labelSnapshot
    : null;
  const patient=label?.patient||{};
  const professional=label?.professional||{};
  const product=label?.inventoryProduct||null;
  return <Paper variant="outlined" sx={{p:1,mt:.8}}>
    <Typography variant="overline" color="text.secondary">Etiqueta clínica</Typography>
    <Typography variant="subtitle2">{label?.medication||prescription.medication}</Typography>
    <Typography variant="body2"><b>Dosis:</b> {label?.dose||prescription.dose||'—'}</Typography>
    <Typography variant="body2"><b>Frecuencia:</b> {label?.frequency||prescription.frequency||'—'}</Typography>
    <Typography variant="body2"><b>Duración:</b> {label?.duration||prescription.duration||'—'}</Typography>
    {(label?.instructions||prescription.instructions)?<Typography variant="body2"><b>Indicaciones:</b> {label?.instructions||prescription.instructions}</Typography>:null}
    <Divider sx={{my:.7}}/>
    <Typography variant="caption" color="text.secondary">
      Paciente: {patient.name||'—'} · Profesional: {professional.name||prescription.professionalName||'Sin asignar'}
    </Typography>
    {product?<Typography variant="caption" color="text.secondary" display="block">
      Inventario vinculado: {product.name} · SKU {product.sku}
    </Typography>:null}
  </Paper>;
}

export function VeterinaryMedicationPanel({selectedPatient,professionals=[],prescriptions=[],onCreated}){
  const [products,setProducts]=useState([]);
  const [productError,setProductError]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [form,setForm]=useState({
    professionalId:'',
    medication:'',
    dose:'',
    frequency:'',
    duration:'',
    instructions:'',
    productId:''
  });

  useEffect(()=>{
    let cancelled=false;
    VeterinaryService.medicationProducts()
      .then((response)=>{if(!cancelled){setProducts(rows(response));setProductError('');}})
      .catch((cause)=>{
        if(cancelled)return;
        setProducts([]);
        setProductError(cause?.status===403
          ? 'No tienes permiso de inventario. La prescripción clínica sigue disponible sin vínculo de producto.'
          : cause?.message||'No se pudo cargar el inventario para vinculación opcional.');
      });
    return()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    setError('');
    setSuccess('');
  },[selectedPatient?.id]);

  const selectedProduct=useMemo(
    ()=>products.find((item)=>item.id===form.productId)||null,
    [products,form.productId]
  );
  const setField=(name)=>(event)=>setForm((current)=>({...current,[name]:event.target.value}));
  const valid=Boolean(
    selectedPatient?.id
    && form.medication.trim()
    && form.dose.trim()
    && form.frequency.trim()
    && form.duration.trim()
  );

  async function submit(event){
    event.preventDefault();
    if(!valid||saving)return;
    setSaving(true);
    setError('');
    setSuccess('');
    try{
      await VeterinaryService.createMedicationPrescription({
        patientId:selectedPatient.id,
        professionalId:form.professionalId||null,
        encounterId:null,
        medication:form.medication.trim(),
        dose:form.dose.trim(),
        frequency:form.frequency.trim(),
        duration:form.duration.trim(),
        instructions:form.instructions.trim()||null,
        productId:form.productId||null
      });
      setSuccess('Prescripción registrada con etiqueta y provenance.');
      setForm({professionalId:'',medication:'',dose:'',frequency:'',duration:'',instructions:'',productId:''});
      await onCreated?.();
    }catch(cause){
      setError(cause?.message||'No se pudo registrar la prescripción.');
    }finally{
      setSaving(false);
    }
  }

  return <Paper variant="outlined" sx={{p:1.3,minWidth:0}}>
    <Typography variant="h6">Medicación integrada</Typography>
    <Typography variant="caption" color="text.secondary">
      Prescripción → dosis → frecuencia → duración → etiqueta → vínculo opcional con el producto canónico de inventario.
    </Typography>
    <Divider sx={{my:1}}/>

    {!selectedPatient?<Alert severity="info">Selecciona una mascota para prescribir.</Alert>:<>
      {error?<Alert severity="error" sx={{mb:1}}>{error}</Alert>:null}
      {success?<Alert severity="success" sx={{mb:1}}>{success}</Alert>:null}
      {productError?<Alert severity="info" sx={{mb:1}}>{productError}</Alert>:null}
      <Alert severity="warning" sx={{mb:1}}>
        Vincular un producto no descuenta stock ni selecciona lote. El consumo clínico y la autoridad de lotes pertenecen al flujo de inventario clínico posterior.
      </Alert>

      <Box component="form" onSubmit={submit}>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>
          <TextField select label="Profesional" value={form.professionalId} onChange={setField('professionalId')}>
            <MenuItem value="">Sin asignar</MenuItem>
            {professionals.map((item)=><MenuItem key={item.id} value={item.id}>{item.fullName} · {item.specialty||'Profesional'}</MenuItem>)}
          </TextField>
          <TextField select label="Producto de inventario (opcional)" value={form.productId} onChange={setField('productId')} disabled={!products.length}>
            <MenuItem value="">Sin vínculo de inventario</MenuItem>
            {products.map((item)=><MenuItem key={item.id} value={item.id}>{item.name} · {item.sku} · stock {item.stock} {item.unit}</MenuItem>)}
          </TextField>
          <TextField required label="Medicamento" value={form.medication} onChange={setField('medication')}/>
          <TextField required label="Dosis" value={form.dose} onChange={setField('dose')} helperText="Se registra manualmente; no hay cálculo ni recomendación automática."/>
          <TextField required label="Frecuencia" value={form.frequency} onChange={setField('frequency')}/>
          <TextField required label="Duración" value={form.duration} onChange={setField('duration')}/>
        </Box>
        <TextField fullWidth multiline minRows={2} label="Indicaciones" value={form.instructions} onChange={setField('instructions')} sx={{mt:1}}/>
        {selectedProduct?<Chip sx={{mt:1}} label={`Trazabilidad: ${selectedProduct.name} · SKU ${selectedProduct.sku}`} variant="outlined"/>:null}
        <Button type="submit" disabled={!valid||saving} sx={{mt:1}}>{saving?'Guardando…':'Registrar prescripción'}</Button>
      </Box>

      <Divider sx={{my:1.2}}/>
      <Typography variant="subtitle1" fontWeight={700}>Prescripciones y etiquetas</Typography>
      {prescriptions.length?<Stack gap={1} mt={1}>
        {prescriptions.map((item)=><Paper key={item.id} variant="outlined" sx={{p:1}}>
          <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={.7}>
            <Box>
              <Typography variant="subtitle2">{item.medication}</Typography>
              <Typography variant="caption" color="text.secondary">
                {[item.dose,item.frequency,item.duration].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <Stack direction="row" gap={.5} alignItems="center">
              <Chip size="small" label={item.status||'active'} variant="outlined"/>
              {item.productName?<Chip size="small" label={`Inventario: ${item.productName}`} color="info" variant="outlined"/>:null}
            </Stack>
          </Stack>
          <MedicationLabel prescription={item}/>
        </Paper>)}
      </Stack>:<Alert severity="info" sx={{mt:1}}>No hay prescripciones registradas para esta mascota.</Alert>}
    </>}
  </Paper>;
}
