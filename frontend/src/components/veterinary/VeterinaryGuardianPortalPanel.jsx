import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography
} from '@mui/material';
import { toast } from 'react-hot-toast';
import { VeterinaryService } from '../../services/verticalService.js';
import { reportVeterinaryError } from './veterinaryError.js';

const SCOPE_OPTIONS=[
  ['appointments','Citas'],
  ['reminders','Recordatorios'],
  ['discharge','Alta / estancia'],
  ['documents','Documentos'],
  ['payments','Pagos / facturación'],
  ['communications','Comunicaciones']
];

const statusOf=(grant)=>{
  if(grant?.revokedAt)return'revoked';
  if(grant?.expiresAt&&new Date(grant.expiresAt)<=new Date())return'expired';
  return'active';
};
const statusLabel={active:'Activo',revoked:'Revocado',expired:'Vencido'};

export function VeterinaryGuardianPortalPanel({ selectedPatient, onCommunicationCreated }) {
  const [grants,setGrants]=useState([]);
  const [loading,setLoading]=useState(false);
  const [expiresInHours,setExpiresInHours]=useState('48');
  const [scopes,setScopes]=useState(SCOPE_OPTIONS.map(([value])=>value));
  const [latestGrant,setLatestGrant]=useState(null);
  const [error,setError]=useState('');

  const patientId=selectedPatient?.id||'';
  const active=useMemo(()=>grants.find((grant)=>statusOf(grant)==='active')||null,[grants]);

  async function reload(){
    if(!patientId){setGrants([]);return;}
    const rows=await VeterinaryService.guardianPortalGrants(patientId);
    setGrants(Array.isArray(rows)?rows:rows?.data||[]);
  }

  useEffect(()=>{
    setLatestGrant(null);setError('');
    if(!patientId){setGrants([]);return;}
    let mounted=true;
    setLoading(true);
    VeterinaryService.guardianPortalGrants(patientId)
      .then((rows)=>{if(mounted)setGrants(Array.isArray(rows)?rows:rows?.data||[]);})
      .catch((cause)=>{if(mounted)setError(reportVeterinaryError('guardianPortal.load',cause,'No se cargaron los accesos del tutor.'));})
      .finally(()=>{if(mounted)setLoading(false);});
    return()=>{mounted=false;};
  },[patientId]);

  function toggleScope(scope){
    setScopes((current)=>current.includes(scope)?current.filter((item)=>item!==scope):[...current,scope]);
  }

  async function createGrant(){
    if(!patientId)return toast.error('Selecciona una mascota.');
    if(!scopes.length)return toast.error('Selecciona al menos una sección.');
    setLoading(true);setError('');
    try{
      const grant=await VeterinaryService.createGuardianPortalGrant({
        patientId,
        expiresInHours:Number(expiresInHours||48),
        scopes
      });
      const absoluteUrl=new URL(grant.portalPath,window.location.origin).toString();
      setLatestGrant({...grant,absoluteUrl});
      await reload();
      toast.success(active?'Acceso anterior revocado y nuevo acceso creado.':'Acceso temporal creado.');
    }catch(cause){
      const message=reportVeterinaryError('guardianPortal.issue',cause,'No se pudo crear el acceso del tutor.');
      setError(message);toast.error(message);
    }finally{setLoading(false);}
  }

  async function copyLink(){
    if(!latestGrant?.absoluteUrl)return;
    try{await navigator.clipboard.writeText(latestGrant.absoluteUrl);toast.success('Enlace copiado.');}
    catch{toast.error('No se pudo copiar automáticamente. Selecciona el enlace manualmente.');}
  }

  async function revokeGrant(id){
    setLoading(true);setError('');
    try{
      await VeterinaryService.revokeGuardianPortalGrant(id);
      if(latestGrant?.id===id)setLatestGrant(null);
      await reload();toast.success('Acceso revocado.');
    }catch(cause){
      const message=reportVeterinaryError('guardianPortal.revoke',cause,'No se pudo revocar el acceso.');
      setError(message);toast.error(message);
    }finally{setLoading(false);}
  }

  async function communicate(channel){
    if(!latestGrant?.absoluteUrl||!selectedPatient)return;
    const recipient=channel==='email'?selectedPatient.guardianEmail:selectedPatient.guardianPhone;
    if(!recipient)return toast.error(channel==='email'?'El tutor no tiene correo registrado.':'El tutor no tiene teléfono registrado.');
    try{
      await VeterinaryService.createCommunication({
        patientId,
        channel,
        event:'guardian_portal_access_issued',
        recipient,
        status:'queued',
        payload:{
          grantId:latestGrant.id,
          expiresAt:latestGrant.expiresAt,
          scopes:latestGrant.scopes,
          portalSecretPersisted:false
        }
      });
      await onCommunicationCreated?.();
    }catch(cause){
      reportVeterinaryError('guardianPortal.communicationLog',cause);
    }
    const body=`Hola ${selectedPatient.guardianName||'tutor'}, acceso temporal al portal de ${selectedPatient.displayName}: ${latestGrant.absoluteUrl}`;
    if(channel==='whatsapp'){
      const phone=String(recipient).replace(/\D/g,'');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`,'_blank','noopener,noreferrer');
    }else{
      window.location.href=`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent('Portal veterinario de '+selectedPatient.displayName)}&body=${encodeURIComponent(body)}`;
    }
  }

  if(!selectedPatient)return <Alert severity="info">Selecciona una mascota para administrar el portal de su tutor.</Alert>;

  return <Stack gap={1.4}>
    <Paper variant="outlined" sx={{p:1.5}}>
      <Typography variant="h6">Portal del tutor</Typography>
      <Typography variant="body2" color="text.secondary">Acceso temporal de solo lectura para citas, recordatorios, alta, documentos, pagos y comunicaciones de {selectedPatient.displayName}.</Typography>
      {error?<Alert severity="error" sx={{mt:1}} action={<Button color="inherit" size="small" onClick={()=>void reload()}>Reintentar</Button>}>{error}</Alert>:null}
      <Alert severity="info" sx={{mt:1}}>El secreto se persiste únicamente como SHA-256. El enlace completo se muestra sólo en la respuesta de creación y usa <code>#access</code>, por lo que el token no viaja en la URL HTTP.</Alert>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'200px minmax(0,1fr)'},gap:1.2,mt:1.2}}>
        <TextField select size="small" label="Vigencia" value={expiresInHours} onChange={(e)=>setExpiresInHours(e.target.value)}>
          <MenuItem value="24">24 horas</MenuItem>
          <MenuItem value="48">48 horas</MenuItem>
          <MenuItem value="72">72 horas</MenuItem>
          <MenuItem value="168">7 días</MenuItem>
        </TextField>
        <Box>
          <Typography variant="caption" color="text.secondary">Secciones autorizadas</Typography>
          <Stack direction="row" flexWrap="wrap">
            {SCOPE_OPTIONS.map(([scope,label])=><FormControlLabel key={scope} control={<Checkbox checked={scopes.includes(scope)} onChange={()=>toggleScope(scope)}/>} label={label}/>)}
          </Stack>
        </Box>
      </Box>
      <Button variant="contained" sx={{mt:1}} onClick={()=>void createGrant()} disabled={loading||!scopes.length}>{loading?'Procesando…':active?'Reemplazar acceso activo':'Crear acceso temporal'}</Button>
    </Paper>

    {latestGrant?<Paper variant="outlined" sx={{p:1.5}}>
      <Alert severity="warning">Copia o envía este enlace ahora. ContaGest no puede reconstruir el token desde el hash almacenado.</Alert>
      <TextField fullWidth size="small" label="Enlace recién creado" value={latestGrant.absoluteUrl} InputProps={{readOnly:true}} sx={{mt:1}}/>
      <Stack direction={{xs:'column',sm:'row'}} gap={.8} mt={1}>
        <Button variant="outlined" onClick={()=>void copyLink()}>Copiar enlace</Button>
        <Button variant="outlined" onClick={()=>void communicate('whatsapp')}>Enviar por WhatsApp</Button>
        <Button variant="outlined" onClick={()=>void communicate('email')}>Enviar por correo</Button>
      </Stack>
    </Paper>:null}

    <Paper variant="outlined" sx={{p:1.5}}>
      <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
        <Box><Typography variant="h6">Accesos emitidos</Typography><Typography variant="caption" color="text.secondary">Nunca se lista el token: sólo scopes, vencimiento, uso y estado.</Typography></Box>
        <Button size="small" variant="outlined" onClick={()=>void reload()} disabled={loading}>{loading?'Cargando…':'Actualizar'}</Button>
      </Stack>
      <Stack gap={.7} mt={1}>
        {grants.length?grants.map((grant)=>{
          const status=statusOf(grant);
          return <Paper key={grant.id} variant="outlined" sx={{p:1,display:'grid',gridTemplateColumns:{xs:'1fr',sm:'minmax(0,1fr) auto'},gap:1,alignItems:'center'}}>
            <Box><Typography variant="body2" fontWeight={700}>{statusLabel[status]}</Typography><Typography variant="caption" color="text.secondary">{Array.isArray(grant.scopes)?grant.scopes.join(' · '):'Sin scopes'} · vence {new Date(grant.expiresAt).toLocaleString('es-VE')}{grant.lastUsedAt?` · último acceso ${new Date(grant.lastUsedAt).toLocaleString('es-VE')}`:''}</Typography></Box>
            <Button size="small" color="error" variant="outlined" disabled={status!=='active'||loading} onClick={()=>void revokeGrant(grant.id)}>Revocar</Button>
          </Paper>;
        }):<Typography variant="body2" color="text.secondary">No hay accesos creados.</Typography>}
      </Stack>
    </Paper>
  </Stack>;
}
