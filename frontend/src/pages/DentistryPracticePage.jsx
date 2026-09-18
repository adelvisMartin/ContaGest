import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgEmptyState, CgPageHeader, CgProvider, CgSelect, CgState, CgStatusChip, CgTextField
} from '../components/ui/cg/CgPrimitives.jsx';
import { HealthVerticalService } from '../services/verticalService.js';
import { ToothSurfaceSelector } from '../components/dentistry/ToothSurfaceSelector.jsx';
import { PERMANENT_TEETH, PRIMARY_TEETH } from '../components/dentistry/dentalCatalog.js';
import { PeriodontalChartPanel } from '../components/dentistry/PeriodontalChartPanel.jsx';
import { TreatmentPlanPanel } from '../components/dentistry/TreatmentPlanPanel.jsx';

const PROCEDURES=['Evaluación','Profilaxis / limpieza','Restauración','Endodoncia','Extracción','Periodoncia','Ortodoncia','Prótesis','Implante','Radiografía / estudio','Control postoperatorio'];
const SPECIALTIES=[
  ['odontologia-general','Odontología general'],['ortodoncia','Ortodoncia'],['endodoncia','Endodoncia'],
  ['periodoncia','Periodoncia'],['cirugia-bucal','Cirugía bucal'],['protesis','Prótesis / rehabilitación']
];
const rows=(value)=>Array.isArray(value)?value:value?.data||[];
const patientName=(patient={})=>patient.displayName||patient.fullName||'Paciente';
const statusLabel=(status='')=>({scheduled:'Programada',confirmed:'Confirmada',checked_in:'En sala',in_progress:'En atención',completed:'Completada',cancelled:'Cancelada',no_show:'No asistió'}[String(status).toLowerCase()]||status||'Programada');
const statusTone=(status='')=>['completed','confirmed','checked_in'].includes(String(status).toLowerCase())?'success':['cancelled','no_show'].includes(String(status).toLowerCase())?'error':'warning';
const localToday=()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const appointmentIso=(date,time,duration=45)=>{const start=new Date(`${date}T${time||'09:00'}:00`);if(Number.isNaN(start.getTime()))throw new Error('Fecha u hora inválida.');const end=new Date(start.getTime()+Math.max(15,Number(duration||45))*60000);return{startsAt:start.toISOString(),endsAt:end.toISOString()};};

function Metric({label,value,tone='default'}){
  return <Paper variant="outlined" sx={{p:1.4,minWidth:0}}><Typography variant="caption" color="text.secondary">{label}</Typography><Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}><Typography variant="h5" sx={{fontVariantNumeric:'tabular-nums'}}>{value}</Typography><CgStatusChip label={String(value)} tone={tone}/></Stack></Paper>;
}

