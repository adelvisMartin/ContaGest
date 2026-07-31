import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, CssBaseline, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, IconButton, InputAdornment, LinearProgress,
  List, ListItemAvatar, ListItemButton, ListItemText, MenuItem, Paper, Stack, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, ThemeProvider, Tooltip, Typography,
  createTheme
} from '@mui/material';
import { Toaster, toast } from 'react-hot-toast';
import { HealthVerticalService, VeterinaryService } from '../services/verticalService.js';

const TABS = [
  ['resumen', 'Resumen', 'fa-chart-pie'],
  ['pacientes', 'Mascotas', 'fa-paw'],
  ['agenda', 'Agenda', 'fa-calendar-days'],
  ['historia', 'Historia clínica', 'fa-file-waveform'],
  ['laboratorio', 'Laboratorio', 'fa-flask-vial'],
  ['estudios', 'Estudios', 'fa-x-ray'],
  ['hospitalizacion', 'Hospitalización', 'fa-house-medical'],
  ['procedimientos', 'Procedimientos', 'fa-stethoscope'],
  ['comunicaciones', 'Comunicaciones', 'fa-message']
];

const STATUS_TONE = {
  scheduled: 'info', confirmed: 'success', checked_in: 'warning', in_progress: 'warning', completed: 'success',
  cancelled: 'default', no_show: 'error', ordered: 'info', processing: 'warning', admitted: 'error', observed: 'warning',
  discharged: 'success', critical: 'error', high: 'warning', low: 'warning', abnormal: 'warning', normal: 'success',
  active: 'success', pending: 'warning', signed: 'success', sent: 'success', delivered: 'success', failed: 'error'
};

const Icon = ({ name, size = 14 }) => <i className={`fa-solid ${name}`} style={{ fontSize: size }} aria-hidden="true" />;
const compactDate = (value) => value ? new Date(value).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const onlyDate = (value) => value ? new Date(value).toLocaleDateString('es-VE') : '—';
const localDateTime = (minutes = 0) => {
  const date = new Date(Date.now() + minutes * 60000 - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
};
const phoneDigits = (value) => String(value || '').replace(/\D/g, '');
const displayError = (error) => error?.message || 'No se pudo completar la operación.';
const arrayData = (value) => Array.isArray(value) ? value : value?.data || [];
const objectData = (value) => value?.data || value || {};

function createVetTheme(mode = 'light') {
  const dark = ['dark', 'enterprise'].includes(mode);
  return createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: { main: dark ? '#6dc0f1' : '#057dcd', dark: '#1e3d58' },
      secondary: { main: '#8a508f' },
      success: { main: '#16845b' },
      warning: { main: '#e68a17' },
      error: { main: '#d14343' },
      background: { default: dark ? '#071523' : '#f5f8fb', paper: dark ? '#0d2031' : '#ffffff' },
      divider: dark ? '#29445c' : '#d9e3ec',
      text: { primary: dark ? '#f5f9fc' : '#102a43', secondary: dark ? '#b9c9d8' : '#52677c' }
    },
    typography: {
      fontFamily: 'Inter, Roboto, system-ui, sans-serif',
      fontSize: 12,
      h4: { fontWeight: 900, fontSize: 'clamp(1.35rem,1.8vw,1.85rem)', letterSpacing: '-.035em' },
      h6: { fontWeight: 850, fontSize: '.96rem' },
      subtitle2: { fontWeight: 850, fontSize: '.72rem' },
      body2: { fontSize: '.75rem', lineHeight: 1.45 },
      caption: { fontSize: '.64rem', lineHeight: 1.35 },
      button: { fontWeight: 850, fontSize: '.72rem', textTransform: 'none' }
    },
    shape: { borderRadius: 11 },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { backgroundImage: 'none' } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: { styleOverrides: { root: { border: `1px solid ${dark ? '#29445c' : '#d9e3ec'}`, boxShadow: '0 8px 24px rgba(30,61,88,.07)' } } },
      MuiButton: { defaultProps: { disableElevation: true, size: 'small' }, styleOverrides: { root: { minHeight: 36, borderRadius: 9, paddingInline: 12 } } },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true, variant: 'outlined' } },
      MuiOutlinedInput: { styleOverrides: { root: { minHeight: 40, borderRadius: 9 }, input: { padding: '10px 11px', fontSize: '.76rem', fontWeight: 650 } } },
      MuiInputLabel: { styleOverrides: { root: { fontSize: '.74rem', fontWeight: 750 } } },
      MuiMenuItem: { styleOverrides: { root: { minHeight: 36, fontSize: '.74rem', fontWeight: 700 } } },
      MuiTab: { styleOverrides: { root: { minHeight: 38, padding: '7px 11px', minWidth: 0, fontSize: '.68rem', fontWeight: 850, textTransform: 'none' } } },
      MuiTabs: { styleOverrides: { root: { minHeight: 38 }, indicator: { height: 3, borderRadius: 9 } } },
      MuiTableCell: { styleOverrides: { root: { padding: '8px 10px', fontSize: '.7rem', borderColor: dark ? '#29445c' : '#e4ebf1' }, head: { fontSize: '.59rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.055em', color: dark ? '#b9c9d8' : '#52677c', backgroundColor: dark ? '#10283a' : '#f3f7fa' } } },
      MuiChip: { defaultProps: { size: 'small' }, styleOverrides: { root: { height: 24, fontSize: '.61rem', fontWeight: 850 } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 14 } } }
    }
  });
}

function Metric({ icon, label, value, hint, tone = 'primary' }) {
  return <Card sx={{ minHeight: 88 }}><CardContent sx={{ p: '12px!important', display: 'grid', gridTemplateColumns: '34px 1fr', gap: 1.1, alignItems: 'center' }}>
    <Avatar sx={{ width: 34, height: 34, bgcolor: `${tone}.main`, fontSize: 14 }}><Icon name={icon} /></Avatar>
    <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</Typography>
      <Typography sx={{ fontWeight: 900, fontSize: '1.35rem', lineHeight: 1.05 }}>{value ?? 0}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Box>
  </CardContent></Card>;
}

function StatusChip({ value }) {
  return <Chip label={String(value || 'pendiente').replaceAll('_', ' ')} color={STATUS_TONE[value] || 'default'} variant={value === 'normal' ? 'outlined' : 'filled'} />;
}

function EmptyState({ icon = 'fa-folder-open', title = 'Sin registros', text = 'Crea el primer registro para comenzar.' }) {
  return <Box sx={{ py: 4, px: 2, textAlign: 'center', color: 'text.secondary' }}>
    <Avatar sx={{ width: 42, height: 42, mx: 'auto', mb: 1, bgcolor: 'action.hover', color: 'primary.main' }}><Icon name={icon} size={16} /></Avatar>
    <Typography variant="subtitle2" color="text.primary">{title}</Typography><Typography variant="caption">{text}</Typography>
  </Box>;
}

function SectionCard({ title, subtitle, action, children, sx = {} }) {
  return <Card sx={sx}><CardContent sx={{ p: '13px!important' }}>
    <Stack direction="row" gap={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.2 }}>
      <Box><Typography variant="h6">{title}</Typography>{subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}</Box>{action}
    </Stack>{children}
  </CardContent></Card>;
}

