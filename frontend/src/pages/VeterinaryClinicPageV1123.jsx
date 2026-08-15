import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, InputAdornment, List, ListItemAvatar, ListItemButton, ListItemText, MenuItem,
  Paper, Stack, TextField, Typography
} from '@mui/material';
import { HealthVerticalService, VeterinaryService } from '../services/verticalService.js';
import { VeterinaryClinicPage as VeterinaryClinicLegacy } from './VeterinaryClinicPage.jsx';

const Icon = ({ name }) => <i className={`fa-solid ${name}`} aria-hidden="true" />;
const rows = (value) => Array.isArray(value) ? value : value?.data || [];
const shortCode = (value) => String(value || '').replaceAll('-', '').slice(0, 8).toUpperCase();
const dateLabel = (value) => value ? new Date(value).toLocaleString('es-VE', { dateStyle:'medium', timeStyle:'short' }) : '—';
const onlyDate = (value) => value ? new Date(value).toLocaleDateString('es-VE') : '—';
const text = (value) => String(value || '').trim();

function KeyValue({ label, value }) {
  return <Box className="cg-vet-fact">
    <Typography variant="caption" sx={{display:'block',color:'var(--cg-text-muted)',fontWeight:600}}>{label}</Typography>
    <Typography variant="body2" sx={{mt:.15,color:'var(--cg-text)',fontWeight:600,overflowWrap:'anywhere'}}>{value || '—'}</Typography>
  </Box>;
}

function TimelineItem({ icon, title, meta, body, tone='var(--cg-primary)' }) {
  return <Box sx={{display:'grid',gridTemplateColumns:'30px minmax(0,1fr)',gap:.9,pb:1,position:'relative'}}>
    <Avatar sx={{width:27,height:27,bgcolor:'var(--cg-surface-soft)',color:tone,border:'1px solid var(--cg-border)',fontSize:11}}><Icon name={icon}/></Avatar>
    <Box sx={{minWidth:0}}>
      <Typography variant="body2" sx={{fontWeight:650,color:'var(--cg-text)'}}>{title}</Typography>
      <Typography variant="caption" sx={{display:'block',color:'var(--cg-text-muted)'}}>{meta}</Typography>
      {body ? <Typography variant="body2" sx={{mt:.35,color:'var(--cg-text-muted)',whiteSpace:'pre-wrap'}}>{body}</Typography> : null}
    </Box>
  </Box>;
}

