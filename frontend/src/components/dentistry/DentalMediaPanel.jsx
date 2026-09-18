import React, { useMemo, useRef, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgDataTable, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField
} from '../ui/cg/CgPrimitives.jsx';
import { PERMANENT_TEETH, PRIMARY_TEETH } from './dentalCatalog.js';

const ALL_TEETH=[...PERMANENT_TEETH,...PRIMARY_TEETH];
const KIND_OPTIONS=[
  {value:'radiograph',label:'Radiografía'},
  {value:'clinical-photo',label:'Foto clínica'},
  {value:'study',label:'Estudio / informe'},
  {value:'document',label:'Documento'}
];
const kindLabel=(kind)=>KIND_OPTIONS.find((item)=>item.value===kind)?.label||kind||'Documento';
const fmtBytes=(value)=>{
  const bytes=Number(value||0);
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
};

export function DentalMediaPanel({
  selectedPatientId,
  onPatientChange,
  patientOptions,
  encounters,
  dentalAttachments=[],
  onUpload
}){
  const inputRef=useRef(null);
  const [kind,setKind]=useState('radiograph');
  const [title,setTitle]=useState('');
  const [tooth,setTooth]=useState('');
  const [linkedEncounterId,setLinkedEncounterId]=useState('');
  const [treatmentPlanEncounterId,setTreatmentPlanEncounterId]=useState('');
  const [notes,setNotes]=useState('');
  const [file,setFile]=useState(null);
  const [saving,setSaving]=useState(false);

  const relatedEncounters=useMemo(()=>encounters
    .filter((item)=>item.type!=='dental-attachment')
    .slice(0,100),[encounters]);

  const acceptedOrProposedPlans=useMemo(()=>encounters
    .filter((item)=>item.type==='dental-treatment-plan')
    .slice(0,50),[encounters]);

  const encounterOptions=useMemo(()=>[
    {value:'',label:'Sin encuentro relacionado'},
    ...relatedEncounters.map((item)=>({
      value:item.id,
      label:`${item.type||'encuentro'} · ${new Date(item.createdAt||Date.now()).toLocaleDateString('es-VE')}`
    }))
  ],[relatedEncounters]);

  const planOptions=useMemo(()=>[
    {value:'',label:'Sin plan relacionado'},
    ...acceptedOrProposedPlans.map((item)=>({
      value:item.id,
      label:`${item.clinicalData?.treatmentPlan?.diagnosis||'Plan odontológico'} · ${item.status||'draft'}`
    }))
  ],[acceptedOrProposedPlans]);

  function reset(){
    setKind('radiograph');
    setTitle('');
    setTooth('');
    setLinkedEncounterId('');
    setTreatmentPlanEncounterId('');
    setNotes('');
    setFile(null);
    if(inputRef.current)inputRef.current.value='';
  }

  async function submit(event){
    event.preventDefault();
    if(!selectedPatientId||!file||!title.trim())return;
    setSaving(true);
    try{
      const result=await onUpload?.({
        patientId:selectedPatientId,
        file,
        kind,
        title:title.trim(),
        tooth:tooth||null,
        linkedEncounterId:linkedEncounterId||null,
        treatmentPlanEncounterId:treatmentPlanEncounterId||null,
        notes:notes.trim()||null
      });
      if(result!==false)reset();
    }finally{setSaving(false);}
  }

  const columns=[
    {key:'preview',label:'Archivo',render:(row)=>{
      const media=row.clinicalData?.dentalAttachment||{};
      const image=String(media.mimeType||'').startsWith('image/');
      return <Stack direction="row" gap={1} alignItems="center">
        {image&&row.signedUrl?<Box component="img" src={row.signedUrl} alt={media.title||media.originalName||'Adjunto clínico'} sx={{width:56,height:56,objectFit:'cover',borderRadius:1,border:'1px solid',borderColor:'divider'}}/>:null}
        <Box><Typography variant="body2" fontWeight={650}>{media.title||media.originalName||'Archivo clínico'}</Typography><Typography variant="caption" color="text.secondary">{media.originalName||'—'} · {fmtBytes(media.bytes)}</Typography></Box>
      </Stack>;
    }},
    {key:'kind',label:'Tipo',render:(row)=>{const media=row.clinicalData?.dentalAttachment||{};return <Box><CgStatusChip size="small" label={kindLabel(media.kind)} tone="primary"/><Typography variant="caption" display="block" color="text.secondary">{media.tooth?`Pieza ${media.tooth}`:'Sin pieza'}</Typography></Box>;}},
    {key:'links',label:'Relaciones',render:(row)=>{const media=row.clinicalData?.dentalAttachment||{};return <Stack><Typography variant="caption">Encuentro: {media.linkedEncounterId||'—'}</Typography><Typography variant="caption">Plan: {media.treatmentPlanEncounterId||'—'}</Typography></Stack>;}},
    {key:'integrity',label:'SHA-256',render:(row)=>{const media=row.clinicalData?.dentalAttachment||{};return <Typography variant="caption" sx={{fontFamily:'monospace'}}>{media.sha256?String(media.sha256).slice(0,16)+'…':'—'}</Typography>;}},
    {key:'date',label:'Carga',render:(row)=>{const media=row.clinicalData?.dentalAttachment||{};return <Typography variant="caption">{media.uploadedAt?new Date(media.uploadedAt).toLocaleString('es-VE'):'—'}</Typography>;}},
    {key:'actions',label:'Acciones',render:(row)=>row.signedUrl?<CgButton component="a" href={row.signedUrl} target="_blank" rel="noopener noreferrer" size="small" variant="outlined">Abrir archivo</CgButton>:<CgStatusChip size="small" label="URL no disponible" tone="warning"/>}
  ];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box>
        <Typography variant="h6">Imágenes y documentos clínicos</Typography>
        <Typography variant="caption" color="text.secondary">Radiografías, fotos, estudios e informes privados; cada archivo queda ligado a un encuentro clínico firmado.</Typography>
      </Box>
      <CgStatusChip label={dentalAttachments.length?`${dentalAttachments.length} archivo(s)`:'Sin archivos'} tone={dentalAttachments.length?'primary':'default'}/>
    </Stack>
    <Divider sx={{my:1.2}}/>
    <CgState severity="info" title="Almacenamiento clínico privado">JPEG, PNG, WebP o PDF hasta 15 MB. El servidor valida la firma binaria, calcula SHA-256 y entrega URLs temporales; el adjunto clínico firmado no se elimina desde el endpoint multimedia genérico.</CgState>

    <Box component="form" onSubmit={submit} sx={{mt:1.2}}>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>
        <CgSelect label="Paciente" value={selectedPatientId} onChange={(e)=>onPatientChange?.(e.target.value)} options={patientOptions}/>
        <CgSelect label="Tipo" value={kind} onChange={(e)=>setKind(e.target.value)} options={KIND_OPTIONS}/>
        <CgTextField label="Título" required value={title} onChange={(e)=>setTitle(e.target.value)}/>
        <CgSelect label="Pieza" value={tooth} onChange={(e)=>setTooth(e.target.value)} options={[{value:'',label:'Sin pieza específica'},...ALL_TEETH.map((value)=>({value,label:value}))]}/>
        <CgSelect label="Encuentro relacionado" value={linkedEncounterId} onChange={(e)=>setLinkedEncounterId(e.target.value)} options={encounterOptions}/>
        <CgSelect label="Plan relacionado" value={treatmentPlanEncounterId} onChange={(e)=>setTreatmentPlanEncounterId(e.target.value)} options={planOptions}/>
      </Box>
      <CgTextField fullWidth multiline minRows={2} label="Notas" value={notes} onChange={(e)=>setNotes(e.target.value)} sx={{mt:1}}/>
      <Stack direction={{xs:'column',sm:'row'}} gap={1} alignItems={{sm:'center'}} mt={1}>
        <CgButton type="button" variant="outlined" component="label">
          Seleccionar archivo
          <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e)=>setFile(e.target.files?.[0]||null)}/>
        </CgButton>
        <Typography variant="caption" color="text.secondary">{file?`${file.name} · ${fmtBytes(file.size)}`:'Ningún archivo seleccionado'}</Typography>
        <CgButton type="submit" disabled={!selectedPatientId||!file||!title.trim()||saving}>{saving?'Subiendo…':'Guardar adjunto clínico'}</CgButton>
      </Stack>
    </Box>

    <Divider sx={{my:1.5}}/>
    <Typography variant="h6">Archivo clínico del paciente</Typography>
    <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}>
      {dentalAttachments.length?<CgDataTable columns={columns} rows={dentalAttachments} empty="Sin archivos clínicos"/>:<CgEmptyState title="Sin imágenes ni documentos" description="Sube una radiografía, foto, estudio, informe o documento para iniciar el archivo clínico."/>}
    </Box>
  </Paper>;
}
