import React from 'react';
import {
  Alert, Avatar, Box, Button, Chip, Divider, IconButton, InputAdornment,
  List, ListItemAvatar, ListItemButton, ListItemText, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography
} from '@mui/material';
import { toast } from 'react-hot-toast';
import { VeterinaryTreatmentSheet } from './VeterinaryTreatmentSheet.jsx';
import { VeterinaryMedicationPanel } from './VeterinaryMedicationPanel.jsx';
import { VeterinaryClinicalInventoryPanel } from './VeterinaryClinicalInventoryPanel.jsx';
import { VeterinaryFinancialPanel } from './VeterinaryFinancialPanel.jsx';
import { VeterinaryGuardianPortalPanel } from './VeterinaryGuardianPortalPanel.jsx';
import { VeterinaryBoardingPanel } from './VeterinaryBoardingPanel.jsx';
import {
  compactDate, onlyDate, phoneDigits, displayError, reportVeterinaryError,
  shortCode, localDateTime
} from './veterinaryWorkspace.helpers.js';
import { Icon, Metric, StatusChip, EmptyState, SectionCard } from './VeterinaryWorkspacePrimitives.jsx';

export function renderVeterinaryWorkspaceTab({
  tab, dashboard, patients, professionals, appointments, selectedPatientId,
  selectedPatient, encounters, prescriptions, consents, labOrders, labResults,
  studies, hospitalizations, procedures, communications, search, setSearch,
  navigateToTab, openDialog, editPatient, archivePatient, editAppointment, removeAppointment,
  notifyAppointment, updateAppointment, dischargeHospitalization, filteredPatients, isLabResultPending,
  selectPatient, loadPatientData, setActionError
}) {
const renderOverview=()=> <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1.25fr .75fr'},gap:1.5}}><SectionCard title="Agenda de hoy" subtitle="Confirmación y seguimiento desde la misma vista" action={<Button startIcon={<Icon name="fa-plus"/>} onClick={()=>openDialog('appointment',{patientId:selectedPatientId,startsAt:localDateTime(60),endsAt:localDateTime(90),channel:'onsite'})}>Nueva cita</Button>}>{appointments.length?<Stack gap={.8}>{appointments.slice(0,8).map((item)=><Paper key={item.id} variant="outlined" sx={{p:1,display:'grid',gridTemplateColumns:{xs:'1fr auto',sm:'70px minmax(0,1fr) auto'},gap:1,alignItems:'center'}}><Box><Typography variant="subtitle2">{new Date(item.startsAt).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})}</Typography><Typography variant="caption">{onlyDate(item.startsAt)}</Typography></Box><Box sx={{minWidth:0}}><Typography variant="subtitle2" noWrap>{item.patientName||patients.find((p)=>p.id===item.patientId)?.displayName||'Mascota'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{item.reason||'Consulta'} · {item.professionalName||'Sin asignar'}</Typography></Box><Stack direction="row" gap={.3}><Tooltip title="Editar"><IconButton size="small" onClick={()=>editAppointment(item)}><Icon name="fa-pen"/></IconButton></Tooltip><Tooltip title="WhatsApp"><IconButton size="small" color="success" onClick={()=>notifyAppointment(item,'whatsapp')}><i className="fa-brands fa-whatsapp"/></IconButton></Tooltip></Stack></Paper>)}</Stack>:<EmptyState icon="fa-calendar-check" title="Agenda libre" text="No hay citas próximas registradas."/>}</SectionCard><Stack gap={1.5}><SectionCard title="Alertas clínicas" subtitle="Prioridades de los últimos 30 días"><Stack gap={.8}><Alert severity={Number(dashboard.abnormalResults)?'warning':'success'}><b>{dashboard.abnormalResults||0}</b> resultados fuera de rango</Alert><Alert severity={Number(dashboard.pendingLabOrders)?'info':'success'}><b>{dashboard.pendingLabOrders||0}</b> órdenes pendientes</Alert><Alert severity={Number(dashboard.vaccinesDue)?'warning':'success'}><b>{dashboard.vaccinesDue||0}</b> vacunas próximas</Alert></Stack></SectionCard><SectionCard title="Acciones rápidas"><Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:.8}}><Button variant="outlined" disabled={!selectedPatient} onClick={()=>navigateToTab('historia')}>Historia</Button><Button variant="outlined" disabled={!selectedPatient} onClick={()=>openDialog('labOrder',{priority:'routine',tests:'Hemograma completo|Hematología||||\nBioquímica básica|Bioquímica||||'})}>Laboratorio</Button><Button variant="outlined" disabled={!selectedPatient} onClick={()=>openDialog('hospitalization',{admittedAt:localDateTime()})}>Hospitalizar</Button><Button variant="outlined" disabled={!selectedPatient} onClick={()=>openDialog('procedure',{status:'planned',scheduledAt:localDateTime(60)})}>Procedimiento</Button></Box></SectionCard></Stack></Box>;
  const renderPatients=()=> <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'300px minmax(0,1fr)'},gap:1.5}}><SectionCard title="Mascotas" subtitle={`${patients.length} expedientes`} action={<Button startIcon={<Icon name="fa-plus"/>} onClick={()=>openDialog('patient')}>Nueva</Button>}><TextField placeholder="Buscar mascota, tutor o microchip" value={search} onChange={(e)=>setSearch(e.target.value)} InputProps={{startAdornment:<InputAdornment position="start"><Icon name="fa-magnifying-glass"/></InputAdornment>}}/><List dense sx={{mt:1,maxHeight:520,overflow:'auto'}}>{filteredPatients.map((item)=><ListItemButton key={item.id} selected={item.id===selectedPatientId} onClick={()=>selectPatient(item.id)} sx={{borderRadius:1,mb:.4}}><ListItemAvatar><Avatar variant="rounded" src={item.photoUrl||''} sx={{width:34,height:34,borderRadius:'8px',bgcolor:'primary.main'}}>{item.displayName?.slice(0,1)}</Avatar></ListItemAvatar><ListItemText primary={item.displayName} secondary={`${item.species||'Especie'} · ${item.breed||'Sin raza'} · ${item.guardianName||'Sin tutor'} · #${shortCode(item.id)}`} primaryTypographyProps={{fontSize:'.8125rem',fontWeight:600}} secondaryTypographyProps={{fontSize:'.6875rem',noWrap:true}}/></ListItemButton>)}</List></SectionCard>{selectedPatient?<Stack gap={1.5}><SectionCard title={selectedPatient.displayName} subtitle={`${selectedPatient.species||'Mascota'} · ${selectedPatient.breed||'Sin raza'} · expediente #${shortCode(selectedPatient.id)}`} action={<Stack direction="row" gap={.5} flexWrap="wrap"><Button variant="outlined" onClick={editPatient} startIcon={<Icon name="fa-pen"/>}>Editar</Button><Button variant="outlined" color="error" onClick={archivePatient} startIcon={<Icon name="fa-box-archive"/>}>Archivar</Button><Button variant="outlined" startIcon={<i className="fa-brands fa-whatsapp"/>} onClick={()=>{const p=phoneDigits(selectedPatient.guardianPhone);if(p)window.open(`https://wa.me/${p}`,'_blank');else toast.error('No hay teléfono registrado.');}}>Tutor</Button><Button startIcon={<Icon name="fa-calendar-plus"/>} onClick={()=>openDialog('appointment',{patientId:selectedPatientId,startsAt:localDateTime(60),endsAt:localDateTime(90),channel:'onsite'})}>Agendar</Button></Stack>}><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',lg:'repeat(4,1fr)'},gap:1}}>{[['Tutor',selectedPatient.guardianName],['Teléfono',selectedPatient.guardianPhone],['Microchip',selectedPatient.microchip],['Nacimiento',onlyDate(selectedPatient.birthDate)],['Sexo',selectedPatient.sex],['Color',selectedPatient.color],['Alergias',selectedPatient.allergies],['Condiciones',selectedPatient.conditions]].map(([label,value])=><Paper key={label} variant="outlined" sx={{p:1}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="subtitle2">{value||'—'}</Typography></Paper>)}</Box></SectionCard><SectionCard title="Resumen del expediente"><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',lg:'repeat(4,1fr)'},gap:1}}><Metric icon="fa-file-waveform" label="Consultas" value={encounters.length}/><Metric icon="fa-flask-vial" label="Laboratorios" value={labOrders.length} tone="secondary"/><Metric icon="fa-x-ray" label="Estudios" value={studies.length} tone="warning"/><Metric icon="fa-house-medical" label="Hospitalizaciones" value={hospitalizations.length} tone="error"/></Box></SectionCard></Stack>:<SectionCard title="Expediente"><EmptyState icon="fa-paw" title="Selecciona una mascota"/></SectionCard>}</Box>;
  const renderAgenda=()=> <SectionCard title="Agenda veterinaria" subtitle="Citas, confirmaciones, llegada, consulta y cierre" action={<Button startIcon={<Icon name="fa-plus"/>} onClick={()=>openDialog('appointment',{patientId:selectedPatientId,startsAt:localDateTime(60),endsAt:localDateTime(90),channel:'onsite'})}>Nueva cita</Button>}>{appointments.length?<TableContainer><Table stickyHeader><TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Mascota / tutor</TableCell><TableCell>Profesional</TableCell><TableCell>Motivo</TableCell><TableCell>Estado</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead><TableBody>{appointments.map((item)=>{const p=patients.find((x)=>x.id===item.patientId);return <TableRow key={item.id} hover><TableCell>{compactDate(item.startsAt)}</TableCell><TableCell><b>{item.patientName||p?.displayName||'Mascota'}</b><br/><Typography variant="caption">{p?.guardianName||'Sin tutor'} · #{shortCode(item.patientId)}</Typography></TableCell><TableCell>{item.professionalName||'Por asignar'}</TableCell><TableCell>{item.reason||'Consulta'}</TableCell><TableCell><StatusChip value={item.status}/></TableCell><TableCell align="right"><Stack direction="row" justifyContent="flex-end" gap={.2}><Tooltip title="Editar"><IconButton size="small" onClick={()=>editAppointment(item)}><Icon name="fa-pen"/></IconButton></Tooltip><Tooltip title="Confirmar"><IconButton size="small" onClick={()=>updateAppointment(item,'confirmed')}><Icon name="fa-check"/></IconButton></Tooltip><Tooltip title="Completar"><IconButton size="small" onClick={()=>updateAppointment(item,'completed')}><Icon name="fa-flag-checkered"/></IconButton></Tooltip><Tooltip title="WhatsApp"><IconButton size="small" color="success" onClick={()=>notifyAppointment(item,'whatsapp')}><i className="fa-brands fa-whatsapp"/></IconButton></Tooltip><Tooltip title="Eliminar"><IconButton size="small" color="error" onClick={()=>removeAppointment(item)}><Icon name="fa-trash"/></IconButton></Tooltip></Stack></TableCell></TableRow>;})}</TableBody></Table></TableContainer>:<EmptyState icon="fa-calendar" title="Sin citas" text="Agrega la primera cita veterinaria."/>}</SectionCard>;
  const renderHistory=()=>!selectedPatient
    ? <SectionCard title="Historia clínica"><EmptyState icon="fa-file-waveform" title="Selecciona una mascota"/></SectionCard>
    : <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(0,1.3fr) minmax(320px,.7fr)'},gap:1.5}}>
        <SectionCard
          title={`Historia clínica · ${selectedPatient.displayName}`}
          subtitle="Notas SOAP, diagnósticos, plan y evolución"
          action={<Button startIcon={<Icon name="fa-plus"/>} onClick={()=>openDialog('encounter',{specialty:'Medicina veterinaria general',status:'signed',consultationType:'problem'})}>Nueva consulta</Button>}
        >
          {encounters.length?<Stack gap={1}>{encounters.map((item)=><Paper key={item.id} variant="outlined" sx={{p:1.2}}>
            <Stack direction="row" justifyContent="space-between"><Box><Typography variant="subtitle2">{item.specialty}</Typography><Typography variant="caption">{compactDate(item.createdAt)} · {item.professionalName||'Profesional'}</Typography></Box><StatusChip value={item.status}/></Stack>
            <Divider sx={{my:1}}/>
            {[['Motivo / subjetivo',item.subjective],['Hallazgos / objetivo',item.objective],['Evaluación / diagnóstico',item.assessment],['Plan y seguimiento',item.plan]]
              .filter(([,value])=>value)
              .map(([label,value])=><Box key={label} mb={.7}><Typography variant="caption" color="text.secondary" sx={{fontWeight:600}}>{label}</Typography><Typography variant="body2">{value}</Typography></Box>)}
          </Paper>)}</Stack>:<EmptyState icon="fa-file-medical" title="Sin consultas registradas"/>}
        </SectionCard>
        <Stack gap={1.5}>
          <VeterinaryMedicationPanel
            selectedPatient={selectedPatient}
            professionals={professionals}
            prescriptions={prescriptions}
            onCreated={()=>loadPatientData(selectedPatientId)}
          />
          <VeterinaryClinicalInventoryPanel
            selectedPatient={selectedPatient}
            prescriptions={prescriptions}
          />
          <SectionCard title="Consentimientos" action={<Button variant="outlined" onClick={()=>openDialog('consent',{status:'pending'})}>Nuevo</Button>}>
            {consents.length?consents.slice(0,8).map((item)=><Paper key={item.id} variant="outlined" sx={{p:1,mb:.7,display:'flex',justifyContent:'space-between'}}><Box><Typography variant="subtitle2">{item.kind}</Typography><Typography variant="caption">{item.signerName||'Pendiente de firma'}</Typography></Box><StatusChip value={item.status}/></Paper>):<EmptyState icon="fa-file-signature" title="Sin consentimientos"/>}
          </SectionCard>
        </Stack>
      </Box>;
  const renderLabs=()=>!selectedPatient?<SectionCard title="Laboratorio"><EmptyState icon="fa-flask-vial" title="Selecciona una mascota"/></SectionCard>:<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(0,.9fr) minmax(0,1.1fr)'},gap:1.5}}><SectionCard title="Órdenes de laboratorio" subtitle={selectedPatient.displayName} action={<Button onClick={()=>openDialog('labOrder',{priority:'routine',tests:'Hemograma completo|Hematología||||\nBioquímica básica|Bioquímica||||'})}>Nueva orden</Button>}>{labOrders.length?<Stack gap={.8}>{labOrders.map((x)=><Paper key={x.id} variant="outlined" sx={{p:1}}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="subtitle2">{x.orderNumber}</Typography><Typography variant="caption">{compactDate(x.orderedAt)} · {x.laboratory||'Laboratorio interno'}</Typography></Box><StatusChip value={x.status}/></Stack><Stack direction="row" gap={.5} mt={.8}><Chip label={`${x.resultCount||0} pruebas`} variant="outlined"/><Chip label={`${x.abnormalCount||0} alertas`} color={Number(x.abnormalCount)?'warning':'success'}/><Button variant="text" disabled={x.status==='completed'} onClick={()=>openDialog('labResult',{labOrderId:x.id})}>{x.status==='completed'?'Completa':'Capturar resultado'}</Button></Stack></Paper>)}</Stack>:<EmptyState icon="fa-flask" title="Sin órdenes"/>}</SectionCard><SectionCard title="Resultados" subtitle="Valores y rangos de referencia">{labResults.length?<TableContainer><Table><TableHead><TableRow><TableCell>Prueba</TableCell><TableCell>Resultado</TableCell><TableCell>Referencia</TableCell><TableCell>Bandera</TableCell><TableCell>Fecha</TableCell></TableRow></TableHead><TableBody>{labResults.map((x)=><TableRow key={x.id}><TableCell><b>{x.testName}</b><br/><Typography variant="caption">{x.category||'General'}</Typography></TableCell><TableCell>{x.valueNumeric??x.valueText??'Pendiente'} {x.unit||''}</TableCell><TableCell>{x.referenceText||[x.referenceMin,x.referenceMax].filter((v)=>v!==null&&v!==undefined).join(' – ')||'—'}</TableCell><TableCell>{isLabResultPending(x)?<Chip label="Pendiente" variant="outlined"/>:<StatusChip value={x.flag}/>}</TableCell><TableCell>{onlyDate(x.observedAt)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>:<EmptyState icon="fa-chart-line" title="Sin resultados"/>}</SectionCard></Box>;
  const renderStudies=()=> <SectionCard title="Estudios diagnósticos" subtitle="Radiología, ecografía, ECG, patología y otros" action={<Button disabled={!selectedPatient} onClick={()=>openDialog('study',{kind:'xray',status:'ordered',scheduledAt:localDateTime(60)})}>Nuevo estudio</Button>}>{studies.length?<TableContainer><Table><TableHead><TableRow><TableCell>Estudio</TableCell><TableCell>Zona</TableCell><TableCell>Fecha</TableCell><TableCell>Hallazgos</TableCell><TableCell>Impresión</TableCell><TableCell>Estado</TableCell></TableRow></TableHead><TableBody>{studies.map((x)=><TableRow key={x.id}><TableCell><b>{x.title}</b><br/><Typography variant="caption">{x.kind}</Typography></TableCell><TableCell>{x.bodySite||'—'}</TableCell><TableCell>{compactDate(x.performedAt||x.scheduledAt)}</TableCell><TableCell>{x.findings||'Pendiente'}</TableCell><TableCell>{x.impression||'Pendiente'}</TableCell><TableCell><StatusChip value={x.status}/></TableCell></TableRow>)}</TableBody></Table></TableContainer>:<EmptyState icon="fa-x-ray" title="Sin estudios"/>}</SectionCard>;
  const renderHospital=()=> <Stack gap={1.5}>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'minmax(0,1fr) 320px'},gap:1.5}}>
      <SectionCard title="Hospitalización" subtitle="Admisiones, jaulas, plan de cuidados y alta" action={<Button disabled={!selectedPatient} onClick={()=>openDialog('hospitalization',{admittedAt:localDateTime()})}>Nueva admisión</Button>}>
        {hospitalizations.length?<Stack gap={.8}>{hospitalizations.map((x)=><Paper key={x.id} variant="outlined" sx={{p:1.1}}>
          <Stack direction="row" justifyContent="space-between"><Box><Typography variant="subtitle2">{x.admissionNumber}</Typography><Typography variant="caption">{x.ward||'Área general'} · Jaula {x.cage||'—'} · {compactDate(x.admittedAt)}</Typography></Box><StatusChip value={x.status}/></Stack>
          <Typography variant="body2" mt={.8}><b>Motivo:</b> {x.reason}</Typography>
          <Typography variant="body2"><b>Diagnóstico:</b> {x.diagnosis||'En evaluación'}</Typography>
          {!['discharged','cancelled','transferred'].includes(x.status)?<Stack direction="row" gap={.6} mt={1}>
            <Button color="success" variant="outlined" onClick={()=>dischargeHospitalization(x)}>Dar alta</Button>
          </Stack>:null}
        </Paper>)}</Stack>:<EmptyState icon="fa-house-medical" title="Sin hospitalizaciones"/>}
      </SectionCard>
      <SectionCard title="Monitoreo activo">
        <Metric icon="fa-bed-pulse" label="Hospitalizados" value={dashboard.hospitalized||0} tone="error"/>
        <Alert severity="info" sx={{mt:1}}>La hoja de tratamiento concentra signos vitales, medicaciones, alimentación, fluidos, tareas y responsables durante la estancia.</Alert>
      </SectionCard>
    </Box>
    <VeterinaryTreatmentSheet hospitalizations={hospitalizations} professionals={professionals}/>
  </Stack>;
  const renderProcedures=()=> <SectionCard title="Procedimientos y cirugías" subtitle="Planificación, anestesia, ejecución y resultado" action={<Button disabled={!selectedPatient} onClick={()=>openDialog('procedure',{status:'planned',scheduledAt:localDateTime(60)})}>Nuevo procedimiento</Button>}>{procedures.length?<TableContainer><Table><TableHead><TableRow><TableCell>Procedimiento</TableCell><TableCell>Tipo</TableCell><TableCell>Programado</TableCell><TableCell>Anestesia</TableCell><TableCell>Resultado</TableCell><TableCell>Estado</TableCell></TableRow></TableHead><TableBody>{procedures.map((x)=><TableRow key={x.id}><TableCell><b>{x.name}</b></TableCell><TableCell>{x.kind}</TableCell><TableCell>{compactDate(x.performedAt||x.scheduledAt)}</TableCell><TableCell>{x.anesthesia||'—'}</TableCell><TableCell>{x.outcome||'Pendiente'}</TableCell><TableCell><StatusChip value={x.status}/></TableCell></TableRow>)}</TableBody></Table></TableContainer>:<EmptyState icon="fa-stethoscope" title="Sin procedimientos"/>}</SectionCard>;
  const renderCommunications=()=> <SectionCard title="Seguimiento multicanal" subtitle="WhatsApp, correo, SMS y trazabilidad por mascota" action={<Button variant="outlined" data-route="mensajes">Editar plantillas</Button>}>{communications.length?<TableContainer><Table><TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Canal</TableCell><TableCell>Evento</TableCell><TableCell>Destinatario</TableCell><TableCell>Estado</TableCell></TableRow></TableHead><TableBody>{communications.map((x)=><TableRow key={x.id}><TableCell>{compactDate(x.createdAt)}</TableCell><TableCell>{x.channel}</TableCell><TableCell>{x.event.replaceAll('_',' ')}</TableCell><TableCell>{x.recipient}</TableCell><TableCell><StatusChip value={x.status}/></TableCell></TableRow>)}</TableBody></Table></TableContainer>:<EmptyState icon="fa-message" title="Sin comunicaciones"/>}</SectionCard>;
  const renderFinance=()=> <VeterinaryFinancialPanel
    selectedPatient={selectedPatient}
    encounters={encounters}
    hospitalizations={hospitalizations}
  />;
  const renderGuardianPortal=()=> <VeterinaryGuardianPortalPanel
    selectedPatient={selectedPatient}
    onCommunicationCreated={()=>loadPatientData(selectedPatientId)}
  />;
  const renderBoarding=()=> <VeterinaryBoardingPanel selectedPatient={selectedPatient}/>;

  const renderTab=()=>({
    resumen:renderOverview,pacientes:renderPatients,agenda:renderAgenda,
    historia:renderHistory,laboratorio:renderLabs,estudios:renderStudies,
    hospitalizacion:renderHospital,boarding:renderBoarding,
    procedimientos:renderProcedures,finanzas:renderFinance,tutor:renderGuardianPortal,
    comunicaciones:renderCommunications
  }[tab]||renderOverview)();

  return renderTab();
}
