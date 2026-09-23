import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Divider, MenuItem, Paper, Stack, TextField, Typography
} from '@mui/material';
import { toast } from 'react-hot-toast';
import { VeterinaryService } from '../../services/verticalService.js';

const statusOf=(grant)=>{
  if(grant?.revokedAt)return'revoked';
  if(grant?.expiresAt&&new Date(grant.expiresAt)<=new Date())return'expired';
  return'active';
};
const statusLabel={active:'Activo',revoked:'Revocado',expired:'Vencido'};

export function VeterinaryGuardianPortalPanel({ selectedPatient, onCommunicationCreated }) {
  const [grants,setGrants]=useState([]);
  const [loading,setLoading]=useState(false);
  const [expiresInDays,setExpiresInDays]=useState('30');
  const [latestLink,setLatestLink]=useState('');
  const [message,setMessage]=useState({channel:'whatsapp',event:'general_update',recipient:'',guardianText:''});

  const patientId=selectedPatient?.id||'';
  const defaultRecipient=useMemo(()=>{
    if(message.channel==='email')return selectedPatient?.guardianEmail||'';
    return selectedPatient?.guardianPhone||'';
  },[message.channel,selectedPatient?.guardianEmail,selectedPatient?.guardianPhone]);

  useEffect(()=>{
    setLatestLink('');
    setMessage((current)=>({...current,recipient:current.channel==='email'?(selectedPatient?.guardianEmail||''):(selectedPatient?.guardianPhone||'')}));
    if(!patientId){setGrants([]);return;}
    let active=true;
    setLoading(true);
    VeterinaryService.guardianPortalGrants(patientId)
      .then((rows)=>{if(active)setGrants(Array.isArray(rows)?rows:[]);})
      .catch((error)=>{if(active)toast.error(error?.message||'No se cargaron los accesos del tutor.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[patientId]);

  async function reload(){
    if(!patientId)return;
    const rows=await VeterinaryService.guardianPortalGrants(patientId);
    setGrants(Array.isArray(rows)?rows:[]);
  }

  async function createGrant(){
    if(!patientId)return toast.error('Selecciona una mascota.');
    setLoading(true);
    try{
      const grant=await VeterinaryService.createGuardianPortalGrant({patientId,expiresInDays:Number(expiresInDays||30)});
      const url=new URL(grant.portalPath,window.location.origin).toString();
      setLatestLink(url);
      await reload();
      toast.success('Enlace temporal creado. Los enlaces activos anteriores quedaron revocados.');
    }catch(error){toast.error(error?.message||'No se pudo crear el acceso del tutor.');}
    finally{setLoading(false);}
  }

  async function copyLink(){
    if(!latestLink)return;
    try{await navigator.clipboard.writeText(latestLink);toast.success('Enlace copiado.');}
    catch{toast.error('No se pudo copiar. Selecciona el enlace manualmente.');}
  }

  async function revokeGrant(id){
    setLoading(true);
    try{await VeterinaryService.revokeGuardianPortalGrant(id);setLatestLink('');await reload();toast.success('Acceso revocado.');}
    catch(error){toast.error(error?.message||'No se pudo revocar el acceso.');}
    finally{setLoading(false);}
  }

  async function registerCommunication(event){
    event.preventDefault();
    if(!patientId)return toast.error('Selecciona una mascota.');
    const recipient=(message.recipient||defaultRecipient||'').trim();
    const guardianText=message.guardianText.trim();
    if(!recipient)return toast.error('Indica el destinatario.');
    if(!guardianText)return toast.error('Escribe el mensaje visible para el tutor.');
    setLoading(true);
    try{
      await VeterinaryService.createCommunication({
        patientId,
        channel:message.channel,
        event:message.event,
        recipient,
        status:'queued',
        payload:{guardianText,source:'guardian-portal-admin.v1'}
      });
      setMessage((current)=>({...current,guardianText:''}));
      await onCommunicationCreated?.();
      toast.success('Comunicación registrada y visible en el portal; permanece en cola hasta que el proveedor confirme envío.');
    }catch(error){toast.error(error?.message||'No se pudo registrar la comunicación.');}
    finally{setLoading(false);}
  }

  if(!selectedPatient)return <Alert severity="info">Selecciona una mascota para administrar el portal de su tutor.</Alert>;

  return <Stack gap={1.4}>
    <Paper variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Portal del tutor</Typography>
      <Typography variant="body2" color="text.secondary">Enlace temporal de solo lectura para citas, alta, documentos, facturación y comunicaciones de {selectedPatient.displayName}.</Typography>
      <Stack direction={{xs:'column',sm:'row'}} gap={1} mt={1.3} alignItems={{sm:'end'}}>
        <TextField select size="small" label="Vigencia" value={expiresInDays} onChange={(e)=>setExpiresInDays(e.target.value)} sx={{minWidth:180}}>
          <MenuItem value="7">7 días</MenuItem><MenuItem value="30">30 días</MenuItem><MenuItem value="60">60 días</MenuItem><MenuItem value="90">90 días</MenuItem>
        </TextField>
        <Button variant="contained" onClick={()=>void createGrant()} disabled={loading}>Crear nuevo enlace</Button>
      </Stack>
      <Alert severity="warning" sx={{mt:1}}>El token se muestra sólo al crearlo. ContaGest persiste únicamente su SHA-256; crear uno nuevo revoca los enlaces activos anteriores.</Alert>
      {latestLink?<Stack direction={{xs:'column',sm:'row'}} gap={1} mt={1.2}><TextField fullWidth size="small" label="Enlace recién creado" value={latestLink} InputProps={{readOnly:true}}/><Button variant="outlined" onClick={()=>void copyLink()}>Copiar</Button></Stack>:null}
      <Divider sx={{my:1.3}}/>
      <Stack gap={.7}>
        {grants.length?grants.map((grant)=>{
          const status=statusOf(grant);
          return <Paper key={grant.id} variant="outlined" sx={{p:1,display:'grid',gridTemplateColumns:{xs:'1fr',sm:'minmax(0,1fr) auto'},gap:1,alignItems:'center'}}>
            <Box><Typography variant="body2" fontWeight={700}>{statusLabel[status]}</Typography><Typography variant="caption" color="text.secondary">Creado {new Date(grant.createdAt).toLocaleString('es-VE')} · vence {new Date(grant.expiresAt).toLocaleString('es-VE')}{grant.lastUsedAt?` · último acceso ${new Date(grant.lastUsedAt).toLocaleString('es-VE')}`:''}</Typography></Box>
            <Button size="small" color="error" variant="outlined" disabled={status!=='active'||loading} onClick={()=>void revokeGrant(grant.id)}>Revocar</Button>
          </Paper>;
        }):<Typography variant="body2" color="text.secondary">No hay accesos creados.</Typography>}
      </Stack>
    </Paper>

    <Paper component="form" onSubmit={registerCommunication} variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Comunicación visible al tutor</Typography>
      <Typography variant="body2" color="text.secondary">Registra el mensaje y su canal. El portal sólo muestra guardianText; no expone el payload interno completo.</Typography>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:1,mt:1.2}}>
        <TextField select size="small" label="Canal" value={message.channel} onChange={(e)=>setMessage({...message,channel:e.target.value,recipient:e.target.value==='email'?(selectedPatient.guardianEmail||''):(selectedPatient.guardianPhone||'')})}>
          <MenuItem value="whatsapp">WhatsApp</MenuItem><MenuItem value="email">Correo</MenuItem><MenuItem value="sms">SMS</MenuItem>
        </TextField>
        <TextField select size="small" label="Evento" value={message.event} onChange={(e)=>setMessage({...message,event:e.target.value})}>
          <MenuItem value="appointment_reminder">Recordatorio de cita</MenuItem><MenuItem value="discharge_ready">Alta disponible</MenuItem><MenuItem value="document_ready">Documento disponible</MenuItem><MenuItem value="invoice_ready">Factura disponible</MenuItem><MenuItem value="general_update">Actualización general</MenuItem>
        </TextField>
        <TextField size="small" label="Destinatario" value={message.recipient||defaultRecipient} onChange={(e)=>setMessage({...message,recipient:e.target.value})}/>
        <TextField size="small" label="Mensaje para el tutor" multiline minRows={3} value={message.guardianText} onChange={(e)=>setMessage({...message,guardianText:e.target.value})} sx={{gridColumn:{sm:'1/-1'}}}/>
      </Box>
      <Button type="submit" sx={{mt:1.2}} disabled={loading}>Registrar comunicación</Button>
    </Paper>
  </Stack>;
}