function DentistryWorkspace({ state, context }){
  const initial=state?.dentistry||{};
  const [patients,setPatients]=useState(rows(initial.patients));
  const [professionals,setProfessionals]=useState(rows(initial.professionals));
  const [appointments,setAppointments]=useState(rows(initial.appointments).filter((item)=>String(item.type||'').toLowerCase()==='dentistry'));
  const [encounters,setEncounters]=useState(rows(initial.encounters));
  const [selectedPatientId,setSelectedPatientId]=useState(initial.selectedPatientId||'');
  const [dentition,setDentition]=useState('permanent');
  const [selectedTooth,setSelectedTooth]=useState('');
  const [selectedSurfaces,setSelectedSurfaces]=useState([]);
  const [amendmentTarget,setAmendmentTarget]=useState(null);
  const [amendmentReason,setAmendmentReason]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [patientForm,setPatientForm]=useState({displayName:'',email:'',phone:''});
  const [professionalForm,setProfessionalForm]=useState({fullName:'',specialty:'odontologia-general',licenseNumber:''});
  const [appointmentForm,setAppointmentForm]=useState({patientId:'',professionalId:'',date:localToday(),time:'09:00',reason:''});
  const [encounterForm,setEncounterForm]=useState({professionalId:'',procedure:'Evaluación',condition:'',finding:'',assessment:'',plan:''});
  const Toast=context?.Toast;

  const dentalProfessionals=useMemo(()=>professionals.filter((item)=>/odont|dental|ortodon|endodon|periodon|cirugia-bucal|protesis/i.test(String(item.specialty||''))||!item.specialty),[professionals]);
  const patientById=useMemo(()=>new Map(patients.map((item)=>[item.id,item])),[patients]);
  const activeAppointments=useMemo(()=>appointments.filter((item)=>!['completed','cancelled'].includes(String(item.status||'').toLowerCase())),[appointments]);
  const dentalTreatmentEncounters=useMemo(()=>encounters.filter((item)=>item.type==='dental-treatment'),[encounters]);
  const patientOptions=useMemo(()=>[{value:'',label:'Seleccionar paciente'},...patients.map((item)=>({value:item.id,label:patientName(item)}))],[patients]);
  const professionalOptions=useMemo(()=>[{value:'',label:'Sin asignar'},...dentalProfessionals.map((item)=>({value:item.id,label:item.fullName||'Profesional'}))],[dentalProfessionals]);
  const toothOptions=dentition==='primary'?PRIMARY_TEETH:PERMANENT_TEETH;

  const notify=(message,tone='success')=>Toast?.show?.(message,tone);

  async function loadAll({silent=false}={}){
    if(!silent)setLoading(true);
    setError('');
    try{
      const [patientResponse,professionalResponse,appointmentResponse]=await Promise.all([
        HealthVerticalService.patients({kind:'human'}),
        HealthVerticalService.professionals(),
        HealthVerticalService.appointments({})
      ]);
      const nextPatients=rows(patientResponse);
      const nextProfessionals=rows(professionalResponse);
      const nextAppointments=rows(appointmentResponse).filter((item)=>String(item.type||'').toLowerCase()==='dentistry');
      setPatients(nextPatients);
      setProfessionals(nextProfessionals);
      setAppointments(nextAppointments);
      const nextPatientId=selectedPatientId&&nextPatients.some((item)=>item.id===selectedPatientId)?selectedPatientId:'';
      setSelectedPatientId(nextPatientId);
      setAppointmentForm((current)=>({...current,patientId:current.patientId&&nextPatients.some((item)=>item.id===current.patientId)?current.patientId:''}));
      if(nextPatientId)setEncounters(rows(await HealthVerticalService.encounters(nextPatientId)));else setEncounters([]);
    }catch(cause){
      const message=cause?.message||'No se pudo actualizar odontología.';
      setError(message);
      if(!silent)notify(`No se pudo actualizar odontología: ${message}`,'warning');
    }finally{
      if(!silent)setLoading(false);
    }
  }

  useEffect(()=>{void loadAll({silent:true});},[]);

  async function loadEncounters(patientId){
    setSelectedPatientId(patientId);
    setSelectedTooth('');
    setSelectedSurfaces([]);
    setAmendmentTarget(null);
    setAmendmentReason('');
    if(!patientId){setEncounters([]);return;}
    try{setEncounters(rows(await HealthVerticalService.encounters(patientId)));}
    catch(cause){notify(`No se cargó la historia odontológica: ${cause?.message||'Error de lectura'}`,'warning');}
  }

  async function submitPatient(event){
    event.preventDefault();
    if(!patientForm.displayName.trim())return notify('Indica el nombre del paciente.','warning');
    try{
      const patient=await HealthVerticalService.createPatient({kind:'human',displayName:patientForm.displayName.trim(),email:patientForm.email.trim(),phone:patientForm.phone.trim()});
      setPatients((current)=>[patient,...current]);
      setPatientForm({displayName:'',email:'',phone:''});
      if(!selectedPatientId)void loadEncounters(patient.id);
      setAppointmentForm((current)=>({...current,patientId:current.patientId||patient.id}));
      notify('Paciente odontológico guardado.','success');
    }catch(cause){notify(`No se guardó el paciente: ${cause?.message||'Error'}`,'error');}
  }

  async function submitProfessional(event){
    event.preventDefault();
    if(!professionalForm.fullName.trim())return notify('Indica el nombre del profesional.','warning');
    try{
      const professional=await HealthVerticalService.createProfessional({
        fullName:professionalForm.fullName.trim(),
        specialty:professionalForm.specialty||'odontologia-general',
        licenseNumber:professionalForm.licenseNumber.trim(),
        status:'active',
        schedule:{}
      });
      setProfessionals((current)=>[professional,...current]);
      setProfessionalForm({fullName:'',specialty:'odontologia-general',licenseNumber:''});
      notify('Profesional odontológico guardado.','success');
    }catch(cause){notify(`No se guardó el profesional: ${cause?.message||'Error'}`,'error');}
  }

  async function submitAppointment(event){
    event.preventDefault();
    if(!appointmentForm.patientId)return notify('Selecciona un paciente.','warning');
    try{
      const {startsAt,endsAt}=appointmentIso(appointmentForm.date,appointmentForm.time,45);
      const item=await HealthVerticalService.createAppointment({
        patientId:appointmentForm.patientId,
        professionalId:appointmentForm.professionalId||null,
        startsAt,endsAt,type:'dentistry',status:'scheduled',
        reason:appointmentForm.reason.trim(),channel:'onsite',notes:''
      });
      setAppointments((current)=>[item,...current]);
      setAppointmentForm((current)=>({...current,reason:''}));
      notify('Cita odontológica registrada.','success');
    }catch(cause){notify(`No se registró la cita: ${cause?.message||'Error'}`,'error');}
  }

  async function submitEncounter(event){
    event.preventDefault();
    if(!selectedPatientId)return notify('Selecciona un paciente.','warning');
    if(!selectedTooth)return notify('Selecciona una pieza dental.','warning');
    if(!selectedSurfaces.length)return notify('Selecciona al menos una superficie dental.','warning');
    if(!encounterForm.condition.trim())return notify('Indica la condición clínica de la pieza.','warning');
    if(amendmentTarget&&!amendmentReason.trim())return notify('Indica el motivo de la enmienda.','warning');

    const clinicalData={
      tooth:selectedTooth,
      procedure:encounterForm.procedure||'Evaluación',
      odontogram:{dentition,tooth:selectedTooth,surfaces:selectedSurfaces,condition:encounterForm.condition.trim()}
    };

    try{
      if(amendmentTarget){
        await HealthVerticalService.amendEncounter(amendmentTarget.id,{
          reason:amendmentReason.trim(),
          professionalId:encounterForm.professionalId||null,
          subjective:encounterForm.finding.trim(),
          assessment:encounterForm.assessment.trim(),
          plan:encounterForm.plan.trim(),
          clinicalData
        });
        setEncounters(rows(await HealthVerticalService.encounters(selectedPatientId)));
        notify('Enmienda odontológica firmada; la versión anterior permanece en el historial.','success');
      }else{
        const item=await HealthVerticalService.createEncounter({
          patientId:selectedPatientId,
          professionalId:encounterForm.professionalId||null,
          specialty:'dentistry',
          type:'dental-treatment',
          subjective:encounterForm.finding.trim(),
          objective:`Pieza ${selectedTooth}`,
          assessment:encounterForm.assessment.trim(),
          plan:encounterForm.plan.trim(),
          diagnosisCodes:[],
          clinicalData,
          confidential:false,
          status:'signed'
        });
        setEncounters((current)=>[item,...current]);
        notify('Tratamiento odontológico registrado.','success');
      }
      setEncounterForm((current)=>({...current,procedure:'Evaluación',condition:'',finding:'',assessment:'',plan:''}));
      setSelectedTooth('');
      setSelectedSurfaces([]);
      setAmendmentTarget(null);
      setAmendmentReason('');
    }catch(cause){notify(`No se registró el tratamiento: ${cause?.message||'Error'}`,'error');}
  }

  async function createTreatmentPlan(plan){
    if(!selectedPatientId){notify('Selecciona un paciente antes de crear el plan.','warning');return false;}
    try{
      const item=await HealthVerticalService.createEncounter({
        patientId:selectedPatientId,
        professionalId:plan.professionalId||null,
        specialty:'dentistry',
        type:'dental-treatment-plan',
        subjective:plan.diagnosis,
        objective:'Plan de tratamiento odontológico propuesto',
        assessment:plan.diagnosis,
        plan:plan.phases.map((phase)=>`${phase.order}. ${phase.name}: ${phase.procedures.map((procedure)=>procedure.name).join(', ')}`).join('\n'),
        diagnosisCodes:[],
        clinicalData:{
          treatmentPlan:{
            diagnosis:plan.diagnosis,
            alternatives:plan.alternatives,
            phases:plan.phases,
            budget:plan.budget,
            status:'proposed',
            acceptance:{status:'pending'}
          }
        },
        confidential:false,
        status:'draft'
      });
      setEncounters((current)=>[item,...current]);
      notify('Plan de tratamiento propuesto guardado; el total fue recalculado por el servidor.','success');
      return item;
    }catch(cause){
      notify(`No se guardó el plan de tratamiento: ${cause?.message||'Error'}`,'error');
      return false;
    }
  }

  async function decideTreatmentPlan(id,payload){
    try{
      await HealthVerticalService.decideTreatmentPlan(id,payload);
      setEncounters(rows(await HealthVerticalService.encounters(selectedPatientId)));
      notify(payload.decision==='accepted'?'Plan aceptado como decisión operativa.':'Plan rechazado con trazabilidad.','success');
      return true;
    }catch(cause){
      notify(`No se registró la decisión del plan: ${cause?.message||'Error'}`,'error');
      return false;
    }
  }

  function prepareAmendment(item){
    const odontogram=item?.clinicalData?.odontogram;
    if(!odontogram?.tooth)return notify('Esta versión legacy no tiene odontograma estructurado para enmendar.','warning');
    setAmendmentTarget(item);
    setAmendmentReason('');
    setDentition(odontogram.dentition==='primary'?'primary':'permanent');
    setSelectedTooth(String(odontogram.tooth||''));
    setSelectedSurfaces(Array.isArray(odontogram.surfaces)?odontogram.surfaces:[]);
    setEncounterForm({
      professionalId:item.professionalId||'',
      procedure:item.clinicalData?.procedure||'Evaluación',
      condition:odontogram.condition||'',
      finding:item.subjective||'',
      assessment:item.assessment||'',
      plan:item.plan||''
    });
  }

  async function createPeriodontalChart(chart){
    if(!selectedPatientId){notify('Selecciona un paciente antes de registrar el periodontograma.','warning');return false;}
    try{
      const item=await HealthVerticalService.createEncounter({
        patientId:selectedPatientId,
        professionalId:chart.professionalId||null,
        specialty:'periodontics',
        type:'periodontal-chart',
        subjective:chart.notes||'',
        objective:`Periodontograma pieza ${chart.tooth}`,
        assessment:'',
        plan:'',
        diagnosisCodes:[],
        clinicalData:{periodontogram:{
          dentition:chart.dentition,
          tooth:chart.tooth,
          mobilityGrade:chart.mobilityGrade,
          furcationGrade:chart.furcationGrade,
          sites:chart.sites
        },notes:chart.notes||''},
        confidential:false,
        status:'signed'
      });
      setEncounters((current)=>[item,...current]);
      notify('Periodontograma firmado y agregado a la evolución periodontal.','success');
      return true;
    }catch(cause){
      notify(`No se registró el periodontograma: ${cause?.message||'Error'}`,'error');
      return false;
    }
  }

  return <Stack className="cg-dentistry-workspace" gap={1.5}>
    <CgPageHeader eyebrow="Salud · Odontología" title="Consultorio odontológico" description="Pacientes, agenda, odontograma operativo y registro de procedimientos en un mismo flujo." actions={<CgButton variant="outlined" onClick={()=>void loadAll()} disabled={loading}>Actualizar</CgButton>}/>
    {error?<CgState severity="warning" title="Actualización incompleta">{error}</CgState>:null}
    {loading?<CgState severity="info" title="Actualizando">Cargando pacientes, agenda y profesionales.</CgState>:null}

    <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'repeat(4,minmax(0,1fr))'},gap:1}}>
      <Metric label="Pacientes" value={patients.length} tone="primary"/>
      <Metric label="Citas activas" value={activeAppointments.length} tone={activeAppointments.length?'warning':'success'}/>
      <Metric label="Profesionales" value={dentalProfessionals.length} tone="info"/>
      <Metric label="Registros clínicos" value={encounters.length} tone="secondary"/>
    </Box>

    <Box className="cg-dental-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(3,minmax(0,1fr))'},gap:1.25}}>
      <Paper component="form" onSubmit={submitPatient} variant="outlined" sx={{p:1.5}}>
        <Typography variant="h6">Nuevo paciente</Typography><Typography variant="caption" color="text.secondary">Registro rápido para agenda y ficha odontológica.</Typography>
        <Stack gap={1.1} mt={1.25}>
          <CgTextField size="small" fullWidth label="Nombre completo" required value={patientForm.displayName} onChange={(e)=>setPatientForm({...patientForm,displayName:e.target.value})}/>
          <CgTextField size="small" fullWidth label="Correo" type="email" value={patientForm.email} onChange={(e)=>setPatientForm({...patientForm,email:e.target.value})}/>
          <CgTextField size="small" fullWidth label="Teléfono" value={patientForm.phone} onChange={(e)=>setPatientForm({...patientForm,phone:e.target.value})}/>
          <CgButton type="submit">Guardar paciente</CgButton>
        </Stack>
      </Paper>

      <Paper component="form" onSubmit={submitProfessional} variant="outlined" sx={{p:1.5}}>
        <Typography variant="h6">Profesional odontológico</Typography><Typography variant="caption" color="text.secondary">Responsable de citas y tratamientos.</Typography>
        <Stack gap={1.1} mt={1.25}>
          <CgTextField size="small" fullWidth label="Nombre completo" required value={professionalForm.fullName} onChange={(e)=>setProfessionalForm({...professionalForm,fullName:e.target.value})}/>
          <CgSelect label="Especialidad" value={professionalForm.specialty} onChange={(e)=>setProfessionalForm({...professionalForm,specialty:e.target.value})} options={SPECIALTIES.map(([value,label])=>({value,label}))}/>
          <CgTextField size="small" fullWidth label="Matrícula / licencia" value={professionalForm.licenseNumber} onChange={(e)=>setProfessionalForm({...professionalForm,licenseNumber:e.target.value})}/>
          <CgButton type="submit">Guardar profesional</CgButton>
        </Stack>
      </Paper>

      <Paper component="form" onSubmit={submitAppointment} variant="outlined" sx={{p:1.5}}>
        <Typography variant="h6">Nueva cita</Typography><Typography variant="caption" color="text.secondary">Agenda sin salir del módulo.</Typography>
        <Stack gap={1.1} mt={1.25}>
          <CgSelect label="Paciente" value={appointmentForm.patientId} onChange={(e)=>setAppointmentForm({...appointmentForm,patientId:e.target.value})} options={patientOptions}/>
          <CgSelect label="Profesional" value={appointmentForm.professionalId} onChange={(e)=>setAppointmentForm({...appointmentForm,professionalId:e.target.value})} options={professionalOptions}/>
          <Stack direction={{xs:'column',sm:'row'}} gap={1}>
            <CgTextField size="small" fullWidth label="Fecha" type="date" slotProps={{inputLabel:{shrink:true}}} value={appointmentForm.date} onChange={(e)=>setAppointmentForm({...appointmentForm,date:e.target.value})}/>
            <CgTextField size="small" fullWidth label="Hora" type="time" slotProps={{inputLabel:{shrink:true}}} value={appointmentForm.time} onChange={(e)=>setAppointmentForm({...appointmentForm,time:e.target.value})}/>
          </Stack>
          <CgTextField size="small" fullWidth label="Motivo" value={appointmentForm.reason} onChange={(e)=>setAppointmentForm({...appointmentForm,reason:e.target.value})}/>
          <CgButton type="submit">Agendar cita</CgButton>
        </Stack>
      </Paper>
    </Box>

    <Paper component="form" onSubmit={submitEncounter} variant="outlined" sx={{p:1.5}}>
      <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}><Box><Typography variant="h6">{amendmentTarget?'Enmendar versión odontológica':'Odontograma y tratamiento rápido'}</Typography><Typography variant="caption" color="text.secondary">{amendmentTarget?'La versión firmada original se conserva y se crea una revisión enlazada.':'Selecciona la pieza y registra hallazgos/procedimiento.'}</Typography></Box><Stack direction="row" gap={.7} alignItems="center"><CgStatusChip label={selectedTooth?`Pieza ${selectedTooth}`:'Sin pieza seleccionada'} tone={selectedTooth?'primary':'default'}/>{amendmentTarget?<CgStatusChip label={`Enmienda de v${amendmentTarget.clinicalData?.versioning?.revision||1}`} tone="warning"/>:null}</Stack></Stack>
      <Divider sx={{my:1.4}}/>
      {amendmentTarget?<CgState severity="warning" title="Enmienda auditada">No se sobrescribe la versión firmada. El servidor registra actor, revisión, motivo, before/after y campos modificados.</CgState>:null}
      <Box className="cg-dental-treatment-form" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1.2}}>
        <CgSelect label="Paciente" value={selectedPatientId} onChange={(e)=>void loadEncounters(e.target.value)} options={patientOptions}/>
        <CgSelect label="Profesional" value={encounterForm.professionalId} onChange={(e)=>setEncounterForm({...encounterForm,professionalId:e.target.value})} options={professionalOptions}/>
        <Box sx={{gridColumn:'1/-1'}}>
          <Stack direction={{xs:'column',sm:'row'}} gap={1} alignItems={{sm:'center'}} justifyContent="space-between">
            <Typography variant="caption" color="text.secondary" sx={{fontWeight:600}}>Pieza dental</Typography>
            <CgSelect label="Dentición" value={dentition} onChange={(e)=>{setDentition(e.target.value);setSelectedTooth('');setSelectedSurfaces([]);}} options={[{value:'permanent',label:'Permanente'},{value:'primary',label:'Temporal'}]}/>
          </Stack>
          <Box className="cg-dental-tooth-grid" sx={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(44px,1fr))',gap:.6,mt:.8}}>
            {toothOptions.map((tooth)=><CgButton key={tooth} type="button" size="small" variant={selectedTooth===tooth?'contained':'outlined'} aria-pressed={selectedTooth===tooth} onClick={()=>{setSelectedTooth(tooth);setSelectedSurfaces([]);}} sx={{minWidth:44,minHeight:44,p:0}}>{tooth}</CgButton>)}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:1,fontWeight:600}}>Superficies visuales</Typography>
          <Box mt={.6}>
            <ToothSurfaceSelector
              selectedSurfaces={selectedSurfaces}
              onChange={setSelectedSurfaces}
              disabled={!selectedTooth}
            />
          </Box>
        </Box>
        <CgSelect label="Procedimiento" value={encounterForm.procedure} onChange={(e)=>setEncounterForm({...encounterForm,procedure:e.target.value})} options={PROCEDURES.map((value)=>({value,label:value}))}/>
        <CgTextField size="small" fullWidth label="Condición clínica" required value={encounterForm.condition} onChange={(e)=>setEncounterForm({...encounterForm,condition:e.target.value})}/>
        <CgTextField size="small" fullWidth label="Hallazgo" value={encounterForm.finding} onChange={(e)=>setEncounterForm({...encounterForm,finding:e.target.value})}/>
        <CgTextField size="small" fullWidth label="Diagnóstico resumido" value={encounterForm.assessment} onChange={(e)=>setEncounterForm({...encounterForm,assessment:e.target.value})}/>
        <CgTextField size="small" fullWidth multiline minRows={3} label="Plan / indicaciones" value={encounterForm.plan} onChange={(e)=>setEncounterForm({...encounterForm,plan:e.target.value})} sx={{gridColumn:'1/-1'}}/>
        {amendmentTarget?<CgTextField size="small" fullWidth multiline minRows={2} label="Motivo de la enmienda" required value={amendmentReason} onChange={(e)=>setAmendmentReason(e.target.value)} sx={{gridColumn:'1/-1'}}/>:null}
        <Stack direction={{xs:'column',sm:'row'}} gap={.8} sx={{gridColumn:'1/-1'}}>
          <CgButton type="submit">{amendmentTarget?'Firmar enmienda':'Registrar tratamiento'}</CgButton>
          {amendmentTarget?<CgButton type="button" variant="outlined" onClick={()=>{setAmendmentTarget(null);setAmendmentReason('');setSelectedTooth('');setSelectedSurfaces([]);}}>Cancelar enmienda</CgButton>:null}
        </Stack>
      </Box>
    </Paper>

    <PeriodontalChartPanel
      selectedPatientId={selectedPatientId}
      onPatientChange={(patientId)=>void loadEncounters(patientId)}
      patientOptions={patientOptions}
      professionalOptions={professionalOptions}
      encounters={encounters}
      onCreate={createPeriodontalChart}
    />

    <TreatmentPlanPanel
      selectedPatientId={selectedPatientId}
      onPatientChange={(patientId)=>void loadEncounters(patientId)}
      patientOptions={patientOptions}
      professionalOptions={professionalOptions}
      encounters={encounters}
      onCreate={createTreatmentPlan}
      onDecision={decideTreatmentPlan}
    />

    <Box className="cg-dental-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:1.25}}>
      <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
        <Typography variant="h6">Próximas citas</Typography><Divider sx={{my:1}}/>
        {appointments.length?<Stack className="cg-dental-list" divider={<Divider flexItem/>}>{appointments.slice(0,12).map((item)=>{const patient=patientById.get(item.patientId)||{};return <Stack key={item.id} direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} py={.8}><Box sx={{minWidth:0}}><Typography variant="body2" fontWeight={650}>{patientName(patient)}</Typography><Typography variant="caption" color="text.secondary">{new Date(item.startsAt).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})} · {item.reason||'Consulta odontológica'}</Typography></Box><CgStatusChip label={statusLabel(item.status)} tone={statusTone(item.status)}/></Stack>;})}</Stack>:<CgEmptyState title="Sin citas odontológicas" description="Las nuevas citas aparecerán aquí."/>}
      </Paper>
      <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}><Typography variant="h6">Historia odontológica reciente</Typography><CgSelect label="Paciente de historia" value={selectedPatientId} onChange={(e)=>void loadEncounters(e.target.value)} options={patientOptions}/></Stack><Divider sx={{my:1}}/>
        {dentalTreatmentEncounters.length?<Stack className="cg-dental-list" divider={<Divider flexItem/>}>{dentalTreatmentEncounters.slice(0,20).map((item)=>{
          const versioning=item.clinicalData?.versioning;
          const revision=versioning?.revision||1;
          const actor=versioning?.actor?.email||versioning?.actor?.userId||'registro original';
          const changed=Array.isArray(versioning?.changedFields)?versioning.changedFields:[];
          const changeSummary=changed.map((field)=>{
            const beforeValue=versioning?.before?.[field];
            const afterValue=versioning?.after?.[field];
            const format=(value)=>Array.isArray(value)?value.join(', '):String(value??'—');
            return `${field}: ${format(beforeValue)} → ${format(afterValue)}`;
          }).join(' · ');
          return <Stack key={item.id} direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1} py={.8}>
            <Box sx={{minWidth:0}}>
              <Stack direction="row" gap={.6} alignItems="center" flexWrap="wrap"><Typography variant="body2" fontWeight={650}>{item.clinicalData?.procedure||item.type||'Atención odontológica'}</Typography><CgStatusChip size="small" label={`Versión ${revision}`} tone="primary"/></Stack>
              <Typography variant="caption" color="text.secondary" display="block">{item.clinicalData?.odontogram?.tooth?`${item.clinicalData.odontogram.dentition==='primary'?'Temporal':'Permanente'} · Pieza ${item.clinicalData.odontogram.tooth} · ${item.clinicalData.odontogram.surfaces?.join(', ')||'sin superficie'} · ${item.clinicalData.odontogram.condition||'sin condición'} · `:item.clinicalData?.tooth?`Pieza ${item.clinicalData.tooth} · `:''}{item.assessment||item.subjective||'Sin diagnóstico resumido'}</Typography>
              {versioning?<Typography variant="caption" color="text.secondary" display="block">Modificado por {actor} · Motivo: {versioning?.reason||'—'} · Cambios: {changeSummary||'sin resumen'}</Typography>:null}
            </Box>
            <Stack direction="row" gap={.6} alignItems="center" flexWrap="wrap">
              <CgStatusChip label={item.status==='signed'?'Firmado':item.status==='amended'?'Enmendado':item.status||'Borrador'} tone={item.status==='signed'?'success':item.status==='amended'?'default':'warning'}/>
              {item.status==='signed'&&item.type==='dental-treatment'?<CgButton size="small" variant="outlined" onClick={()=>prepareAmendment(item)}>Enmendar</CgButton>:null}
            </Stack>
          </Stack>;
        })}</Stack>:<CgEmptyState title="Sin tratamientos registrados" description="Selecciona un paciente y registra el primer procedimiento."/>}
      </Paper>
    </Box>
  </Stack>;
}

let activeRoot=null;
export const DentistryPracticePage={
  render(){return '<section class="cg-page-stack"><div id="dentistryReactRoot"></div></section>';},
  mount(state,context){
    const host=document.getElementById('dentistryReactRoot');
    if(!host)return;
    try{activeRoot?.unmount();}catch{}
    activeRoot=createRoot(host);
    activeRoot.render(<CgProvider state={state}><DentistryWorkspace state={state} context={context}/></CgProvider>);
  }
};
