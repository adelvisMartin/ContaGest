import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import {
  CgButton, CgEmptyState, CgPageHeader, CgProvider, CgSelect, CgState, CgStatusChip, CgTextField
} from '../components/ui/cg/CgPrimitives.jsx';
import { HealthVerticalService } from '../services/verticalService.js';
import { MediaService } from '../services/mediaService.js';
import { ToothSurfaceSelector } from '../components/dentistry/ToothSurfaceSelector.jsx';
import { PERMANENT_TEETH, PRIMARY_TEETH } from '../components/dentistry/dentalCatalog.js';
import { PeriodontalChartPanel } from '../components/dentistry/PeriodontalChartPanel.jsx';
import { TreatmentPlanPanel } from '../components/dentistry/TreatmentPlanPanel.jsx';
import { DentalConsentPanel } from '../components/dentistry/DentalConsentPanel.jsx';
import { DentalMediaPanel } from '../components/dentistry/DentalMediaPanel.jsx';
import { DentalLifecycleActions } from '../components/dentistry/DentalLifecycleActions.jsx';
import { DentalSchedulePanel } from '../components/dentistry/DentalSchedulePanel.jsx';
import { DentalFinancialPanel } from '../components/dentistry/DentalFinancialPanel.jsx';
import { PROCEDURES, SPECIALTIES, rows, patientName } from '../components/dentistry/dentistryWorkspace.helpers.js';
import { Metric } from '../components/dentistry/DentistryWorkspacePrimitives.jsx';

