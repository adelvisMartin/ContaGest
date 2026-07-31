import { PageHeader, Button, Badge } from '../components/ui/index.js';
import { HealthVerticalService } from '../services/verticalService.js';
import { escapeHtml } from '../utils/dom.js';

const localDateTime = (minutes = 0) => {
  const date = new Date(Date.now() + minutes * 60000 - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
};

const value = (item) => escapeHtml(item ?? '');
const option = (item, label) => `<option value="${value(item.id)}">${value(label)}</option>`;

function summaryCards(summary = {}, animal = false) {
  return `<section class="cg-vertical-kpis">
    <article><span>${animal ? 'Mascotas activas' : 'Pacientes activos'}</span><strong>${Number(animal ? summary.patients?.animals : summary.patients?.humans) || 0}</strong><i class="fa-solid ${animal ? 'fa-paw' : 'fa-hospital-user'}"></i></article>
    <article><span>Citas de hoy</span><strong>${Number(summary.appointmentsToday?.total || 0)}</strong><small>${Number(summary.appointmentsToday?.upcoming || 0)} pendientes</small></article>
    <article><span>Historias del mes</span><strong>${Number(summary.encountersThisMonth || 0)}</strong><i class="fa-solid fa-notes-medical"></i></article>
    <article><span>${animal ? 'Vacunas próximas' : 'Seguimientos próximos'}</span><strong>${Number(summary.vaccinesDue || 0)}</strong><i class="fa-solid fa-bell"></i></article>
  </section>`;
}

function patientsTable(patients, animal) {
  if (!patients.length) return '<div class="cgx-empty"><i class="fa-solid fa-folder-open"></i><strong>Sin registros</strong><p>Crea el primer expediente para comenzar.</p></div>';
  return `<div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>${animal ? 'Mascota' : 'Paciente'}</th><th>${animal ? 'Tutor' : 'Documento'}</th><th>Contacto</th><th>Datos</th><th>Estado</th><th></th></tr></thead><tbody>${patients.map((patient) => `<tr>
    <td><strong>${value(patient.displayName)}</strong><br><small>${animal ? `${value(patient.species || 'Especie')} · ${value(patient.breed || 'Sin raza')}` : value([patient.firstName,patient.lastName].filter(Boolean).join(' '))}</small></td>
    <td>${animal ? value(patient.guardianName || 'Sin tutor') : value(patient.idNumber || 'Sin documento')}</td>
    <td>${value(patient.phone || patient.guardianPhone || '—')}<br><small>${value(patient.email || patient.guardianEmail || '')}</small></td>
    <td>${animal ? `Microchip: ${value(patient.microchip || '—')}` : `Nacimiento: ${value(patient.birthDate ? String(patient.birthDate).slice(0,10) : '—')}`}</td>
    <td>${Badge(patient.active ? 'Activo' : 'Inactivo', patient.active ? 'success' : 'warning')}</td>
    <td><button type="button" class="cgx-icon-action" data-care-patient="${value(patient.id)}" aria-label="Abrir historia"><i class="fa-solid fa-file-waveform"></i></button></td>
  </tr>`).join('')}</tbody></table></div>`;
}

function appointmentsList(appointments) {
  if (!appointments.length) return '<p class="cg-vertical-empty">No hay citas en los próximos 30 días.</p>';
  return `<div class="cg-appointment-list">${appointments.slice(0,20).map((appointment) => `<article>
    <time>${new Date(appointment.startsAt).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})}</time>
    <div><strong>${value(appointment.patientName)}</strong><span>${value(appointment.professionalName || 'Profesional por asignar')} · ${value(appointment.reason || appointment.type)}</span></div>
    ${Badge(appointment.status, ['confirmed','completed'].includes(appointment.status) ? 'success' : appointment.status === 'cancelled' ? 'danger' : 'warning')}
  </article>`).join('')}</div>`;
}