function VeterinaryDossier({ ctx }) {
  const initialPatient = ctx?.query?.patient || '';
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(initialPatient);
  const [search,setSearch]=useState('');
  const [loading,setLoading]=useState(true);
  const [history,setHistory]=useState({encounters:[],prescriptions:[],labs:[],results:[],studies:[],hospitalizations:[],procedures:[]});
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({});
  const selected=useMemo(()=>patients.find((item)=>item.id===selectedId)||null,[patients,selectedId]);
  const filtered=useMemo(()=>patients.filter((item)=>!search || [item.displayName,item.guardianName,item.microchip,item.species,item.breed].some((value)=>String(value||'').toLowerCase().includes(search.toLowerCase()))),[patients,search]);

  async function loadPatients() {
    setLoading(true);
    try {
      const response=await HealthVerticalService.patients({kind:'animal'});
      const active=rows(response).filter((item)=>item.kind==='animal'&&item.active!==false);
      setPatients(active);
      if (!active.some((item)=>item.id===selectedId)) setSelectedId(active[0]?.id || '');
    } finally { setLoading(false); }
  }

  async function loadHistory(patientId) {
    if (!patientId) return setHistory({encounters:[],prescriptions:[],labs:[],results:[],studies:[],hospitalizations:[],procedures:[]});
    const [encounters,prescriptions,labs,results,studies,hospitalizations,procedures]=await Promise.all([
      HealthVerticalService.encounters(patientId),
      HealthVerticalService.prescriptions(patientId),
      VeterinaryService.labOrders({patientId}),
      VeterinaryService.labResults({patientId}),
      VeterinaryService.studies({patientId}),
      VeterinaryService.hospitalizations({patientId}),
      VeterinaryService.procedures({patientId})
    ]);
    setHistory({encounters:rows(encounters),prescriptions:rows(prescriptions),labs:rows(labs),results:rows(results),studies:rows(studies),hospitalizations:rows(hospitalizations),procedures:rows(procedures)});
  }

  useEffect(()=>{loadPatients().catch(()=>null);},[]);
  useEffect(()=>{loadHistory(selectedId).catch(()=>null);},[selectedId]);

  const timeline=useMemo(()=>[
    ...history.encounters.map((item)=>({date:item.createdAt,icon:'fa-file-waveform',title:item.specialty||'Consulta clínica',meta:`Consulta · ${dateLabel(item.createdAt)} · ${item.professionalName||'Profesional'}`,body:[item.assessment,item.plan].filter(Boolean).join('\n')})),
    ...history.prescriptions.map((item)=>({date:item.createdAt,icon:'fa-pills',title:item.medication||'Tratamiento',meta:`Prescripción · ${dateLabel(item.createdAt)}`,body:[item.dose,item.frequency,item.duration,item.instructions].filter(Boolean).join(' · ')})),
    ...history.labs.map((item)=>({date:item.orderedAt||item.createdAt,icon:'fa-flask-vial',title:item.orderNumber||'Orden de laboratorio',meta:`Laboratorio · ${dateLabel(item.orderedAt||item.createdAt)}`,body:item.notes||''})),
    ...history.studies.map((item)=>({date:item.performedAt||item.scheduledAt||item.createdAt,icon:'fa-x-ray',title:item.title||'Estudio diagnóstico',meta:`Estudio · ${dateLabel(item.performedAt||item.scheduledAt||item.createdAt)}`,body:item.impression||item.findings||''})),
    ...history.hospitalizations.map((item)=>({date:item.admittedAt||item.createdAt,icon:'fa-house-medical',title:item.admissionNumber||'Hospitalización',meta:`Hospitalización · ${dateLabel(item.admittedAt||item.createdAt)}`,body:[item.reason,item.diagnosis].filter(Boolean).join(' · ')})),
    ...history.procedures.map((item)=>({date:item.performedAt||item.scheduledAt||item.createdAt,icon:'fa-stethoscope',title:item.name||'Procedimiento',meta:`Procedimiento · ${dateLabel(item.performedAt||item.scheduledAt||item.createdAt)}`,body:item.outcome||item.notes||''}))
  ].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)),[history]);

  function openEdit() {
    if (!selected) return;
    setForm({
      displayName:selected.displayName||'',species:selected.species||'',breed:selected.breed||'',color:selected.color||'',sex:selected.sex||'',
      birthDate:selected.birthDate?String(selected.birthDate).slice(0,10):'',microchip:selected.microchip||'',guardianName:selected.guardianName||'',
      guardianPhone:selected.guardianPhone||'',guardianEmail:selected.guardianEmail||'',allergies:selected.allergies||'',conditions:selected.conditions||'',notes:selected.notes||''
    });
    setEditing(true);
  }

  async function save() {
    if (!selected) return;
    await HealthVerticalService.updatePatient(selected.id, {
      kind:'animal',displayName:text(form.displayName),species:text(form.species),breed:text(form.breed),color:text(form.color),sex:text(form.sex),
      birthDate:form.birthDate||null,microchip:text(form.microchip),guardianName:text(form.guardianName),guardianPhone:text(form.guardianPhone),
      guardianEmail:text(form.guardianEmail),allergies:text(form.allergies),conditions:text(form.conditions),notes:text(form.notes),active:true
    });
    setEditing(false);
    await loadPatients();
  }

  return <Paper className="cg-vet-dossier" variant="outlined">
    <Stack direction={{xs:'column',sm:'row'}} gap={1} justifyContent="space-between" alignItems={{sm:'center'}} sx={{mb:.8}}>
      <Box>
        <Typography variant="caption" sx={{color:'var(--cg-primary)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em'}}>Expediente rápido</Typography>
        <Typography variant="h6" sx={{fontWeight:700,color:'var(--cg-text)'}}>Ficha e historia médica por mascota</Typography>
        <Typography variant="caption" sx={{color:'var(--cg-text-muted)'}}>Consulta datos, antecedentes y cronología sin salir del módulo.</Typography>
      </Box>
      <Stack direction="row" gap={.6} flexWrap="wrap">
        <Button size="small" variant="outlined" disabled={!selected} onClick={openEdit} startIcon={<Icon name="fa-pen"/>}>Editar ficha</Button>
        <Button size="small" disabled={!selected} onClick={()=>ctx.navigate?.('veterinaria',{tab:'historia',patient:selectedId})} startIcon={<Icon name="fa-file-waveform"/>}>Historia completa</Button>
      </Stack>
    </Stack>
    <Divider sx={{mb:1}}/>
    <Box className="cg-vet-master-detail" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'250px minmax(0,1fr)'},gap:1}}>
      <Box sx={{minWidth:0}}>
        <TextField size="small" fullWidth placeholder="Buscar mascota, tutor o microchip" value={search} onChange={(event)=>setSearch(event.target.value)} InputProps={{startAdornment:<InputAdornment position="start"><Icon name="fa-magnifying-glass"/></InputAdornment>}}/>
        {loading ? <Box className="cg-vet-list-state">Cargando mascotas…</Box> : filtered.length ? <List dense className="cg-vet-patient-list" sx={{mt:.6,maxHeight:{xs:180,md:390},overflow:'auto'}}>
          {filtered.map((item)=><ListItemButton key={item.id} selected={item.id===selectedId} onClick={()=>setSelectedId(item.id)}>
            <ListItemAvatar><Avatar src={item.photoUrl||''} sx={{width:30,height:30,bgcolor:'var(--cg-primary)',fontSize:13}}>{item.displayName?.slice(0,1)}</Avatar></ListItemAvatar>
            <ListItemText primary={item.displayName||'Sin nombre'} secondary={`${item.species||'Mascota'} · ${item.guardianName||'Sin tutor'} · #${shortCode(item.id)}`} primaryTypographyProps={{fontSize:12,fontWeight:650}} secondaryTypographyProps={{fontSize:9,noWrap:true}}/>
          </ListItemButton>)}
        </List> : <Box className="cg-vet-list-state">No hay mascotas registradas todavía.</Box>}
      </Box>
      {selected ? <Box className="cg-vet-detail" sx={{display:'grid',gap:.9,minWidth:0}}>
        <Stack direction="row" gap={.9} alignItems="center">
          <Avatar src={selected.photoUrl||''} sx={{width:42,height:42,bgcolor:'var(--cg-primary)',fontSize:18}}>{selected.displayName?.slice(0,1)}</Avatar>
          <Box sx={{minWidth:0}}><Typography variant="subtitle1" sx={{fontWeight:700}}>{selected.displayName}</Typography><Typography variant="caption" sx={{color:'var(--cg-text-muted)'}}>{selected.species||'Mascota'} · {selected.breed||'Sin raza'} · #{shortCode(selected.id)}</Typography></Box>
        </Stack>
        <Box className="cg-vet-facts" sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',lg:'repeat(4,minmax(0,1fr))'}}}>
          <KeyValue label="Tutor" value={selected.guardianName}/><KeyValue label="Teléfono" value={selected.guardianPhone}/><KeyValue label="Correo" value={selected.guardianEmail}/><KeyValue label="Microchip" value={selected.microchip}/>
          <KeyValue label="Nacimiento" value={onlyDate(selected.birthDate)}/><KeyValue label="Sexo" value={selected.sex}/><KeyValue label="Color" value={selected.color}/><KeyValue label="Notas" value={selected.notes}/>
        </Box>
        <Stack direction={{xs:'column',lg:'row'}} gap={.6}>
          <Alert severity={selected.allergies?'warning':'success'} sx={{flex:1}}><b>Alergias:</b> {selected.allergies||'Sin registro'}</Alert>
          <Alert severity={selected.conditions?'info':'success'} sx={{flex:1}}><b>Antecedentes:</b> {selected.conditions||'Sin registro'}</Alert>
        </Stack>
        <Box className="cg-vet-activity"><Stack direction="row" gap={.45} flexWrap="wrap"><Chip size="small" label={`${history.encounters.length} consultas`}/><Chip size="small" label={`${history.labs.length} órdenes`}/><Chip size="small" label={`${history.studies.length} estudios`}/><Chip size="small" label={`${history.procedures.length} procedimientos`}/></Stack></Box>
        <Box className="cg-vet-timeline">
          <Typography variant="subtitle2" sx={{fontWeight:700,mb:.7}}>Cronología médica</Typography>
          {timeline.length ? timeline.slice(0,30).map((item,index)=><TimelineItem key={`${item.title}-${item.date}-${index}`} {...item}/>) : <Typography variant="body2" sx={{color:'var(--cg-text-muted)'}}>Aún no hay eventos clínicos para esta mascota.</Typography>}
        </Box>
      </Box> : <Box className="cg-vet-empty"><Typography variant="body2" sx={{color:'var(--cg-text-muted)',fontWeight:600}}>Selecciona o registra una mascota para abrir su expediente.</Typography></Box>}
    </Box>
    <Dialog open={editing} onClose={()=>setEditing(false)} fullWidth maxWidth="md">
      <DialogTitle>Editar ficha · {selected?.displayName}</DialogTitle>
      <DialogContent dividers><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:1.1}}>
        <TextField label="Nombre" value={form.displayName||''} onChange={(e)=>setForm({...form,displayName:e.target.value})}/>
        <TextField label="Especie" value={form.species||''} onChange={(e)=>setForm({...form,species:e.target.value})}/>
        <TextField label="Raza" value={form.breed||''} onChange={(e)=>setForm({...form,breed:e.target.value})}/>
        <TextField label="Color" value={form.color||''} onChange={(e)=>setForm({...form,color:e.target.value})}/>
        <TextField select label="Sexo" value={form.sex||''} onChange={(e)=>setForm({...form,sex:e.target.value})}><MenuItem value="">Sin indicar</MenuItem><MenuItem value="male">Macho</MenuItem><MenuItem value="female">Hembra</MenuItem></TextField>
        <TextField label="Nacimiento" type="date" InputLabelProps={{shrink:true}} value={form.birthDate||''} onChange={(e)=>setForm({...form,birthDate:e.target.value})}/>
        <TextField label="Microchip" value={form.microchip||''} onChange={(e)=>setForm({...form,microchip:e.target.value})}/>
        <TextField label="Tutor" value={form.guardianName||''} onChange={(e)=>setForm({...form,guardianName:e.target.value})}/>
        <TextField label="Teléfono" value={form.guardianPhone||''} onChange={(e)=>setForm({...form,guardianPhone:e.target.value})}/>
        <TextField label="Correo" type="email" value={form.guardianEmail||''} onChange={(e)=>setForm({...form,guardianEmail:e.target.value})}/>
        <TextField label="Alergias" multiline minRows={2} value={form.allergies||''} onChange={(e)=>setForm({...form,allergies:e.target.value})}/>
        <TextField label="Condiciones / antecedentes" multiline minRows={2} value={form.conditions||''} onChange={(e)=>setForm({...form,conditions:e.target.value})}/>
        <TextField label="Notas" multiline minRows={2} value={form.notes||''} onChange={(e)=>setForm({...form,notes:e.target.value})} sx={{gridColumn:'1/-1'}}/>
      </Box></DialogContent>
      <DialogActions><Button onClick={()=>setEditing(false)} color="inherit">Cancelar</Button><Button onClick={()=>save().catch(()=>null)}>Guardar cambios</Button></DialogActions>
    </Dialog>
  </Paper>;
}

let dossierRoot=null;
export const VeterinaryClinicPage={
  render(state,ctx){
    return `<section class="cg-page-stack"><div id="veterinaryDossierRoot"></div>${VeterinaryClinicLegacy.render(state,ctx)}</section>`;
  },
  mount(state,ctx){
    VeterinaryClinicLegacy.mount(state,ctx);
    const host=document.getElementById('veterinaryDossierRoot');
    if(!host)return;
    try{dossierRoot?.unmount();}catch{}
    dossierRoot=createRoot(host);
    dossierRoot.render(<VeterinaryDossier ctx={ctx}/>);
  }
};