function VeterinaryWorkspace({ state, UrlStateService }) {
  const query = UrlStateService.getParams();
  const [tab, setTab] = useState(TABS.some(([key]) => key === query.tab) ? query.tab : 'resumen');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dashboard, setDashboard] = useState({});
  const [patients, setPatients] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(query.patient || '');
  const [encounters, setEncounters] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [consents, setConsents] = useState([]);
  const [labOrders, setLabOrders] = useState([]);
  const [labResults, setLabResults] = useState([]);
  const [studies, setStudies] = useState([]);
  const [hospitalizations, setHospitalizations] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [communications, setCommunications] = useState([]);
  const [dialog, setDialog] = useState('');
  const [form, setForm] = useState({});
  const searchRef = useRef('');

  const selectedPatient = patients.find((item) => item.id === selectedPatientId) || null;
  const mode = state.settings?.theme || 'light';
  const theme = useMemo(() => createVetTheme(mode), [mode]);

  const updateUrl = (nextTab = tab, patientId = selectedPatientId) => {
    const params = { tab: nextTab };
    if (patientId) params.patient = patientId;
    window.history.replaceState({ module: 'veterinaria' }, '', UrlStateService.href('veterinaria', params));
  };

  const loadBase = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [summaryResponse, patientResponse, professionalResponse, appointmentResponse] = await Promise.all([
        VeterinaryService.dashboard(),
        HealthVerticalService.patients({ kind: 'animal' }),
        HealthVerticalService.professionals(),
        HealthVerticalService.appointments({ kind: 'animal' })
      ]);
      const pets = arrayData(patientResponse).filter((item) => item.kind === 'animal');
      setDashboard(objectData(summaryResponse));
      setPatients(pets);
      setProfessionals(arrayData(professionalResponse));
      setAppointments(arrayData(appointmentResponse).filter((item) => !item.patientKind || item.patientKind === 'animal'));
      if (!selectedPatientId && pets.length) {
        setSelectedPatientId(pets[0].id);
        updateUrl(tab, pets[0].id);
      }
    } catch (error) {
      toast.error(displayError(error));
    } finally { setLoading(false); }
  };

  const loadPatientData = async (patientId) => {
    if (!patientId) {
      setEncounters([]); setPrescriptions([]); setConsents([]); setLabOrders([]); setLabResults([]); setStudies([]); setHospitalizations([]); setProcedures([]); setCommunications([]);
      return;
    }
    try {
      const [encounterData, prescriptionData, consentData, orderData, resultData, studyData, hospitalData, procedureData, communicationData] = await Promise.all([
        HealthVerticalService.encounters(patientId), HealthVerticalService.prescriptions(patientId), HealthVerticalService.consents(patientId),
        VeterinaryService.labOrders({ patientId }), VeterinaryService.labResults({ patientId }), VeterinaryService.studies({ patientId }),
        VeterinaryService.hospitalizations({ patientId }), VeterinaryService.procedures({ patientId }), VeterinaryService.communications({ patientId })
      ]);
      setEncounters(arrayData(encounterData)); setPrescriptions(arrayData(prescriptionData)); setConsents(arrayData(consentData));
      setLabOrders(arrayData(orderData)); setLabResults(arrayData(resultData)); setStudies(arrayData(studyData)); setHospitalizations(arrayData(hospitalData));
      setProcedures(arrayData(procedureData)); setCommunications(arrayData(communicationData));
    } catch (error) { toast.error(displayError(error)); }
  };

  useEffect(() => { loadBase(); }, []);
  useEffect(() => { loadPatientData(selectedPatientId); }, [selectedPatientId]);

  const changeTab = (_event, value) => { setTab(value); updateUrl(value, selectedPatientId); };
  const selectPatient = (id) => { setSelectedPatientId(id); updateUrl('pacientes', id); };
  const openDialog = (name, defaults = {}) => { setForm(defaults); setDialog(name); };
  const closeDialog = () => { if (!busy) { setDialog(''); setForm({}); } };
  const field = (name, fallback = '') => form[name] ?? fallback;
  const setField = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  const refreshAll = async () => { await loadBase({ silent: true }); await loadPatientData(selectedPatientId); toast.success('Información actualizada.'); };

  const submit = async () => {
    setBusy(true);
    const promise = (async () => {
      switch (dialog) {
        case 'patient':
          await HealthVerticalService.createPatient({ kind: 'animal', displayName: field('displayName'), species: field('species'), breed: field('breed'), color: field('color'), sex: field('sex'), birthDate: field('birthDate') || null, microchip: field('microchip'), guardianName: field('guardianName'), guardianPhone: field('guardianPhone'), guardianEmail: field('guardianEmail'), allergies: field('allergies'), conditions: field('conditions'), notes: field('notes'), active: true });
          break;
        case 'professional':
          await HealthVerticalService.createProfessional({ fullName: field('fullName'), specialty: field('specialty', 'Medicina veterinaria general'), licenseNumber: field('licenseNumber'), email: field('email'), phone: field('phone'), status: 'active', schedule: {} });
          break;
        case 'appointment':
          await HealthVerticalService.createAppointment({ patientId: field('patientId', selectedPatientId), professionalId: field('professionalId') || null, startsAt: field('startsAt'), endsAt: field('endsAt'), type: field('type', 'consultation'), status: 'scheduled', reason: field('reason'), channel: field('channel', 'onsite'), room: field('room'), notes: field('notes') });
          break;
        case 'encounter':
          await HealthVerticalService.createEncounter({ patientId: selectedPatientId, professionalId: field('professionalId') || null, specialty: field('specialty', 'Medicina veterinaria general'), type: field('type', 'consultation'), subjective: field('subjective'), objective: field('objective'), assessment: field('assessment'), plan: field('plan'), diagnosisCodes: String(field('diagnosisCodes')).split(',').map((item) => item.trim()).filter(Boolean), clinicalData: {}, confidential: false, status: field('status', 'signed') });
          break;
        case 'prescription':
          await HealthVerticalService.createPrescription({ patientId: selectedPatientId, professionalId: field('professionalId') || null, medication: field('medication'), dose: field('dose'), frequency: field('frequency'), duration: field('duration'), instructions: field('instructions'), status: 'active' });
          break;
        case 'consent':
          await HealthVerticalService.createConsent({ patientId: selectedPatientId, kind: field('kind'), status: field('status', 'pending'), signerName: field('signerName'), signedAt: field('status') === 'signed' ? new Date().toISOString() : null, metadata: { notes: field('notes') } });
          break;
        case 'labOrder': {
          const tests = String(field('tests')).split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
            const [testName, category = '', unit = '', min = '', max = ''] = line.split('|').map((item) => item.trim());
            return { testName, category: category || null, unit: unit || null, referenceMin: min === '' ? null : Number(min), referenceMax: max === '' ? null : Number(max) };
          });
          await VeterinaryService.createLabOrder({ patientId: selectedPatientId, professionalId: field('professionalId') || null, priority: field('priority', 'routine'), laboratory: field('laboratory'), specimenType: field('specimenType'), fasting: Boolean(field('fasting')), notes: field('notes'), tests });
          break;
        }
        case 'labResult':
          await VeterinaryService.createLabResult({ labOrderId: field('labOrderId'), testName: field('testName'), category: field('category'), valueText: field('valueText'), valueNumeric: field('valueNumeric') === '' ? null : Number(field('valueNumeric')), unit: field('unit'), referenceMin: field('referenceMin') === '' ? null : Number(field('referenceMin')), referenceMax: field('referenceMax') === '' ? null : Number(field('referenceMax')), referenceText: field('referenceText'), verifiedBy: field('verifiedBy'), notes: field('notes') });
          break;
        case 'study':
          await VeterinaryService.createStudy({ patientId: selectedPatientId, professionalId: field('professionalId') || null, kind: field('kind', 'xray'), title: field('title'), bodySite: field('bodySite'), status: field('status', 'ordered'), scheduledAt: field('scheduledAt') || null, performedAt: field('performedAt') || null, findings: field('findings'), impression: field('impression'), externalUrl: field('externalUrl') });
          break;
        case 'hospitalization':
          await VeterinaryService.createHospitalization({ patientId: selectedPatientId, professionalId: field('professionalId') || null, admittedAt: field('admittedAt') || null, ward: field('ward'), cage: field('cage'), reason: field('reason'), diagnosis: field('diagnosis'), status: 'admitted', carePlan: { fluids: field('fluids'), feeding: field('feeding'), monitoring: field('monitoring') } });
          break;
        case 'observation':
          await VeterinaryService.createObservation({ hospitalizationId: field('hospitalizationId'), professionalId: field('professionalId') || null, type: field('type', 'note'), values: { temperature: field('temperature'), heartRate: field('heartRate'), respiratoryRate: field('respiratoryRate'), weight: field('weight') }, note: field('note') });
          break;
        case 'procedure':
          await VeterinaryService.createProcedure({ patientId: selectedPatientId, professionalId: field('professionalId') || null, name: field('name'), kind: field('kind', 'procedure'), status: field('status', 'planned'), scheduledAt: field('scheduledAt') || null, performedAt: field('performedAt') || null, anesthesia: field('anesthesia'), notes: field('notes'), outcome: field('outcome') });
          break;
        default: throw new Error('Operación no reconocida.');
      }
      await loadBase({ silent: true }); await loadPatientData(selectedPatientId);
    })();
    toast.promise(promise, { loading: 'Guardando...', success: 'Registro guardado correctamente.', error: displayError });
    try { await promise; closeDialog(); } catch { /* toast already reports it */ } finally { setBusy(false); }
  };

  const notifyAppointment = async (appointment, channel) => {
    const patient = patients.find((item) => item.id === appointment.patientId) || selectedPatient;
    if (!patient) return toast.error('No se encontró la mascota.');
    const date = compactDate(appointment.startsAt);
    const message = `Hola ${patient.guardianName || 'tutor'}, recordatorio de la cita de ${patient.displayName} para ${date}. Motivo: ${appointment.reason || 'consulta veterinaria'}. Responde a este mensaje para confirmar o reprogramar.`;
    const recipient = channel === 'whatsapp' ? phoneDigits(patient.guardianPhone) : patient.guardianEmail;
    if (!recipient) return toast.error(channel === 'whatsapp' ? 'El tutor no tiene teléfono registrado.' : 'El tutor no tiene correo registrado.');
    try {
      await VeterinaryService.createCommunication({ patientId: patient.id, appointmentId: appointment.id, channel, event: 'appointment_reminder', recipient, status: channel === 'whatsapp' ? 'sent' : 'queued', sentAt: channel === 'whatsapp' ? new Date().toISOString() : null, payload: { message, appointmentAt: appointment.startsAt } });
      if (channel === 'whatsapp') window.open(`https://wa.me/${recipient}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
      else window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`Cita veterinaria de ${patient.displayName}`)}&body=${encodeURIComponent(message)}`;
      toast.success(channel === 'whatsapp' ? 'WhatsApp preparado.' : 'Correo preparado.');
      await loadPatientData(selectedPatientId);
    } catch (error) { toast.error(displayError(error)); }
  };

  const updateAppointment = async (appointment, status) => {
    const task = VeterinaryService.updateAppointmentStatus(appointment.id, { status });
    toast.promise(task, { loading: 'Actualizando cita...', success: 'Estado de cita actualizado.', error: displayError });
    try { await task; await loadBase({ silent: true }); } catch { /* handled */ }
  };

  const filteredPatients = patients.filter((item) => {
    const search = searchRef.current.toLowerCase();
    return !search || [item.displayName, item.guardianName, item.microchip, item.species, item.breed].some((value) => String(value || '').toLowerCase().includes(search));
  });

  const renderOverview = () => <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.25fr .75fr' }, gap: 1.5 }}>
    <SectionCard title="Agenda de hoy" subtitle="Confirmación y seguimiento desde la misma vista" action={<Button startIcon={<Icon name="fa-plus" />} onClick={() => openDialog('appointment', { patientId: selectedPatientId, startsAt: localDateTime(60), endsAt: localDateTime(90), channel: 'onsite' })}>Nueva cita</Button>}>
      {appointments.length ? <Stack gap={.8}>{appointments.slice(0, 8).map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1, display: 'grid', gridTemplateColumns: '70px minmax(0,1fr) auto', gap: 1, alignItems: 'center' }}>
        <Box><Typography variant="subtitle2">{new Date(item.startsAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</Typography><Typography variant="caption">{onlyDate(item.startsAt)}</Typography></Box>
        <Box sx={{ minWidth: 0 }}><Typography variant="subtitle2" noWrap>{item.patientName || patients.find((p) => p.id === item.patientId)?.displayName || 'Mascota'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{item.reason || 'Consulta'} · {item.professionalName || 'Sin asignar'}</Typography></Box>
        <Stack direction="row" gap={.4} alignItems="center"><StatusChip value={item.status} /><Tooltip title="WhatsApp"><IconButton size="small" color="success" onClick={() => notifyAppointment(item, 'whatsapp')}><i className="fa-brands fa-whatsapp" /></IconButton></Tooltip><Tooltip title="Correo"><IconButton size="small" color="primary" onClick={() => notifyAppointment(item, 'email')}><Icon name="fa-envelope" /></IconButton></Tooltip></Stack>
      </Paper>)}</Stack> : <EmptyState icon="fa-calendar-check" title="Agenda libre" text="No hay citas próximas registradas." />}
    </SectionCard>
    <Stack gap={1.5}>
      <SectionCard title="Alertas clínicas" subtitle="Prioridades de los últimos 30 días"><Stack gap={.8}>
        <Alert severity={Number(dashboard.abnormalResults) ? 'warning' : 'success'} sx={{ py: .3 }}><b>{dashboard.abnormalResults || 0}</b> resultados fuera de rango</Alert>
        <Alert severity={Number(dashboard.pendingLabOrders) ? 'info' : 'success'} sx={{ py: .3 }}><b>{dashboard.pendingLabOrders || 0}</b> órdenes de laboratorio pendientes</Alert>
        <Alert severity={Number(dashboard.vaccinesDue) ? 'warning' : 'success'} sx={{ py: .3 }}><b>{dashboard.vaccinesDue || 0}</b> vacunas próximas</Alert>
      </Stack></SectionCard>
      <SectionCard title="Acciones rápidas"><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: .8 }}>
        <Button variant="outlined" startIcon={<Icon name="fa-file-waveform" />} disabled={!selectedPatient} onClick={() => { setTab('historia'); updateUrl('historia', selectedPatientId); }}>Historia</Button>
        <Button variant="outlined" startIcon={<Icon name="fa-flask-vial" />} disabled={!selectedPatient} onClick={() => openDialog('labOrder', { priority: 'routine', tests: 'Hemograma completo|Hematología||||\nBioquímica básica|Bioquímica||||' })}>Laboratorio</Button>
        <Button variant="outlined" startIcon={<Icon name="fa-house-medical" />} disabled={!selectedPatient} onClick={() => openDialog('hospitalization', { admittedAt: localDateTime(), patientId: selectedPatientId })}>Hospitalizar</Button>
        <Button variant="outlined" startIcon={<Icon name="fa-stethoscope" />} disabled={!selectedPatient} onClick={() => openDialog('procedure', { status: 'planned', scheduledAt: localDateTime(60) })}>Procedimiento</Button>
      </Box></SectionCard>
    </Stack>
  </Box>;

  const renderPatients = () => <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px minmax(0,1fr)' }, gap: 1.5 }}>
    <SectionCard title="Mascotas" subtitle={`${patients.length} expedientes`} action={<Button startIcon={<Icon name="fa-plus" />} onClick={() => openDialog('patient')}>Nueva</Button>}>
      <TextField placeholder="Buscar mascota, tutor o microchip" onChange={(event) => { searchRef.current = event.target.value; setPatients((current) => [...current]); }} InputProps={{ startAdornment: <InputAdornment position="start"><Icon name="fa-magnifying-glass" /></InputAdornment> }} />
      <List dense sx={{ mt: 1, maxHeight: 520, overflow: 'auto' }}>{filteredPatients.map((item) => <ListItemButton key={item.id} selected={item.id === selectedPatientId} onClick={() => selectPatient(item.id)} sx={{ borderRadius: 2, mb: .4 }}>
        <ListItemAvatar><Avatar src={item.photoUrl || ''} sx={{ width: 34, height: 34, bgcolor: 'primary.main' }}>{item.displayName?.slice(0, 1)}</Avatar></ListItemAvatar>
        <ListItemText primary={item.displayName} secondary={`${item.species || 'Especie'} · ${item.breed || 'Sin raza'} · ${item.guardianName || 'Sin tutor'}`} primaryTypographyProps={{ fontSize: '.76rem', fontWeight: 850 }} secondaryTypographyProps={{ fontSize: '.62rem', noWrap: true }} />
      </ListItemButton>)}</List>
    </SectionCard>
    {selectedPatient ? <Stack gap={1.5}>
      <SectionCard title={selectedPatient.displayName} subtitle={`${selectedPatient.species || 'Mascota'} · ${selectedPatient.breed || 'Sin raza'}`} action={<Stack direction="row" gap={.7}><Button variant="outlined" startIcon={<i className="fa-brands fa-whatsapp" />} onClick={() => { const phone = phoneDigits(selectedPatient.guardianPhone); if (phone) window.open(`https://wa.me/${phone}`, '_blank'); else toast.error('No hay teléfono registrado.'); }}>Tutor</Button><Button startIcon={<Icon name="fa-calendar-plus" />} onClick={() => openDialog('appointment', { patientId: selectedPatientId, startsAt: localDateTime(60), endsAt: localDateTime(90), channel: 'onsite' })}>Agendar</Button></Stack>}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4,1fr)' }, gap: 1 }}>
          {[['Tutor', selectedPatient.guardianName], ['Teléfono', selectedPatient.guardianPhone], ['Microchip', selectedPatient.microchip], ['Nacimiento', onlyDate(selectedPatient.birthDate)], ['Sexo', selectedPatient.sex], ['Color', selectedPatient.color], ['Alergias', selectedPatient.allergies], ['Condiciones', selectedPatient.conditions]].map(([label, value]) => <Paper key={label} variant="outlined" sx={{ p: 1 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="subtitle2">{value || '—'}</Typography></Paper>)}
        </Box>
      </SectionCard>
      <SectionCard title="Resumen del expediente"><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1 }}>
        <Metric icon="fa-file-waveform" label="Consultas" value={encounters.length} /><Metric icon="fa-flask-vial" label="Laboratorios" value={labOrders.length} tone="secondary" /><Metric icon="fa-x-ray" label="Estudios" value={studies.length} tone="warning" /><Metric icon="fa-house-medical" label="Hospitalizaciones" value={hospitalizations.length} tone="error" />
      </Box></SectionCard>
    </Stack> : <SectionCard title="Expediente"><EmptyState icon="fa-paw" title="Selecciona una mascota" text="El expediente clínico aparecerá en esta sección." /></SectionCard>}
  </Box>;

  const renderAgenda = () => <SectionCard title="Agenda veterinaria" subtitle="Citas, confirmaciones, llegada, consulta y cierre" action={<Button startIcon={<Icon name="fa-plus" />} onClick={() => openDialog('appointment', { patientId: selectedPatientId, startsAt: localDateTime(60), endsAt: localDateTime(90), channel: 'onsite' })}>Nueva cita</Button>}>
    {appointments.length ? <TableContainer><Table stickyHeader><TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Mascota / tutor</TableCell><TableCell>Profesional</TableCell><TableCell>Motivo</TableCell><TableCell>Estado</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead><TableBody>{appointments.map((item) => {
      const patient = patients.find((p) => p.id === item.patientId); return <TableRow key={item.id} hover><TableCell>{compactDate(item.startsAt)}</TableCell><TableCell><b>{item.patientName || patient?.displayName || 'Mascota'}</b><br /><Typography variant="caption">{patient?.guardianName || 'Sin tutor'}</Typography></TableCell><TableCell>{item.professionalName || 'Por asignar'}</TableCell><TableCell>{item.reason || 'Consulta'}</TableCell><TableCell><StatusChip value={item.status} /></TableCell><TableCell align="right"><Stack direction="row" justifyContent="flex-end" gap={.3}><Tooltip title="Confirmar"><IconButton size="small" onClick={() => updateAppointment(item, 'confirmed')}><Icon name="fa-check" /></IconButton></Tooltip><Tooltip title="Iniciar"><IconButton size="small" onClick={() => updateAppointment(item, 'in_progress')}><Icon name="fa-play" /></IconButton></Tooltip><Tooltip title="Completar"><IconButton size="small" onClick={() => updateAppointment(item, 'completed')}><Icon name="fa-flag-checkered" /></IconButton></Tooltip><Tooltip title="WhatsApp"><IconButton size="small" color="success" onClick={() => notifyAppointment(item, 'whatsapp')}><i className="fa-brands fa-whatsapp" /></IconButton></Tooltip><Tooltip title="Correo"><IconButton size="small" color="primary" onClick={() => notifyAppointment(item, 'email')}><Icon name="fa-envelope" /></IconButton></Tooltip></Stack></TableCell></TableRow>;
    })}</TableBody></Table></TableContainer> : <EmptyState icon="fa-calendar" title="Sin citas" text="Agrega la primera cita veterinaria." />}
  </SectionCard>;

  const renderHistory = () => !selectedPatient ? <SectionCard title="Historia clínica"><EmptyState icon="fa-file-waveform" title="Selecciona una mascota" /></SectionCard> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1.4fr) minmax(260px,.6fr)' }, gap: 1.5 }}>
    <SectionCard title={`Historia clínica · ${selectedPatient.displayName}`} subtitle="Notas SOAP, diagnósticos, plan y evolución" action={<Button startIcon={<Icon name="fa-plus" />} onClick={() => openDialog('encounter', { specialty: 'Medicina veterinaria general', status: 'signed' })}>Nueva consulta</Button>}>
      {encounters.length ? <Stack gap={1}>{encounters.map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1.2 }}><Stack direction="row" justifyContent="space-between" gap={1}><Box><Typography variant="subtitle2">{item.specialty}</Typography><Typography variant="caption" color="text.secondary">{compactDate(item.createdAt)} · {item.professionalName || 'Profesional'}</Typography></Box><StatusChip value={item.status} /></Stack><Divider sx={{ my: 1 }} />{[['Motivo / subjetivo', item.subjective], ['Hallazgos / objetivo', item.objective], ['Evaluación / diagnóstico', item.assessment], ['Plan y seguimiento', item.plan]].filter(([, value]) => value).map(([label, value]) => <Box key={label} mb={.7}><Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }}>{label}</Typography><Typography variant="body2">{value}</Typography></Box>)}</Paper>)}</Stack> : <EmptyState icon="fa-file-medical" title="Sin consultas registradas" />}
    </SectionCard>
    <Stack gap={1.5}>
      <SectionCard title="Tratamientos" action={<Button variant="outlined" startIcon={<Icon name="fa-pills" />} onClick={() => openDialog('prescription')}>Prescribir</Button>}>{prescriptions.length ? prescriptions.slice(0, 8).map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1, mb: .7 }}><Typography variant="subtitle2">{item.medication}</Typography><Typography variant="caption">{[item.dose, item.frequency, item.duration].filter(Boolean).join(' · ')}</Typography></Paper>) : <EmptyState icon="fa-pills" title="Sin prescripciones" text="No hay tratamientos activos." />}</SectionCard>
      <SectionCard title="Consentimientos" action={<Button variant="outlined" startIcon={<Icon name="fa-file-signature" />} onClick={() => openDialog('consent', { status: 'pending' })}>Nuevo</Button>}>{consents.length ? consents.slice(0, 8).map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1, mb: .7, display: 'flex', justifyContent: 'space-between' }}><Box><Typography variant="subtitle2">{item.kind}</Typography><Typography variant="caption">{item.signerName || 'Pendiente de firma'}</Typography></Box><StatusChip value={item.status} /></Paper>) : <EmptyState icon="fa-file-signature" title="Sin consentimientos" />}</SectionCard>
    </Stack>
  </Box>;

  const renderLabs = () => !selectedPatient ? <SectionCard title="Laboratorio"><EmptyState icon="fa-flask-vial" title="Selecciona una mascota" /></SectionCard> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,.9fr) minmax(0,1.1fr)' }, gap: 1.5 }}>
    <SectionCard title="Órdenes de laboratorio" subtitle={selectedPatient.displayName} action={<Button startIcon={<Icon name="fa-plus" />} onClick={() => openDialog('labOrder', { priority: 'routine', tests: 'Hemograma completo|Hematología||||\nBioquímica básica|Bioquímica||||' })}>Nueva orden</Button>}>{labOrders.length ? <Stack gap={.8}>{labOrders.map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1 }}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="subtitle2">{item.orderNumber}</Typography><Typography variant="caption">{compactDate(item.orderedAt)} · {item.laboratory || 'Laboratorio interno'}</Typography></Box><StatusChip value={item.status} /></Stack><Stack direction="row" gap={.6} mt={.8}><Chip label={`${item.resultCount || 0} pruebas`} variant="outlined" /><Chip label={`${item.abnormalCount || 0} alertas`} color={Number(item.abnormalCount) ? 'warning' : 'success'} /><Button size="small" variant="text" onClick={() => openDialog('labResult', { labOrderId: item.id })}>Agregar resultado</Button></Stack></Paper>)}</Stack> : <EmptyState icon="fa-flask" title="Sin órdenes" />}</SectionCard>
    <SectionCard title="Resultados" subtitle="Valores, rangos de referencia y banderas clínicas">{labResults.length ? <TableContainer><Table><TableHead><TableRow><TableCell>Prueba</TableCell><TableCell>Resultado</TableCell><TableCell>Referencia</TableCell><TableCell>Bandera</TableCell><TableCell>Fecha</TableCell></TableRow></TableHead><TableBody>{labResults.map((item) => <TableRow key={item.id}><TableCell><b>{item.testName}</b><br /><Typography variant="caption">{item.category || 'General'}</Typography></TableCell><TableCell>{item.valueNumeric ?? item.valueText ?? 'Pendiente'} {item.unit || ''}</TableCell><TableCell>{item.referenceText || [item.referenceMin, item.referenceMax].filter((v) => v !== null && v !== undefined).join(' – ') || '—'}</TableCell><TableCell><StatusChip value={item.flag} /></TableCell><TableCell>{onlyDate(item.observedAt)}</TableCell></TableRow>)}</TableBody></Table></TableContainer> : <EmptyState icon="fa-chart-line" title="Sin resultados" />}</SectionCard>
  </Box>;

  const renderStudies = () => <SectionCard title="Estudios diagnósticos" subtitle="Radiología, ecografía, ECG, patología y otros" action={<Button disabled={!selectedPatient} startIcon={<Icon name="fa-plus" />} onClick={() => openDialog('study', { kind: 'xray', status: 'ordered', scheduledAt: localDateTime(60) })}>Nuevo estudio</Button>}>{studies.length ? <TableContainer><Table><TableHead><TableRow><TableCell>Estudio</TableCell><TableCell>Zona</TableCell><TableCell>Fecha</TableCell><TableCell>Hallazgos</TableCell><TableCell>Impresión</TableCell><TableCell>Estado</TableCell></TableRow></TableHead><TableBody>{studies.map((item) => <TableRow key={item.id}><TableCell><b>{item.title}</b><br /><Typography variant="caption">{item.kind}</Typography></TableCell><TableCell>{item.bodySite || '—'}</TableCell><TableCell>{compactDate(item.performedAt || item.scheduledAt)}</TableCell><TableCell>{item.findings || 'Pendiente'}</TableCell><TableCell>{item.impression || 'Pendiente'}</TableCell><TableCell><StatusChip value={item.status} /></TableCell></TableRow>)}</TableBody></Table></TableContainer> : <EmptyState icon="fa-x-ray" title="Sin estudios" />}</SectionCard>;

  const renderHospital = () => <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 320px' }, gap: 1.5 }}>
    <SectionCard title="Hospitalización" subtitle="Admisiones, jaulas, plan de cuidados y alta" action={<Button disabled={!selectedPatient} startIcon={<Icon name="fa-plus" />} onClick={() => openDialog('hospitalization', { admittedAt: localDateTime() })}>Nueva admisión</Button>}>{hospitalizations.length ? <Stack gap={.8}>{hospitalizations.map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1.1 }}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="subtitle2">{item.admissionNumber}</Typography><Typography variant="caption">{item.ward || 'Área general'} · Jaula {item.cage || '—'} · {compactDate(item.admittedAt)}</Typography></Box><StatusChip value={item.status} /></Stack><Typography variant="body2" sx={{ mt: .8 }}><b>Motivo:</b> {item.reason}</Typography><Typography variant="body2"><b>Diagnóstico:</b> {item.diagnosis || 'En evaluación'}</Typography><Stack direction="row" gap={.6} mt={1}><Button variant="outlined" onClick={() => openDialog('observation', { hospitalizationId: item.id, type: 'vitals' })}>Registrar control</Button>{!['discharged', 'cancelled'].includes(item.status) && <Button color="success" variant="outlined" onClick={async () => { await VeterinaryService.updateHospitalizationStatus(item.id, { status: 'discharged' }); await loadPatientData(selectedPatientId); toast.success('Alta registrada.'); }}>Dar alta</Button>}</Stack></Paper>)}</Stack> : <EmptyState icon="fa-house-medical" title="Sin hospitalizaciones" />}</SectionCard>
    <SectionCard title="Monitoreo activo" subtitle="Pacientes admitidos y observados"><Metric icon="fa-bed-pulse" label="Hospitalizados" value={dashboard.hospitalized || 0} tone="error" /><Alert severity="info" sx={{ mt: 1 }}>Registra signos vitales, medicación, fluidos y alimentación desde cada admisión.</Alert></SectionCard>
  </Box>;

  const renderProcedures = () => <SectionCard title="Procedimientos y cirugías" subtitle="Planificación, anestesia, ejecución y resultado" action={<Button disabled={!selectedPatient} startIcon={<Icon name="fa-plus" />} onClick={() => openDialog('procedure', { status: 'planned', scheduledAt: localDateTime(60) })}>Nuevo procedimiento</Button>}>{procedures.length ? <TableContainer><Table><TableHead><TableRow><TableCell>Procedimiento</TableCell><TableCell>Tipo</TableCell><TableCell>Programado</TableCell><TableCell>Anestesia</TableCell><TableCell>Resultado</TableCell><TableCell>Estado</TableCell></TableRow></TableHead><TableBody>{procedures.map((item) => <TableRow key={item.id}><TableCell><b>{item.name}</b></TableCell><TableCell>{item.kind}</TableCell><TableCell>{compactDate(item.performedAt || item.scheduledAt)}</TableCell><TableCell>{item.anesthesia || '—'}</TableCell><TableCell>{item.outcome || 'Pendiente'}</TableCell><TableCell><StatusChip value={item.status} /></TableCell></TableRow>)}</TableBody></Table></TableContainer> : <EmptyState icon="fa-stethoscope" title="Sin procedimientos" />}</SectionCard>;

  const renderCommunications = () => <SectionCard title="Seguimiento multicanal" subtitle="WhatsApp, correo, SMS y trazabilidad por mascota" action={<Button variant="outlined" startIcon={<Icon name="fa-pen-to-square" />} data-route="mensajes">Editar plantillas</Button>}>{communications.length ? <TableContainer><Table><TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Canal</TableCell><TableCell>Evento</TableCell><TableCell>Destinatario</TableCell><TableCell>Estado</TableCell></TableRow></TableHead><TableBody>{communications.map((item) => <TableRow key={item.id}><TableCell>{compactDate(item.createdAt)}</TableCell><TableCell>{item.channel}</TableCell><TableCell>{item.event.replaceAll('_', ' ')}</TableCell><TableCell>{item.recipient}</TableCell><TableCell><StatusChip value={item.status} /></TableCell></TableRow>)}</TableBody></Table></TableContainer> : <EmptyState icon="fa-message" title="Sin comunicaciones" text="Los avisos de citas y seguimientos quedarán registrados aquí." />}</SectionCard>;

  const renderTab = () => ({ resumen: renderOverview, pacientes: renderPatients, agenda: renderAgenda, historia: renderHistory, laboratorio: renderLabs, estudios: renderStudies, hospitalizacion: renderHospital, procedimientos: renderProcedures, comunicaciones: renderCommunications }[tab] || renderOverview)();

  const dialogTitle = ({ patient: 'Nueva mascota', professional: 'Nuevo profesional', appointment: 'Nueva cita', encounter: 'Nueva consulta clínica', prescription: 'Nueva prescripción', consent: 'Nuevo consentimiento', labOrder: 'Nueva orden de laboratorio', labResult: 'Registrar resultado', study: 'Nuevo estudio diagnóstico', hospitalization: 'Nueva hospitalización', observation: 'Control de hospitalización', procedure: 'Nuevo procedimiento' })[dialog] || 'Nuevo registro';

  const professionalSelect = <TextField select label="Profesional" value={field('professionalId')} onChange={setField('professionalId')}><MenuItem value="">Por asignar</MenuItem>{professionals.map((item) => <MenuItem key={item.id} value={item.id}>{item.fullName} · {item.specialty}</MenuItem>)}</TextField>;
  const patientSelect = <TextField select label="Mascota" required value={field('patientId', selectedPatientId)} onChange={setField('patientId')}><MenuItem value="">Seleccionar</MenuItem>{patients.map((item) => <MenuItem key={item.id} value={item.id}>{item.displayName} · {item.guardianName || 'Sin tutor'}</MenuItem>)}</TextField>;

  const renderDialogFields = () => {
    switch (dialog) {
      case 'patient': return <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.1 }}><TextField label="Nombre de la mascota" required value={field('displayName')} onChange={setField('displayName')} /><TextField label="Especie" required value={field('species')} onChange={setField('species')} /><TextField label="Raza" value={field('breed')} onChange={setField('breed')} /><TextField label="Color" value={field('color')} onChange={setField('color')} /><TextField select label="Sexo" value={field('sex')} onChange={setField('sex')}><MenuItem value="">Sin indicar</MenuItem><MenuItem value="male">Macho</MenuItem><MenuItem value="female">Hembra</MenuItem></TextField><TextField label="Nacimiento" type="date" InputLabelProps={{ shrink: true }} value={field('birthDate')} onChange={setField('birthDate')} /><TextField label="Microchip" value={field('microchip')} onChange={setField('microchip')} /><TextField label="Tutor" required value={field('guardianName')} onChange={setField('guardianName')} /><TextField label="Teléfono tutor" value={field('guardianPhone')} onChange={setField('guardianPhone')} /><TextField label="Correo tutor" type="email" value={field('guardianEmail')} onChange={setField('guardianEmail')} /><TextField label="Alergias" multiline minRows={2} value={field('allergies')} onChange={setField('allergies')} /><TextField label="Condiciones / antecedentes" multiline minRows={2} value={field('conditions')} onChange={setField('conditions')} /><TextField label="Notas" multiline minRows={2} value={field('notes')} onChange={setField('notes')} sx={{ gridColumn: '1/-1' }} /></Box>;
      case 'professional': return <Stack gap={1.1}><TextField label="Nombre completo" required value={field('fullName')} onChange={setField('fullName')} /><TextField select label="Especialidad" value={field('specialty', 'Medicina veterinaria general')} onChange={setField('specialty')}>{['Medicina veterinaria general','Cirugía veterinaria','Dermatología veterinaria','Cardiología veterinaria','Diagnóstico por imágenes','Anestesiología','Hospitalización','Laboratorio clínico','Odontología veterinaria'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField><TextField label="Matrícula / licencia" value={field('licenseNumber')} onChange={setField('licenseNumber')} /><TextField label="Correo" type="email" value={field('email')} onChange={setField('email')} /><TextField label="Teléfono" value={field('phone')} onChange={setField('phone')} /></Stack>;
      case 'appointment': return <Stack gap={1.1}>{patientSelect}{professionalSelect}<Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}><TextField label="Inicio" type="datetime-local" InputLabelProps={{ shrink: true }} value={field('startsAt')} onChange={setField('startsAt')} /><TextField label="Fin" type="datetime-local" InputLabelProps={{ shrink: true }} value={field('endsAt')} onChange={setField('endsAt')} /></Box><TextField label="Motivo" required value={field('reason')} onChange={setField('reason')} /><TextField select label="Canal" value={field('channel', 'onsite')} onChange={setField('channel')}><MenuItem value="onsite">En clínica</MenuItem><MenuItem value="home_visit">Domicilio</MenuItem><MenuItem value="telemedicine">Teleconsulta</MenuItem></TextField><TextField label="Consultorio / sala" value={field('room')} onChange={setField('room')} /><TextField label="Notas" multiline minRows={2} value={field('notes')} onChange={setField('notes')} /></Stack>;
      case 'encounter': return <Stack gap={1.1}>{professionalSelect}<TextField select label="Especialidad" value={field('specialty', 'Medicina veterinaria general')} onChange={setField('specialty')}><MenuItem value="Medicina veterinaria general">Medicina veterinaria general</MenuItem><MenuItem value="Cirugía veterinaria">Cirugía veterinaria</MenuItem><MenuItem value="Dermatología veterinaria">Dermatología veterinaria</MenuItem><MenuItem value="Hospitalización">Hospitalización</MenuItem></TextField><TextField label="Motivo / subjetivo" multiline minRows={2} value={field('subjective')} onChange={setField('subjective')} /><TextField label="Hallazgos / objetivo" multiline minRows={2} value={field('objective')} onChange={setField('objective')} /><TextField label="Evaluación / diagnóstico" multiline minRows={2} value={field('assessment')} onChange={setField('assessment')} /><TextField label="Plan / seguimiento" multiline minRows={2} value={field('plan')} onChange={setField('plan')} /><TextField label="Códigos diagnósticos (separados por coma)" value={field('diagnosisCodes')} onChange={setField('diagnosisCodes')} /></Stack>;
      case 'prescription': return <Stack gap={1.1}>{professionalSelect}<TextField label="Medicamento" required value={field('medication')} onChange={setField('medication')} /><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}><TextField label="Dosis" value={field('dose')} onChange={setField('dose')} /><TextField label="Frecuencia" value={field('frequency')} onChange={setField('frequency')} /><TextField label="Duración" value={field('duration')} onChange={setField('duration')} /><TextField label="Vía" value={field('route')} onChange={setField('route')} /></Box><TextField label="Indicaciones" multiline minRows={3} value={field('instructions')} onChange={setField('instructions')} /></Stack>;
      case 'consent': return <Stack gap={1.1}><TextField label="Tipo de consentimiento" required value={field('kind')} onChange={setField('kind')} /><TextField select label="Estado" value={field('status', 'pending')} onChange={setField('status')}><MenuItem value="pending">Pendiente</MenuItem><MenuItem value="signed">Firmado</MenuItem></TextField><TextField label="Firmante" value={field('signerName')} onChange={setField('signerName')} /><TextField label="Notas" multiline minRows={3} value={field('notes')} onChange={setField('notes')} /></Stack>;
      case 'labOrder': return <Stack gap={1.1}>{professionalSelect}<Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}><TextField select label="Prioridad" value={field('priority', 'routine')} onChange={setField('priority')}><MenuItem value="routine">Rutina</MenuItem><MenuItem value="urgent">Urgente</MenuItem><MenuItem value="stat">STAT</MenuItem></TextField><TextField label="Laboratorio" value={field('laboratory')} onChange={setField('laboratory')} /><TextField label="Tipo de muestra" value={field('specimenType')} onChange={setField('specimenType')} /><TextField select label="Ayuno" value={field('fasting') ? 'yes' : 'no'} onChange={(e) => setForm((c) => ({ ...c, fasting: e.target.value === 'yes' }))}><MenuItem value="no">No</MenuItem><MenuItem value="yes">Sí</MenuItem></TextField></Box><TextField label="Pruebas — una por línea: Nombre|Categoría|Unidad|Mín|Máx" required multiline minRows={5} value={field('tests')} onChange={setField('tests')} /><TextField label="Notas" multiline minRows={2} value={field('notes')} onChange={setField('notes')} /></Stack>;
      case 'labResult': return <Stack gap={1.1}><TextField select label="Orden" required value={field('labOrderId')} onChange={setField('labOrderId')}>{labOrders.map((item) => <MenuItem key={item.id} value={item.id}>{item.orderNumber}</MenuItem>)}</TextField><TextField label="Prueba" required value={field('testName')} onChange={setField('testName')} /><TextField label="Categoría" value={field('category')} onChange={setField('category')} /><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}><TextField label="Valor numérico" type="number" value={field('valueNumeric')} onChange={setField('valueNumeric')} /><TextField label="Valor textual" value={field('valueText')} onChange={setField('valueText')} /><TextField label="Unidad" value={field('unit')} onChange={setField('unit')} /><TextField label="Referencia textual" value={field('referenceText')} onChange={setField('referenceText')} /><TextField label="Mínimo" type="number" value={field('referenceMin')} onChange={setField('referenceMin')} /><TextField label="Máximo" type="number" value={field('referenceMax')} onChange={setField('referenceMax')} /></Box><TextField label="Verificado por" value={field('verifiedBy')} onChange={setField('verifiedBy')} /><TextField label="Notas" multiline minRows={2} value={field('notes')} onChange={setField('notes')} /></Stack>;
      case 'study': return <Stack gap={1.1}>{professionalSelect}<TextField select label="Tipo" value={field('kind', 'xray')} onChange={setField('kind')}>{[['xray','Radiografía'],['ultrasound','Ecografía'],['ecg','ECG'],['ct','Tomografía'],['mri','Resonancia'],['pathology','Patología'],['dental','Dental'],['other','Otro']].map(([value,label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField><TextField label="Título" required value={field('title')} onChange={setField('title')} /><TextField label="Zona anatómica" value={field('bodySite')} onChange={setField('bodySite')} /><TextField label="Programado" type="datetime-local" InputLabelProps={{ shrink: true }} value={field('scheduledAt')} onChange={setField('scheduledAt')} /><TextField label="Hallazgos" multiline minRows={3} value={field('findings')} onChange={setField('findings')} /><TextField label="Impresión diagnóstica" multiline minRows={3} value={field('impression')} onChange={setField('impression')} /><TextField label="URL externa" value={field('externalUrl')} onChange={setField('externalUrl')} /></Stack>;
      case 'hospitalization': return <Stack gap={1.1}>{professionalSelect}<TextField label="Ingreso" type="datetime-local" InputLabelProps={{ shrink: true }} value={field('admittedAt')} onChange={setField('admittedAt')} /><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}><TextField label="Área / sala" value={field('ward')} onChange={setField('ward')} /><TextField label="Jaula" value={field('cage')} onChange={setField('cage')} /></Box><TextField label="Motivo" required multiline minRows={2} value={field('reason')} onChange={setField('reason')} /><TextField label="Diagnóstico inicial" multiline minRows={2} value={field('diagnosis')} onChange={setField('diagnosis')} /><TextField label="Fluidos" value={field('fluids')} onChange={setField('fluids')} /><TextField label="Alimentación" value={field('feeding')} onChange={setField('feeding')} /><TextField label="Monitoreo" value={field('monitoring')} onChange={setField('monitoring')} /></Stack>;
      case 'observation': return <Stack gap={1.1}><TextField select label="Hospitalización" required value={field('hospitalizationId')} onChange={setField('hospitalizationId')}>{hospitalizations.filter((item) => !['discharged','cancelled'].includes(item.status)).map((item) => <MenuItem key={item.id} value={item.id}>{item.admissionNumber} · {item.patientName || selectedPatient?.displayName}</MenuItem>)}</TextField>{professionalSelect}<TextField select label="Tipo de control" value={field('type', 'vitals')} onChange={setField('type')}><MenuItem value="vitals">Signos vitales</MenuItem><MenuItem value="medication">Medicamento</MenuItem><MenuItem value="feeding">Alimentación</MenuItem><MenuItem value="fluid">Fluidos</MenuItem><MenuItem value="procedure">Procedimiento</MenuItem><MenuItem value="note">Nota</MenuItem></TextField><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}><TextField label="Temperatura" value={field('temperature')} onChange={setField('temperature')} /><TextField label="Frecuencia cardíaca" value={field('heartRate')} onChange={setField('heartRate')} /><TextField label="Frecuencia respiratoria" value={field('respiratoryRate')} onChange={setField('respiratoryRate')} /><TextField label="Peso" value={field('weight')} onChange={setField('weight')} /></Box><TextField label="Observación" multiline minRows={3} value={field('note')} onChange={setField('note')} /></Stack>;
      case 'procedure': return <Stack gap={1.1}>{professionalSelect}<TextField label="Procedimiento" required value={field('name')} onChange={setField('name')} /><TextField label="Tipo" value={field('kind', 'procedure')} onChange={setField('kind')} /><TextField select label="Estado" value={field('status', 'planned')} onChange={setField('status')}><MenuItem value="planned">Planificado</MenuItem><MenuItem value="scheduled">Programado</MenuItem><MenuItem value="in_progress">En curso</MenuItem><MenuItem value="completed">Completado</MenuItem></TextField><TextField label="Programado" type="datetime-local" InputLabelProps={{ shrink: true }} value={field('scheduledAt')} onChange={setField('scheduledAt')} /><TextField label="Anestesia" value={field('anesthesia')} onChange={setField('anesthesia')} /><TextField label="Notas" multiline minRows={3} value={field('notes')} onChange={setField('notes')} /><TextField label="Resultado" multiline minRows={2} value={field('outcome')} onChange={setField('outcome')} /></Stack>;
      default: return null;
    }
  };

  return <ThemeProvider theme={theme}><CssBaseline /><Toaster position="top-right" toastOptions={{ style: { fontSize: 12, fontWeight: 750, borderRadius: 11 } }} />
    <Box sx={{ display: 'grid', gap: 1.4 }}>
      <Paper variant="outlined" sx={{ p: { xs: 1.3, md: 1.7 }, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        <Box><Typography variant="caption" color="primary" sx={{ textTransform: 'uppercase', letterSpacing: '.13em', fontWeight: 900 }}>Vertical veterinaria</Typography><Typography variant="h4">Clínica veterinaria</Typography><Typography variant="body2" color="text.secondary">Mascotas, agenda, historia clínica, laboratorio, hospitalización y seguimiento en una sola vista.</Typography></Box>
        <Stack direction="row" gap={.7} sx={{ flexWrap: 'wrap' }}><Button variant="outlined" startIcon={<Icon name="fa-user-doctor" />} onClick={() => openDialog('professional', { specialty: 'Medicina veterinaria general' })}>Profesional</Button><Button variant="outlined" startIcon={<Icon name="fa-rotate" />} onClick={refreshAll}>Actualizar</Button><Button startIcon={<Icon name="fa-plus" />} onClick={() => openDialog('patient')}>Nueva mascota</Button></Stack>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', md: 'repeat(3,minmax(0,1fr))', xl: 'repeat(6,minmax(0,1fr))' }, gap: 1 }}>
        <Metric icon="fa-paw" label="Mascotas activas" value={dashboard.patients || patients.length} /><Metric icon="fa-calendar-check" label="Citas de hoy" value={dashboard.appointmentsToday?.total || 0} hint={`${dashboard.appointmentsToday?.pending || 0} pendientes`} tone="success" /><Metric icon="fa-flask-vial" label="Laboratorios" value={dashboard.pendingLabOrders || 0} hint="pendientes" tone="secondary" /><Metric icon="fa-triangle-exclamation" label="Resultados alerta" value={dashboard.abnormalResults || 0} tone="warning" /><Metric icon="fa-house-medical" label="Hospitalizados" value={dashboard.hospitalized || 0} tone="error" /><Metric icon="fa-syringe" label="Vacunas próximas" value={dashboard.vaccinesDue || 0} tone="success" />
      </Box>

      <Paper variant="outlined" sx={{ px: 1, overflow: 'hidden' }}><Tabs value={tab} onChange={changeTab} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Módulos veterinarios">{TABS.map(([key, label, icon]) => <Tab key={key} value={key} icon={<Icon name={icon} />} iconPosition="start" label={label} onClick={(event) => { event.stopPropagation(); setTab(key); updateUrl(key, selectedPatientId); }} />)}</Tabs></Paper>

      {loading ? <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={30} /><Typography variant="body2" mt={1}>Cargando módulo veterinario...</Typography><LinearProgress sx={{ mt: 2 }} /></Paper> : renderTab()}
    </Box>

    <Dialog open={Boolean(dialog)} onClose={closeDialog} fullWidth maxWidth={['patient','encounter','labOrder','study','hospitalization','procedure'].includes(dialog) ? 'md' : 'sm'}>
      <DialogTitle sx={{ fontWeight: 900, fontSize: '1rem', pb: 1 }}>{dialogTitle}</DialogTitle><DialogContent dividers sx={{ pt: 1.5 }}>{renderDialogFields()}</DialogContent><DialogActions sx={{ px: 2, py: 1.2 }}><Button onClick={closeDialog} disabled={busy} color="inherit">Cancelar</Button><Button onClick={submit} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <Icon name="fa-floppy-disk" />}>Guardar</Button></DialogActions>
    </Dialog>
  </ThemeProvider>;
}

let activeRoot = null;

export const VeterinaryClinicPage = {
  render() {
    return '<section class="cg-page-stack"><div id="veterinaryClinicRoot"></div></section>';
  },
  mount(state, { UrlStateService }) {
    const host = document.getElementById('veterinaryClinicRoot');
    if (!host) return;
    try { activeRoot?.unmount(); } catch { /* previous host was replaced by the shell */ }
    activeRoot = createRoot(host);
    activeRoot.render(<VeterinaryWorkspace state={state} UrlStateService={UrlStateService} />);
  }
};