function encounterList(encounters) {
  if (!encounters.length) return '<p class="cg-vertical-empty">Selecciona un paciente para consultar o crear su historia.</p>';
  return encounters.map((encounter) => `<article class="cg-clinical-note">
    <header><div><strong>${value(encounter.specialty)}</strong><span>${new Date(encounter.createdAt).toLocaleString('es-VE')}</span></div>${Badge(encounter.status, encounter.status === 'signed' ? 'success' : 'warning')}</header>
    ${encounter.subjective ? `<p><b>Motivo / subjetivo:</b> ${value(encounter.subjective)}</p>` : ''}
    ${encounter.objective ? `<p><b>Hallazgos:</b> ${value(encounter.objective)}</p>` : ''}
    ${encounter.assessment ? `<p><b>Evaluación:</b> ${value(encounter.assessment)}</p>` : ''}
    ${encounter.plan ? `<p><b>Plan:</b> ${value(encounter.plan)}</p>` : ''}
    ${encounter.confidential ? '<small><i class="fa-solid fa-lock"></i> Nota confidencial</small>' : ''}
  </article>`).join('');
}

export const HealthcarePage = {
  render(state) {
    const animal = state.route === 'veterinaria';
    const data = state.healthVertical || {};
    const patients = (data.patients || []).filter((patient) => patient.kind === (animal ? 'animal' : 'human'));
    const professionals = data.professionals || [];
    const appointments = (data.appointments || []).filter((appointment) => appointment.patientKind === (animal ? 'animal' : 'human'));
    const selectedPatient = patients.find((patient) => patient.id === data.selectedPatientId);
    const specialtyOptions = animal
      ? ['Medicina veterinaria general','Cirugía veterinaria','Dermatología veterinaria','Vacunación','Hospitalización']
      : ['Medicina general','Psicología','Traumatología','Pediatría','Cardiología','Nutrición','Fisioterapia'];

    return `<section class="cg-page-stack cg-vertical-page">
      ${PageHeader({
        eyebrow: animal ? 'Vertical veterinaria' : 'Vertical salud',
        title: animal ? 'Gestión clínica veterinaria' : 'Gestión médica por especialidades',
        description: animal
          ? 'Tutores, mascotas, agenda, historias clínicas, vacunas, mediciones y seguimiento.'
          : 'Pacientes, profesionales, agenda, historia clínica, mediciones y notas confidenciales por especialidad.',
        actions: `${Button({id:'btnCareRefresh',text:'Actualizar',icon:'fa-rotate',variant:'secondary'})}${Button({text:'Plantillas WhatsApp',icon:'fa-brands fa-whatsapp',variant:'secondary',attrs:'data-route="mensajes"'})}`
      })}
      ${summaryCards(data.summary, animal)}

      <div class="cg-vertical-grid">
        <section class="surface cg-vertical-panel cg-vertical-wide">
          <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Expedientes</p><h3>${animal ? 'Mascotas y tutores' : 'Pacientes'}</h3></div><button type="button" class="cgx-btn cgx-btn-primary" data-toggle-panel="carePatientForm"><i class="fa-solid fa-plus"></i> Nuevo</button></header>
          <form id="carePatientForm" class="cg-inline-form is-collapsed">
            <input type="hidden" name="kind" value="${animal ? 'animal' : 'human'}">
            <label><span>${animal ? 'Nombre de la mascota' : 'Nombre para mostrar'}</span><input class="input" name="displayName" required></label>
            ${animal ? `
              <label><span>Especie</span><input class="input" name="species" placeholder="Canino, felino…" required></label>
              <label><span>Raza</span><input class="input" name="breed"></label>
              <label><span>Tutor</span><input class="input" name="guardianName" required></label>
              <label><span>Teléfono tutor</span><input class="input" name="guardianPhone"></label>
              <label><span>Microchip</span><input class="input" name="microchip"></label>
            ` : `
              <label><span>Nombres</span><input class="input" name="firstName"></label>
              <label><span>Apellidos</span><input class="input" name="lastName"></label>
              <label><span>Documento</span><input class="input" name="idNumber"></label>
              <label><span>Teléfono</span><input class="input" name="phone"></label>
              <label><span>Correo</span><input class="input" type="email" name="email"></label>
            `}
            <label><span>Fecha de nacimiento</span><input class="input" type="date" name="birthDate"></label>
            <label class="cg-form-span"><span>Antecedentes / condiciones</span><textarea class="textarea" name="conditions"></textarea></label>
            <div class="cg-form-actions">${Button({text:'Guardar expediente',icon:'fa-floppy-disk',type:'submit'})}</div>
          </form>
          ${patientsTable(patients, animal)}
        </section>

        <section class="surface cg-vertical-panel">
          <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Equipo</p><h3>Profesionales</h3></div></header>
          <form id="careProfessionalForm" class="cg-stack-form">
            <input class="input" name="fullName" placeholder="Nombre del profesional" required>
            <select class="select" name="specialty">${specialtyOptions.map((item) => `<option>${value(item)}</option>`).join('')}</select>
            <input class="input" name="licenseNumber" placeholder="Matrícula / licencia">
            ${Button({text:'Agregar profesional',icon:'fa-user-doctor',type:'submit',variant:'secondary'})}
          </form>
          <div class="cg-mini-list">${professionals.length ? professionals.map((professional) => `<article><span class="cg-mini-avatar">${value(professional.fullName?.slice(0,2).toUpperCase())}</span><div><strong>${value(professional.fullName)}</strong><small>${value(professional.specialty)}</small></div>${Badge(professional.status,'success')}</article>`).join('') : '<p>Sin profesionales registrados.</p>'}</div>
        </section>

        <section class="surface cg-vertical-panel">
          <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Agenda</p><h3>Nueva cita</h3></div></header>
          <form id="careAppointmentForm" class="cg-stack-form">
            <select class="select" name="patientId" required><option value="">Seleccionar ${animal ? 'mascota' : 'paciente'}</option>${patients.map((patient) => option(patient,patient.displayName)).join('')}</select>
            <select class="select" name="professionalId"><option value="">Profesional por asignar</option>${professionals.map((professional) => option(professional,`${professional.fullName} · ${professional.specialty}`)).join('')}</select>
            <div class="cg-two-fields"><label><span>Inicio</span><input class="input" type="datetime-local" name="startsAt" value="${localDateTime(60)}" required></label><label><span>Fin</span><input class="input" type="datetime-local" name="endsAt" value="${localDateTime(90)}" required></label></div>
            <input class="input" name="reason" placeholder="Motivo de consulta">
            ${Button({text:'Agendar cita',icon:'fa-calendar-check',type:'submit'})}
          </form>
        </section>

        <section class="surface cg-vertical-panel cg-vertical-wide">
          <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Agenda próxima</p><h3>Citas y seguimiento</h3></div></header>
          ${appointmentsList(appointments)}
        </section>

        <section class="surface cg-vertical-panel cg-vertical-wide">
          <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Historia clínica</p><h3>${selectedPatient ? value(selectedPatient.displayName) : 'Selecciona un expediente'}</h3></div></header>
          ${selectedPatient ? `<form id="careEncounterForm" class="cg-clinical-form">
            <input type="hidden" name="patientId" value="${value(selectedPatient.id)}">
            <select class="select" name="professionalId"><option value="">Profesional</option>${professionals.map((professional) => option(professional,professional.fullName)).join('')}</select>
            <select class="select" name="specialty">${specialtyOptions.map((item) => `<option>${value(item)}</option>`).join('')}</select>
            <label><span>Motivo / subjetivo</span><textarea class="textarea" name="subjective"></textarea></label>
            <label><span>Hallazgos / objetivo</span><textarea class="textarea" name="objective"></textarea></label>
            <label><span>Evaluación / diagnóstico</span><textarea class="textarea" name="assessment"></textarea></label>
            <label><span>Plan / seguimiento</span><textarea class="textarea" name="plan"></textarea></label>
            ${!animal ? '<label class="cg-check-row"><input type="checkbox" name="confidential"><span>Nota confidencial (psicología u observación restringida)</span></label>' : ''}
            <div class="cg-form-actions">${Button({text:'Guardar nota clínica',icon:'fa-file-medical',type:'submit'})}</div>
          </form>` : ''}
          <div class="cg-clinical-timeline">${encounterList(data.encounters || [])}</div>
        </section>

        ${selectedPatient ? `<section class="surface cg-vertical-panel">
          <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Mediciones</p><h3>Registrar control</h3></div></header>
          <form id="careMeasurementForm" class="cg-stack-form"><input type="hidden" name="patientId" value="${value(selectedPatient.id)}"><select class="select" name="kind"><option value="weight">Peso</option><option value="height">Altura</option><option value="blood_pressure_systolic">Presión sistólica</option><option value="blood_pressure_diastolic">Presión diastólica</option><option value="temperature">Temperatura</option><option value="heart_rate">Frecuencia cardíaca</option></select><div class="cg-two-fields"><input class="input" type="number" step="0.01" name="value" placeholder="Valor" required><input class="input" name="unit" placeholder="kg, cm, mmHg…" required></div>${Button({text:'Guardar medición',icon:'fa-chart-line',type:'submit',variant:'secondary'})}</form>
        </section>` : ''}

        ${animal && selectedPatient ? `<section class="surface cg-vertical-panel">
          <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Prevención</p><h3>Vacunas</h3></div></header>
          <form id="careImmunizationForm" class="cg-stack-form"><input type="hidden" name="patientId" value="${value(selectedPatient.id)}"><input class="input" name="vaccine" placeholder="Vacuna" required><div class="cg-two-fields"><input class="input" name="dose" placeholder="Dosis"><input class="input" name="lot" placeholder="Lote"></div><label><span>Próxima dosis</span><input class="input" type="date" name="nextDueAt"></label>${Button({text:'Registrar vacuna',icon:'fa-syringe',type:'submit',variant:'secondary'})}</form>
        </section>` : ''}
      </div>
    </section>`;
  },

  mount(state, { Store, Toast }) {
    const animal = state.route === 'veterinaria';
    const load = async ({silent=false}={}) => {
      try {
        const [summary,patients,professionals,appointments] = await Promise.all([
          HealthVerticalService.summary(),
          HealthVerticalService.patients(),
          HealthVerticalService.professionals(),
          HealthVerticalService.appointments()
        ]);
        Store.update((draft) => { draft.healthVertical = { ...(draft.healthVertical||{}), summary,patients,professionals,appointments,loaded:true,loading:false }; });
        if (!silent) Toast.show('Módulo clínico actualizado.','success');
      } catch (error) {
        Store.update((draft) => { draft.healthVertical = { ...(draft.healthVertical||{}),loading:false,error:error.message }; });
        if (!silent) Toast.show(error.message,'error');
      }
    };
    if (!state.healthVertical?.loaded && !state.healthVertical?.loading) {
      Store.update((draft) => { draft.healthVertical={...(draft.healthVertical||{}),loading:true}; });
      load({silent:true});
    }
    document.getElementById('btnCareRefresh')?.addEventListener('click',()=>load());
    document.querySelectorAll('[data-toggle-panel]').forEach((button)=>button.addEventListener('click',()=>document.getElementById(button.dataset.togglePanel)?.classList.toggle('is-collapsed')));
    document.querySelectorAll('[data-care-patient]').forEach((button)=>button.addEventListener('click',async()=>{
      try { const encounters=await HealthVerticalService.encounters(button.dataset.carePatient); Store.update((draft)=>{draft.healthVertical={...(draft.healthVertical||{}),selectedPatientId:button.dataset.carePatient,encounters};}); }
      catch(error){Toast.show(error.message,'error');}
    }));

    const handle = (id,service,transform=(data)=>data,success='Registro guardado.') => document.getElementById(id)?.addEventListener('submit',async(event)=>{
      event.preventDefault(); const form=event.currentTarget; const data=Object.fromEntries(new FormData(form));
      try { await service(transform(data,form)); Toast.show(success,'success'); form.reset(); await load({silent:true}); }
      catch(error){Toast.show(error.message,'error');}
    });
    handle('carePatientForm',HealthVerticalService.createPatient,(data)=>({...data,active:true}),animal?'Mascota registrada.':'Paciente registrado.');
    handle('careProfessionalForm',HealthVerticalService.createProfessional,(data)=>({...data,status:'active',schedule:{}}),'Profesional registrado.');
    handle('careAppointmentForm',HealthVerticalService.createAppointment,(data)=>({...data,status:'scheduled',channel:'onsite'}),'Cita agendada.');
    handle('careEncounterForm',HealthVerticalService.createEncounter,(data,form)=>({...data,confidential:Boolean(form.confidential?.checked),status:'signed',diagnosisCodes:[],clinicalData:{}}),'Historia clínica actualizada.');
    handle('careMeasurementForm',HealthVerticalService.createMeasurement,(data)=>({...data,metadata:{}}),'Medición registrada.');
    handle('careImmunizationForm',HealthVerticalService.createImmunization,(data)=>data,'Vacuna registrada.');
  }
};
