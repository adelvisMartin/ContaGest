import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography
} from '@mui/material';
import { VeterinaryService } from '../../services/verticalService.js';
import { reportVeterinaryError } from './veterinaryError.js';

let localId=0;
const nextId=(prefix)=>`${prefix}-${++localId}`;
const emptyServiceLine=()=>({_key:nextId('service'),kind:'service',description:'Consulta veterinaria',quantity:'1',unitPrice:'0',taxRate:'16',productId:''});
const emptyProductLine=()=>({_key:nextId('product'),kind:'product',description:'',quantity:'1',unitPrice:'',taxRate:'',productId:''});
const statusLabel={proposed:'Propuesta',authorized:'Autorizada',attended:'Atención registrada',invoiced:'Facturada en borrador',cancelled:'Cancelada'};
const statusColor={proposed:'warning',authorized:'info',attended:'primary',invoiced:'success',cancelled:'default'};

const money=(value)=>new Intl.NumberFormat('es-VE',{style:'currency',currency:'VES'}).format(Number(value||0));

export function VeterinaryFinancialPanel({ selectedPatient, encounters = [], hospitalizations = [] }){
  const [cases,setCases]=useState([]);
  const [catalog,setCatalog]=useState({currency:'VES',products:[]});
  const [lines,setLines]=useState([emptyServiceLine()]);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [authTarget,setAuthTarget]=useState(null);
  const [signerName,setSignerName]=useState('');
  const [authorizationText,setAuthorizationText]=useState('Autorizo la atención veterinaria descrita en esta estimación y comprendo que la factura final puede variar según los consumos reales registrados.');
  const [attestation,setAttestation]=useState(false);
  const [careTarget,setCareTarget]=useState(null);
  const [careType,setCareType]=useState('encounter');
  const [careSourceId,setCareSourceId]=useState('');
  const [invoiceTarget,setInvoiceTarget]=useState(null);
  const [consumptions,setConsumptions]=useState([]);
  const [selectedMovementIds,setSelectedMovementIds]=useState([]);

  const products=Array.isArray(catalog?.products)?catalog.products:[];
  const signedEncounters=useMemo(()=>encounters.filter((item)=>item.status==='signed'),[encounters]);
  const activeHospitalizations=useMemo(()=>hospitalizations.filter((item)=>item.status!=='cancelled'),[hospitalizations]);
  const estimatedPreview=useMemo(()=>lines.reduce((sum,line)=>{
    if(line.kind==='product'){
      const product=products.find((item)=>item.id===line.productId);
      if(!product)return sum;
      const base=Number(product.price||0)*Number(line.quantity||0);
      return sum+base+(base*Number(product.taxRate||0)/100);
    }
    const base=Number(line.unitPrice||0)*Number(line.quantity||0);
    return sum+base+(base*Number(line.taxRate||0)/100);
  },0),[lines,products]);

  async function load({silent=false}={}){
    if(!selectedPatient?.id){setCases([]);return;}
    if(!silent)setLoading(true);
    setError('');
    try{
      const [caseResponse,catalogResponse]=await Promise.all([
        VeterinaryService.financialCases(selectedPatient.id),
        VeterinaryService.financialCatalog()
      ]);
      setCases(Array.isArray(caseResponse)?caseResponse:caseResponse?.data||[]);
      setCatalog(catalogResponse?.data||catalogResponse||{currency:'VES',products:[]});
    }catch(cause){setError(reportVeterinaryError('financialFlow.load',cause,'No se pudo cargar el flujo financiero veterinario.'));}
    finally{if(!silent)setLoading(false);}
  }

  useEffect(()=>{void load();},[selectedPatient?.id]);

  function updateLine(key,patch){setLines((current)=>current.map((line)=>line._key===key?{...line,...patch}:line));}
  function removeLine(key){setLines((current)=>current.length===1?current:current.filter((line)=>line._key!==key));}
  function addLine(kind){setLines((current)=>[...current,kind==='product'?emptyProductLine():emptyServiceLine()]);}

  async function createEstimate(event){
    event.preventDefault();
    if(!selectedPatient?.id)return;
    const payloadLines=lines.map((line)=>line.kind==='product'
      ? {kind:'product',productId:line.productId,quantity:line.quantity}
      : {kind:'service',description:line.description,quantity:line.quantity,unitPrice:line.unitPrice,taxRate:line.taxRate});
    if(payloadLines.some((line)=>line.kind==='product'&&!line.productId))return setError('Selecciona el producto en todas las líneas de producto.');
    if(payloadLines.some((line)=>line.kind==='service'&&!String(line.description||'').trim()))return setError('Cada servicio requiere descripción.');
    setBusy(true);setError('');
    try{
      await VeterinaryService.createFinancialCase({patientId:selectedPatient.id,currency:'VES',lines:payloadLines});
      setLines([emptyServiceLine()]);
      await load({silent:true});
    }catch(cause){setError(reportVeterinaryError('financialFlow.createEstimate',cause,'No se pudo guardar la estimación.'));}
    finally{setBusy(false);}
  }

  async function authorize(){
    if(!authTarget||!signerName.trim()||!attestation)return;
    setBusy(true);setError('');
    try{
      await VeterinaryService.authorizeFinancialCase(authTarget.id,{
        signerName:signerName.trim(),
        attestation:true,
        authorizationText:authorizationText.trim()
      });
      setAuthTarget(null);setSignerName('');setAttestation(false);
      await load({silent:true});
    }catch(cause){setError(reportVeterinaryError('financialFlow.authorize',cause,'No se pudo autorizar la estimación.'));}
    finally{setBusy(false);}
  }

  async function attend(){
    if(!careTarget||!careSourceId)return;
    setBusy(true);setError('');
    try{
      await VeterinaryService.attendFinancialCase(careTarget.id,careType==='encounter'
        ? {careEncounterId:careSourceId,hospitalizationId:null}
        : {careEncounterId:null,hospitalizationId:careSourceId});
      setCareTarget(null);setCareSourceId('');
      await load({silent:true});
    }catch(cause){setError(reportVeterinaryError('financialFlow.attend',cause,'No se pudo vincular la atención clínica.'));}
    finally{setBusy(false);}
  }

  async function openInvoice(financialCase){
    setBusy(true);setError('');
    try{
      const response=await VeterinaryService.financialConsumptions(financialCase.id);
      const rows=Array.isArray(response)?response:response?.data||[];
      setConsumptions(rows);
      setSelectedMovementIds(rows.filter((item)=>item.billable).map((item)=>item.id));
      setInvoiceTarget(financialCase);
    }catch(cause){setError(reportVeterinaryError('financialFlow.loadConsumptions',cause,'No se pudieron cargar los consumos reales.'));}
    finally{setBusy(false);}
  }

  async function invoice(){
    if(!invoiceTarget)return;
    setBusy(true);setError('');
    try{
      await VeterinaryService.invoiceFinancialCase(invoiceTarget.id,{inventoryMovementIds:selectedMovementIds});
      setInvoiceTarget(null);setConsumptions([]);setSelectedMovementIds([]);
      await load({silent:true});
    }catch(cause){setError(reportVeterinaryError('financialFlow.invoiceDraft',cause,'No se pudo crear la factura borrador.'));}
    finally{setBusy(false);}
  }

  if(!selectedPatient){
    return <Paper variant="outlined" sx={{p:2}}><Typography variant="h6">Flujo financiero veterinario</Typography><Typography variant="body2" color="text.secondary">Selecciona una mascota para gestionar Estimación → autorización → atención → consumos → factura.</Typography></Paper>;
  }

  return <Stack gap={1.5}>
    <Paper variant="outlined" sx={{p:1.5}}>
      <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
        <Box>
          <Typography variant="h6">Flujo financiero · {selectedPatient.displayName}</Typography>
          <Typography variant="caption" color="text.secondary">Estimación → autorización → atención → Consumos reales → factura borrador. No contabiliza ni emite automáticamente.</Typography>
        </Box>
        <Button variant="outlined" onClick={()=>void load()} disabled={loading||busy}>{loading?'Actualizando…':'Actualizar'}</Button>
      </Stack>
      {error?<Alert severity="error" sx={{mt:1}} action={<Button color="inherit" size="small" onClick={()=>void load()}>Reintentar</Button>}>{error}</Alert>:null}
      {loading?<Box sx={{py:3,textAlign:'center'}}><CircularProgress size={28}/></Box>:null}
    </Paper>

    <Paper component="form" onSubmit={createEstimate} variant="outlined" sx={{p:1.5}}>
      <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
        <Box><Typography variant="h6">Nueva Estimación</Typography><Typography variant="caption" color="text.secondary">Los productos toman precio e impuesto del catálogo server-side. La vista previa no es autoridad financiera.</Typography></Box>
        <Typography variant="h6">{money(estimatedPreview)}</Typography>
      </Stack>
      <Stack gap={1} mt={1.2}>
        {lines.map((line,index)=><Paper key={line._key} variant="outlined" sx={{p:1}}>
          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'140px minmax(180px,1fr) 100px 130px 110px auto'},gap:.8,alignItems:'center'}}>
            <TextField select label="Tipo" value={line.kind} onChange={(e)=>updateLine(line._key,e.target.value==='product'?{...emptyProductLine(),_key:line._key}:{...emptyServiceLine(),_key:line._key})}>
              <MenuItem value="service">Servicio</MenuItem><MenuItem value="product">Producto estimado</MenuItem>
            </TextField>
            {line.kind==='product'
              ? <TextField select label="Producto" value={line.productId} onChange={(e)=>updateLine(line._key,{productId:e.target.value})}>{products.map((product)=><MenuItem key={product.id} value={product.id}>{product.name} · {money(product.price)}</MenuItem>)}</TextField>
              : <TextField label="Descripción" value={line.description} onChange={(e)=>updateLine(line._key,{description:e.target.value})}/>}
            <TextField label="Cantidad" type="number" inputProps={{min:.001,step:.001}} value={line.quantity} onChange={(e)=>updateLine(line._key,{quantity:e.target.value})}/>
            {line.kind==='service'?<TextField label="Precio unit." type="number" inputProps={{min:0,step:.01}} value={line.unitPrice} onChange={(e)=>updateLine(line._key,{unitPrice:e.target.value})}/>:<TextField label="Precio" value={money(products.find((p)=>p.id===line.productId)?.price||0)} disabled/>}
            {line.kind==='service'?<TextField label="IVA %" type="number" inputProps={{min:0,step:.01}} value={line.taxRate} onChange={(e)=>updateLine(line._key,{taxRate:e.target.value})}/>:<TextField label="IVA" value={products.find((p)=>p.id===line.productId)?.taxRate||'—'} disabled/>}
            <Button color="error" variant="outlined" disabled={lines.length===1} onClick={()=>removeLine(line._key)}>Quitar</Button>
          </Box>
          <Typography variant="caption" color="text.secondary">Línea {index+1} · {line.kind==='product'?'Producto: el servidor fija precio/impuesto.':'Servicio: monto estimativo que será recalculado server-side.'}</Typography>
        </Paper>)}
      </Stack>
      <Stack direction="row" gap={0.7} mt={1.2} flexWrap="wrap">
        <Button type="button" variant="outlined" onClick={()=>addLine('service')}>Agregar servicio</Button>
        <Button type="button" variant="outlined" onClick={()=>addLine('product')}>Agregar producto</Button>
        <Button type="submit" disabled={busy}>Guardar estimación</Button>
      </Stack>
    </Paper>

    <Paper variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Casos financieros</Typography>
      <Typography variant="caption" color="text.secondary">Cada transición conserva provenance entre Salud, Inventario y Ventas.</Typography>
      <TableContainer sx={{mt:1}}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Estimado</TableCell><TableCell>Estado</TableCell><TableCell>Autorización</TableCell><TableCell>Factura</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead>
          <TableBody>
            {cases.map((item)=><TableRow key={item.id} hover>
              <TableCell>{new Date(item.createdAt).toLocaleDateString('es-VE')}</TableCell>
              <TableCell>{money(item.estimatedTotal)}</TableCell>
              <TableCell><Chip size="small" label={statusLabel[item.status]||item.status} color={statusColor[item.status]||'default'}/></TableCell>
              <TableCell>{item.authorizationSigner||'—'}</TableCell>
              <TableCell>{item.invoiceNumber?<><b>{item.invoiceNumber}</b><Typography variant="caption" display="block">{item.invoiceStatus} · {money(item.invoiceTotal)}</Typography></>:'—'}</TableCell>
              <TableCell align="right"><Stack direction="row" gap=.5 justifyContent="flex-end" flexWrap="wrap">
                {item.status==='proposed'?<Button size="small" onClick={()=>{setAuthTarget(item);setSignerName(item.guardianName||'');setAttestation(false);}}>Autorizar</Button>:null}
                {item.status==='authorized'?<Button size="small" variant="outlined" onClick={()=>{setCareTarget(item);setCareType('encounter');setCareSourceId('');}}>Registrar atención</Button>:null}
                {item.status==='attended'?<Button size="small" variant="outlined" onClick={()=>void openInvoice(item)}>Crear factura borrador</Button>:null}
              </Stack></TableCell>
            </TableRow>)}
            {!cases.length&&!loading?<TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Sin casos financieros para esta mascota.</Typography></TableCell></TableRow>:null}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>

    <Dialog open={Boolean(authTarget)} onClose={()=>!busy&&setAuthTarget(null)} fullWidth maxWidth="sm">
      <DialogTitle>Autorizar estimación</DialogTitle>
      <DialogContent><Stack gap={1.2} pt={1}>
        <Alert severity="info">La autorización crea un CareConsent firmado y vinculado al hash de la estimación. No ejecuta atención ni factura.</Alert>
        <TextField label="Firmante" required value={signerName} onChange={(e)=>setSignerName(e.target.value)}/>
        <TextField label="Texto de autorización" multiline minRows={4} required value={authorizationText} onChange={(e)=>setAuthorizationText(e.target.value)}/>
        <FormControlLabel control={<Checkbox checked={attestation} onChange={(e)=>setAttestation(e.target.checked)}/>} label="Confirmo la autorización expresa de esta estimación."/>
      </Stack></DialogContent>
      <DialogActions><Button onClick={()=>setAuthTarget(null)} disabled={busy}>Cancelar</Button><Button onClick={()=>void authorize()} disabled={busy||!signerName.trim()||!attestation}>Autorizar</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(careTarget)} onClose={()=>!busy&&setCareTarget(null)} fullWidth maxWidth="sm">
      <DialogTitle>Vincular atención clínica</DialogTitle>
      <DialogContent><Stack gap={1.2} pt={1}>
        <Alert severity="info">La atención clínica sigue perteneciendo a CareEncounter/CareHospitalization; el caso financiero sólo conserva el vínculo.</Alert>
        <TextField select label="Fuente clínica" value={careType} onChange={(e)=>{setCareType(e.target.value);setCareSourceId('');}}>
          <MenuItem value="encounter">Consulta firmada</MenuItem><MenuItem value="hospitalization">Hospitalización</MenuItem>
        </TextField>
        <TextField select label={careType==='encounter'?'Consulta':'Hospitalización'} value={careSourceId} onChange={(e)=>setCareSourceId(e.target.value)}>
          {(careType==='encounter'?signedEncounters:activeHospitalizations).map((item)=><MenuItem key={item.id} value={item.id}>{careType==='encounter'?`${new Date(item.createdAt).toLocaleDateString('es-VE')} · ${item.specialty||item.type}`:`${item.admissionNumber||item.id.slice(0,8)} · ${item.status}`}</MenuItem>)}
        </TextField>
      </Stack></DialogContent>
      <DialogActions><Button onClick={()=>setCareTarget(null)} disabled={busy}>Cancelar</Button><Button onClick={()=>void attend()} disabled={busy||!careSourceId}>Atención registrada</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(invoiceTarget)} onClose={()=>!busy&&setInvoiceTarget(null)} fullWidth maxWidth="md">
      <DialogTitle>Crear factura borrador</DialogTitle>
      <DialogContent><Stack gap={1.2} pt={1}>
        <Alert severity="warning">No contabiliza, no emite y no crea asientos. La factura draft usa servicios autorizados y sólo los Consumos reales que selecciones.</Alert>
        <Typography variant="subtitle2">Consumos reales</Typography>
        {consumptions.length?consumptions.map((item)=><Paper key={item.id} variant="outlined" sx={{p:1}}>
          <FormControlLabel
            control={<Checkbox disabled={!item.billable} checked={selectedMovementIds.includes(item.id)} onChange={(e)=>setSelectedMovementIds((current)=>e.target.checked?[...new Set([...current,item.id])]:current.filter((id)=>id!==item.id))}/>}
            label={`${item.productName} · ${item.quantity} ${item.unit||''} · Lote ${item.lotNumber||'—'} · ${money(Number(item.quantity||0)*Number(item.unitPrice||0))}${item.billable?'':' · ya vinculado'}`}
          />
        </Paper>):<Alert severity="info">No hay consumos de inventario elegibles. Si la estimación contiene servicios, todavía puede crearse un borrador sólo con esos servicios.</Alert>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={()=>setInvoiceTarget(null)} disabled={busy}>Cancelar</Button><Button onClick={()=>void invoice()} disabled={busy}>Crear factura borrador</Button></DialogActions>
    </Dialog>
  </Stack>;
}
