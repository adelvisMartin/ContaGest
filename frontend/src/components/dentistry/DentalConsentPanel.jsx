import React, { useEffect, useMemo, useState } from 'react';
import { Box, Checkbox, Divider, FormControlLabel, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgDialog, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField
} from '../ui/cg/CgPrimitives.jsx';

const DEFAULT_CONSENT_TEXT='Declaro que recibí explicación del diagnóstico, las alternativas, los beneficios y riesgos relevantes del plan de tratamiento seleccionado; tuve oportunidad de realizar preguntas y manifiesto mi consentimiento para el plan descrito.';

const statusTone=(status)=>status==='signed'?'success':status==='revoked'?'error':'warning';
const statusLabel=(status)=>status==='signed'?'Firmado':status==='revoked'?'Revocado':status==='expired'?'Expirado':'Pendiente';

export function DentalConsentPanel({
  selectedPatientId,
  onPatientChange,
  patientOptions,
  encounters,
  consents,
  onSign,
  onRevoke
}){
  const [treatmentPlanEncounterId,setTreatmentPlanEncounterId]=useState('');
  const [signerName,setSignerName]=useState('');
  const [signerRole,setSignerRole]=useState('patient');
  const [consentText,setConsentText]=useState(DEFAULT_CONSENT_TEXT);
  const [documentUrl,setDocumentUrl]=useState('');
  const [attestation,setAttestation]=useState(false);
  const [saving,setSaving]=useState(false);
  const [revocationTarget,setRevocationTarget]=useState(null);
  const [revocationReason,setRevocationReason]=useState('');

  const acceptedPlans=useMemo(()=>encounters
    .filter((item)=>{
      const plan=item.clinicalData?.treatmentPlan;
      return item.type==='dental-treatment-plan'
        && item.status==='signed'
        && plan?.status==='accepted'
        && plan?.acceptance?.status==='accepted';
    })
    .sort((left,right)=>new Date(right.createdAt||0)-new Date(left.createdAt||0)),[encounters]);

  const dentalConsents=useMemo(()=>consents
    .filter((item)=>item.kind==='dental-treatment-consent')
    .sort((left,right)=>new Date(right.createdAt||0)-new Date(left.createdAt||0)),[consents]);

  const planOptions=useMemo(()=>[
    {value:'',label:'Seleccionar plan aceptado'},
    ...acceptedPlans.map((item)=>{
      const plan=item.clinicalData?.treatmentPlan||{};
      const total=plan.budget?.estimatedTotal||'0.00';
      const currency=plan.budget?.currency||'VES';
      return {value:item.id,label:`${plan.diagnosis||'Plan odontológico'} · ${currency} ${total}`};
    })
  ],[acceptedPlans]);

  const selectedPlan=useMemo(()=>acceptedPlans.find((item)=>item.id===treatmentPlanEncounterId)||null,[acceptedPlans,treatmentPlanEncounterId]);

  useEffect(()=>{
    setTreatmentPlanEncounterId('');
    setSignerName('');
    setSignerRole('patient');
    setConsentText(DEFAULT_CONSENT_TEXT);
    setDocumentUrl('');
    setAttestation(false);
  },[selectedPatientId]);

  async function submit(event){
    event.preventDefault();
    if(!selectedPatientId||!treatmentPlanEncounterId||!signerName.trim()||!attestation||consentText.trim().length<20)return;
    setSaving(true);
    try{
      const created=await onSign?.({
        patientId:selectedPatientId,
        treatmentPlanEncounterId,
        signerName:signerName.trim(),
        signerRole,
        attestation:true,
        consentText:consentText.trim(),
        documentUrl:documentUrl.trim()||null
      });
      if(created!==false){
        setSignerName('');
        setSignerRole('patient');
        setDocumentUrl('');
        setAttestation(false);
      }
    }finally{setSaving(false);}
  }

  async function confirmRevocation(){
    if(!revocationTarget||revocationReason.trim().length<5)return;
    const result=await onRevoke?.(revocationTarget.id,{reason:revocationReason.trim()});
    if(result!==false){
      setRevocationTarget(null);
      setRevocationReason('');
    }
  }

  const columns=[
    {key:'revision',label:'Revisión',render:(row)=>`v${row.metadata?.revision||1}`},
    {key:'signedAt',label:'Firma',render:(row)=><Box><Typography variant="body2">{row.signerName||'—'}</Typography><Typography variant="caption" color="text.secondary">{row.signedAt?new Date(row.signedAt).toLocaleString('es-VE'):'—'}</Typography></Box>},
    {key:'plan',label:'Plan vinculado',render:(row)=><Typography variant="caption">{row.metadata?.treatmentPlanEncounterId||'—'}</Typography>},
    {key:'hash',label:'SHA-256',render:(row)=><Typography variant="caption" sx={{fontFamily:'monospace'}}>{row.metadata?.consentSha256?String(row.metadata.consentSha256).slice(0,16)+'…':'—'}</Typography>},
    {key:'status',label:'Estado',render:(row)=><CgStatusChip size="small" label={statusLabel(row.status)} tone={statusTone(row.status)}/>},
    {key:'actions',label:'Acciones',render:(row)=>row.status==='signed'?<CgButton size="small" variant="outlined" color="error" onClick={()=>{setRevocationTarget(row);setRevocationReason('');}}>Revocar consentimiento</CgButton>:null}
  ];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Consentimiento y evidencia</Typography>
        <Typography variant="caption" color="text.secondary">Vincula el consentimiento a un plan aceptado e inmóvil, con revisión e integridad SHA-256.</Typography>
      </Box>
      <CgStatusChip label={dentalConsents.some((item)=>item.status==='signed')?'Consentimiento activo':'Sin consentimiento activo'} tone={dentalConsents.some((item)=>item.status==='signed')?'success':'warning'}/>
    </Stack>
    <Divider sx={{my:1.2}}/>
    <CgState severity="warning" title="Firma declarativa">La evidencia es una atestación tipada y auditada. No es un certificado criptográfico ni sustituye los requisitos legales/profesionales que correspondan al consentimiento de la clínica.</CgState>

    <Box component="form" onSubmit={submit} sx={{mt:1.2}}>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>
        <CgSelect label="Paciente" value={selectedPatientId} onChange={(e)=>onPatientChange?.(e.target.value)} options={patientOptions}/>
        <CgSelect label="Plan de tratamiento aceptado" value={treatmentPlanEncounterId} onChange={(e)=>setTreatmentPlanEncounterId(e.target.value)} options={planOptions}/>
      </Box>

      {selectedPlan?<Paper variant="outlined" sx={{p:1,mt:1}}>
        <Typography variant="subtitle2">Plan vinculado</Typography>
        <Typography variant="body2">{selectedPlan.clinicalData?.treatmentPlan?.diagnosis||'Plan odontológico'}</Typography>
        <Typography variant="caption" color="text.secondary">El servidor comprobará nuevamente que este plan pertenece al paciente, está firmado y continúa aceptado.</Typography>
      </Paper>:null}

      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1,mt:1}}>
        <CgTextField fullWidth label="Nombre del firmante" required value={signerName} onChange={(e)=>setSignerName(e.target.value)}/>
        <CgSelect label="Rol del firmante" value={signerRole} onChange={(e)=>setSignerRole(e.target.value)} options={[
          {value:'patient',label:'Paciente'},
          {value:'guardian',label:'Representante / tutor'},
          {value:'representative',label:'Representante autorizado'}
        ]}/>
      </Box>
      <CgSelect label="Rol del firmante" value={signerRole} onChange={(e)=>setSignerRole(e.target.value)} options={[
        {value:'patient',label:'Paciente'},
        {value:'guardian',label:'Representante / tutor'},
        {value:'representative',label:'Representante autorizado'}
      ]}/>
      <CgTextField fullWidth multiline minRows={5} label="Texto del consentimiento" required value={consentText} onChange={(e)=>setConsentText(e.target.value)} sx={{mt:1}}/>
      <CgTextField fullWidth label="URL de documento firmado externo (opcional)" value={documentUrl} onChange={(e)=>setDocumentUrl(e.target.value)} sx={{mt:1}}/>
      <FormControlLabel
        sx={{mt:.5,alignItems:'flex-start'}}
        control={<Checkbox checked={attestation} onChange={(e)=>setAttestation(e.target.checked)} inputProps={{'aria-label':'Confirmar atestación de consentimiento'}}/>}
        label="Declaro que el nombre ingresado representa mi manifestación expresa sobre el texto mostrado y el plan vinculado."
      />
      <CgButton type="submit" disabled={!selectedPatientId||!treatmentPlanEncounterId||!signerName.trim()||!attestation||saving} sx={{mt:.5}}>
        {saving?'Registrando evidencia…':'Registrar consentimiento firmado'}
      </CgButton>
    </Box>

    <Divider sx={{my:1.5}}/>
    <Typography variant="h6">Historial de consentimientos</Typography>
    <Typography variant="caption" color="text.secondary">Cada nueva firma crea una Revisión nueva; la anterior permanece registrada. Una revisión activa debe revocarse antes de volver a firmar el mismo plan.</Typography>
    <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}>
      {dentalConsents.length?<CgDataTable columns={columns} rows={dentalConsents} empty="Sin consentimientos"/>:<CgEmptyState title="Sin consentimientos odontológicos" description="Acepta un plan de tratamiento y registra luego la evidencia del consentimiento."/>}
    </Box>

    <CgDialog
      open={Boolean(revocationTarget)}
      title="Revocar consentimiento"
      onClose={()=>{setRevocationTarget(null);setRevocationReason('');}}
      confirmLabel="Revocar consentimiento"
      destructive
      onConfirm={()=>void confirmRevocation()}
    >
      <Stack gap={1} pt={1}>
        <CgState severity="warning" title="La firma histórica no se elimina">La revisión quedará con estado Revocado y conservará su texto, hash, actor y fecha de firma. La revocación agregará actor, fecha y motivo.</CgState>
        <CgTextField autoFocus fullWidth multiline minRows={2} label="Motivo de revocación" required value={revocationReason} onChange={(e)=>setRevocationReason(e.target.value)}/>
      </Stack>
    </CgDialog>
  </Paper>;
}