function DentistryWorkspace({ state, context }){
  const initial=state?.dentistry||{};
  const [patients,setPatients]=useState(rows(initial.patients));
  const [professionals,setProfessionals]=useState(rows(initial.professionals));
  const [appointments,setAppointments]=useState(rows(initial.appointments).filter((item)=>String(item.type||'').toLowerCase()==='dentistry'));
  const [encounters,setEncounters]=useState(rows(initial.encounters));
  const [consents,setConsents]=useState(rows(initial.consents));
  const [dentalAttachments,setDentalAttachments]=useState(rows(initial.dentalAttachments));
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
  const [encounterForm,setEncounterForm]=useState({professionalId:'',procedure:'Evaluación',condition:'',finding:'',assessment:'',plan:''});
  const Toast=context?.Toast;

  const dentalProfessionals=useMemo(()=>professionals.filter((item)=>/odont|dental|ortodon|endodon|periodon|cirugia-bucal|protesis/i.test(String(item.specialty||''))||!item.specialty),[professionals]);
  const activeAppointments=useMemo(()=>appointments.filter((item)=>!['completed','cancelled','no_show','waitlisted'].includes(String(item.status||'').toLowerCase())),[appointments]);
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
        HealthVerticalService.appointments({type:'dentistry'})
      ]);
      const nextPatients=rows(patientResponse);
      const nextProfessionals=rows(professionalResponse);
      const nextAppointments=rows(appointmentResponse);
      setPatients(nextPatients);
      setProfessionals(nextProfessionals);
      setAppointments(nextAppointments);
      const nextPatientId=selectedPatientId&&nextPatients.some((item)=>item.id===selectedPatientId)?selectedPatientId:'';
      setSelectedPatientId(nextPatientId);
      if(nextPatientId){
        const [encounterResponse,consentResponse,attachmentResponse]=await Promise.all([
          HealthVerticalService.encounters(nextPatientId),
          HealthVerticalService.consents(nextPatientId),
          MediaService.dentalAttachments(nextPatientId)
        ]);
        setEncounters(rows(encounterResponse));
        setConsents(rows(consentResponse));
        setDentalAttachments(rows(attachmentResponse));
      }else{
        setEncounters([]);
        setConsents([]);
        setDentalAttachments([]);
      }
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
    if(!patientId){setEncounters([]);setConsents([]);setDentalAttachments([]);return;}
    try{
      const [encounterResponse,consentResponse,attachmentResponse]=await Promise.all([
        HealthVerticalService.encounters(patientId),
        HealthVerticalService.consents(patientId),
        MediaService.dentalAttachments(patientId)
      ]);
      setEncounters(rows(encounterResponse));
      setConsents(rows(consentResponse));
      setDentalAttachments(rows(attachmentResponse));
    }catch(cause){notify(`No se cargó la historia odontológica: ${cause?.message||'Error de lectura'}`,'warning');}
  }

  async function submitPatient(event){
    event.preventDefault();
    if(!patientForm.displayName.trim())return notify('Indica el nombre del paciente.','warning');
    try{
      const patient=await HealthVerticalService.createPatient({kind:'human',displayName:patientForm.displayName.trim(),email:patientForm.email.trim(),phone:patientForm.phone.trim()});
      setPatients((current)=>[patient,...current]);
      setPatientForm({displayName:'',email:'',phone:''});
      if(!selectedPatientId)void loadEncounters(patient.id);
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

  async function createDentalAppointment(payload){
    try{
      const item=await HealthVerticalService.createAppointment(payload);
      setAppointments(rows(await HealthVerticalService.appointments({type:'dentistry'})));
      notify(payload.status==='waitlisted'?'Paciente agregado a lista de espera.':'Cita odontológica reservada.','success');
      return item;
    }catch(cause){
      notify(`No se guardó la cita: ${cause?.message||'Error'}`,'error');
      return false;
    }
  }

  async function updateDentalAppointment(id,payload){
    try{
      const item=await HealthVerticalService.updateAppointment(id,payload);
      setAppointments(rows(await HealthVerticalService.appointments({type:'dentistry'})));
      notify(payload.status==='confirmed'?'Cita confirmada.':payload.status==='scheduled'?'Franja de espera programada.':Object.prototype.hasOwnProperty.call(payload,'recallDueAt')?'Recall actualizado.':'Agenda actualizada.','success');
      return item;
    }catch(cause){
      notify(`No se actualizó la agenda: ${cause?.message||'Error'}`,'error');
      return false;
    }
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
        notify('Borrador de enmienda creado; la versión firmada anterior sigue vigente hasta completar revisión y firma.','success');
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
          status:'draft'
        });
        setEncounters((current)=>[item,...current]);
        notify('Borrador odontológico registrado; envíalo a revisión antes de firmar.','success');
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

  async function signDentalConsent(payload){
    try{
      const item=await HealthVerticalService.signDentalConsent(payload);
      setConsents((current)=>[item,...current]);
      notify('Consentimiento firmado con revisión e integridad SHA-256.','success');
      return true;
    }catch(cause){
      notify(`No se registró el consentimiento: ${cause?.message||'Error'}`,'error');
      return false;
    }
  }

  async function revokeDentalConsent(id,payload){
    try{
      const item=await HealthVerticalService.revokeConsent(id,payload);
      setConsents((current)=>current.map((consent)=>consent.id===item.id?item:consent));
      notify('Consentimiento revocado con trazabilidad; la evidencia firmada se conserva.','success');
      return true;
    }catch(cause){
      notify(`No se revocó el consentimiento: ${cause?.message||'Error'}`,'error');
      return false;
    }
  }


  async function uploadDentalAttachment(payload){
    try{
      const item=await MediaService.uploadDentalAttachment(payload);
      setDentalAttachments((current)=>[item,...current]);
      setEncounters((current)=>[item,...current]);
      notify('Adjunto clínico privado guardado con integridad SHA-256.','success');
      return true;
    }catch(cause){
      notify(`No se guardó el adjunto clínico: ${cause?.message||'Error'}`,'error');
      return false;
    }
  }

  async function transitionDentalEncounter(id,payload){
    try{
      await HealthVerticalService.transitionDentalEncounter(id,payload);
      setEncounters(rows(await HealthVerticalService.encounters(selectedPatientId)));
      notify(payload.action==='submit-review'?'Versión enviada a revisión.':'Versión clínica firmada.','success');
      return true;
    }catch(cause){
      notify(`No se actualizó el lifecycle clínico: ${cause?.message||'Error'}`,'error');
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

    <Box className="cg-dental-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:1.25}}>
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

    </Box>

    <DentalSchedulePanel
      patientOptions={patientOptions}
      professionalOptions={professionalOptions}
      appointments={appointments}
      onCreate={createDentalAppointment}
      onUpdate={updateDentalAppointment}
    />

    <Paper component="form" onSubmit={submitEncounter} variant="outlined" sx={{p:1.5}}>
      <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}><Box><Typography variant="h6">{amendmentTarget?'Enmendar versión odontológica':'Odontograma y tratamiento rápido'}</Typography><Typography variant="caption" color="text.secondary">{amendmentTarget?'La versión firmada original permanece vigente; la nueva versión inicia como borrador enlazado.':'Selecciona la pieza, registra hallazgos y guarda primero un borrador clínico.'}</Typography></Box><Stack direction="row" gap={.7} alignItems="center"><CgStatusChip label={selectedTooth?`Pieza ${selectedTooth}`:'Sin pieza seleccionada'} tone={selectedTooth?'primary':'default'}/>{amendmentTarget?<CgStatusChip label={`Enmienda de v${amendmentTarget.clinicalData?.versioning?.revision||1}`} tone="warning"/>:null}</Stack></Stack>
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
          <CgButton type="submit">{amendmentTarget?'Crear borrador de enmienda':'Guardar borrador clínico'}</CgButton>
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

    <DentalFinancialPanel
      selectedPatientId={selectedPatientId}
      encounters={encounters}
      notify={notify}
    />

    <DentalConsentPanel
      selectedPatientId={selectedPatientId}
      onPatientChange={(patientId)=>void loadEncounters(patientId)}
      patientOptions={patientOptions}
      encounters={encounters}
      consents={consents}
      onSign={signDentalConsent}
      onRevoke={revokeDentalConsent}
    />

    <DentalMediaPanel
      selectedPatientId={selectedPatientId}
      onPatientChange={(patientId)=>void loadEncounters(patientId)}
      patientOptions={patientOptions}
      encounters={encounters}
      dentalAttachments={dentalAttachments}
      onUpload={uploadDentalAttachment}
    />

    <Box className="cg-dental-grid" sx={{display:'grid',gridTemplateColumns:{xs:'1fr'},gap:1.25}}>
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
            <DentalLifecycleActions
              encounter={item}
              onTransition={transitionDentalEncounter}
              onAmend={prepareAmendment}
            />
          </Stack>;
        })}</Stack>:<CgEmptyState title="Sin tratamientos registrados" description="Selecciona un paciente y registra el primer procedimiento." assetKey="dentistry"/>}
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
