import { PageHeader, Button, Badge, Field, Select, Textarea, MetricGrid, Section, DataTable, EmptyState } from '../components/ui/index.js';
import { HealthVerticalService } from '../services/verticalService.js';
import { escapeHtml } from '../utils/dom.js';

const safe = (value) => escapeHtml(String(value ?? ''));
const localDateTime = (minutes = 0) => {
  const date = new Date(Date.now() + minutes * 60000 - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
};
const specialtyOptions = ['Medicina general','Psicología','Traumatología','Pediatría','Cardiología','Nutrición','Fisioterapia'];
const optionList = (items, label) => items.map((item) => ({ value:item.id, label:label(item) }));
const statusTone = (status='') => ['confirmed','completed','signed','active'].includes(String(status).toLowerCase()) ? 'success' : ['cancelled','inactive'].includes(String(status).toLowerCase()) ? 'danger' : 'warning';

function appointmentCards(appointments = []) {
  if (!appointments.length) return EmptyState({ title:'Sin citas próximas', description:'Las citas agendadas aparecerán aquí.', iconName:'fa-calendar-day' });
  return `<div class="cg-appointment-list">${appointments.slice(0,20).map((appointment) => `<article>
    <time>${new Date(appointment.startsAt).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})}</time>
    <div><strong>${safe(appointment.patientName || 'Paciente')}</strong><span>${safe(appointment.professionalName || 'Profesional por asignar')} · ${safe(appointment.reason || appointment.type || 'Consulta')}</span></div>
    ${Badge(appointment.status || 'scheduled', statusTone(appointment.status))}
  </article>`).join('')}</div>`;
}

function encounterCards(encounters = []) {
  if (!encounters.length) return EmptyState({ title:'Sin notas clínicas', description:'Selecciona un paciente y registra la primera nota.', iconName:'fa-file-medical' });
  return `<div class="cg-clinical-timeline">${encounters.map((encounter) => `<article class="cg-clinical-note">
    <header><div><strong>${safe(encounter.specialty || 'Consulta')}</strong><span>${new Date(encounter.createdAt).toLocaleString('es-VE')}</span></div>${Badge(encounter.status || 'signed', statusTone(encounter.status))}</header>
    ${encounter.subjective ? `<p><b>Motivo / subjetivo:</b> ${safe(encounter.subjective)}</p>` : ''}
    ${encounter.objective ? `<p><b>Hallazgos:</b> ${safe(encounter.objective)}</p>` : ''}
    ${encounter.assessment ? `<p><b>Evaluación:</b> ${safe(encounter.assessment)}</p>` : ''}
    ${encounter.plan ? `<p><b>Plan:</b> ${safe(encounter.plan)}</p>` : ''}
    ${encounter.confidential ? '<small><i class="fa-solid fa-lock"></i> Nota confidencial</small>' : ''}
  </article>`).join('')}</div>`;
}

export const HealthcarePage = {
  render(state) {
    const data = state.healthVertical || {};
    const patients = (data.patients || []).filter((patient) => patient.kind === 'human');
    const professionals = data.professionals || [];
    const appointments = (data.appointments || []).filter((appointment) => !appointment.patientKind || appointment.patientKind === 'human');
    const selectedPatient = patients.find((patient) => patient.id === data.selectedPatientId);
    const summary = data.summary || {};

    const patientRows = patients.map((patient) => ({
      ...patient,
      patient: `<strong>${safe(patient.displayName)}</strong><br><small>${safe([patient.firstName,patient.lastName].filter(Boolean).join(' ') || 'Ficha clínica')}</small>`,
      document:safe(patient.idNumber || 'Sin documento'),
      contact:`${safe(patient.phone || '—')}${patient.email ? `<br><small>${safe(patient.email)}</small>` : ''}`,
      birth:safe(patient.birthDate ? String(patient.birthDate).slice(0,10) : '—'),
      status:Badge(patient.active === false ? 'Inactivo' : 'Activo', patient.active === false ? 'warning' : 'success'),
      action:`<button type="button" class="cgx-icon-action" data-care-patient="${safe(patient.id)}" aria-label="Abrir historia de ${safe(patient.displayName)}"><i class="fa-solid fa-file-waveform"></i></button>`
    }));

    const professionalRows = professionals.map((professional) => ({
      ...professional,
      name:`<strong>${safe(professional.fullName)}</strong><br><small>${safe(professional.licenseNumber || 'Sin matrícula')}</small>`,
      specialty:safe(professional.specialty || 'General'),
      status:Badge(professional.status || 'active', statusTone(professional.status))
    }));

    return `<section class="cg-page-stack cg-health-workspace">
      ${PageHeader({
        eyebrow:'Vertical salud',
        title:'Gestión médica por especialidades',
        description:'Pacientes, profesionales, agenda, historia clínica, mediciones y seguimiento dentro del sistema visual único de ContaGest.',
        actions:`${Button({id:'btnCareRefresh',text:'Actualizar',icon:'fa-rotate',variant:'secondary'})}${Button({text:'Plantillas WhatsApp',icon:'fa-brands fa-whatsapp',variant:'secondary',attrs:'data-route="mensajes"'})}`
      })}

      ${MetricGrid([
        {label:'Pacientes activos',value:String(Number(summary.patients?.humans || patients.filter((item)=>item.active!==false).length)),hint:`${patients.length} expedientes`,iconName:'fa-hospital-user',tone:'brand'},
        {label:'Citas de hoy',value:String(Number(summary.appointmentsToday?.total || 0)),hint:`${Number(summary.appointmentsToday?.upcoming || 0)} pendientes`,iconName:'fa-calendar-day',tone:Number(summary.appointmentsToday?.upcoming||0)?'warning':'success'},
        {label:'Historias del mes',value:String(Number(summary.encountersThisMonth || 0)),hint:'Notas registradas',iconName:'fa-notes-medical',tone:'neutral'},
        {label:'Seguimientos',value:String(Number(summary.followupsDue || summary.vaccinesDue || 0)),hint:'Próximos controles',iconName:'fa-bell',tone:'neutral'}
      ])}

      <div class="cg-health-grid">
        ${Section({
          title:'Pacientes',
          subtitle:'Expedientes humanos. Veterinaria tiene su módulo MUI independiente y ya no comparte esta vista.',
          actions:Button({text:'Nuevo paciente',icon:'fa-plus',attrs:'data-toggle-panel="carePatientForm"'}),
          className:'cg-health-wide',
          children:`<form id="carePatientForm" class="cg-record-form is-collapsed">
            <input type="hidden" name="kind" value="human">
            <div class="cg-record-fields">
              ${Field({labelKey:'Nombre para mostrar',name:'displayName',required:true})}
              ${Field({labelKey:'Nombres',name:'firstName'})}
              ${Field({labelKey:'Apellidos',name:'lastName'})}
              ${Field({labelKey:'Documento',name:'idNumber'})}
              ${Field({labelKey:'Teléfono',name:'phone',attrs:'inputmode="tel" autocomplete="tel"'})}
              ${Field({labelKey:'Correo',name:'email',type:'email',attrs:'autocomplete="email"'})}
              ${Field({labelKey:'Fecha de nacimiento',name:'birthDate',type:'date'})}
              ${Textarea({labelKey:'Antecedentes / condiciones',name:'conditions',className:'cg-field-wide'})}
            </div>
            <div class="cg-record-actions">${Button({text:'Guardar expediente',icon:'fa-floppy-disk',type:'submit'})}</div>
          </form>${patientRows.length ? DataTable({columns:[
            {key:'patient',label:'Paciente',render:(row)=>row.patient},
            {key:'document',label:'Documento',render:(row)=>row.document},
            {key:'contact',label:'Contacto',render:(row)=>row.contact},
            {key:'birth',label:'Nacimiento',render:(row)=>row.birth},
            {key:'status',label:'Estado',render:(row)=>row.status},
            {key:'action',label:'Historia',render:(row)=>row.action}
          ],rows:patientRows}) : EmptyState({title:'Sin pacientes',description:'Registra el primer expediente para comenzar.',iconName:'fa-user-plus'})}`
        })}

        ${Section({
          title:'Profesionales',
          subtitle:'Equipo disponible para agenda e historia clínica.',
          children:`<form id="careProfessionalForm" class="cg-record-form"><div class="cg-record-fields">
            ${Field({labelKey:'Nombre del profesional',name:'fullName',required:true})}
            ${Select({labelKey:'Especialidad',name:'specialty',options:specialtyOptions.map((value)=>({value,label:value}))})}
            ${Field({labelKey:'Matrícula / licencia',name:'licenseNumber'})}
          </div><div class="cg-record-actions">${Button({text:'Agregar profesional',icon:'fa-user-doctor',type:'submit',variant:'secondary'})}</div></form>${professionalRows.length ? DataTable({columns:[{key:'name',label:'Profesional',render:(row)=>row.name},{key:'specialty',label:'Especialidad'},{key:'status',label:'Estado',render:(row)=>row.status}],rows:professionalRows}) : EmptyState({title:'Sin profesionales',description:'Registra el primer profesional.',iconName:'fa-user-doctor'})}`
        })}

        ${Section({
          title:'Nueva cita',
          subtitle:'Agenda vinculada a paciente y profesional.',
          children:`<form id="careAppointmentForm" class="cg-record-form"><div class="cg-record-fields">
            ${Select({labelKey:'Paciente',name:'patientId',options:[{value:'',label:'Seleccionar paciente'},...optionList(patients,(item)=>item.displayName)]})}
            ${Select({labelKey:'Profesional',name:'professionalId',options:[{value:'',label:'Profesional por asignar'},...optionList(professionals,(item)=>`${item.fullName} · ${item.specialty}`)]})}
            ${Field({labelKey:'Inicio',name:'startsAt',type:'datetime-local',value:localDateTime(60),required:true})}
            ${Field({labelKey:'Fin',name:'endsAt',type:'datetime-local',value:localDateTime(90),required:true})}
            ${Field({labelKey:'Motivo de consulta',name:'reason',className:'cg-field-wide'})}
          </div><div class="cg-record-actions">${Button({text:'Agendar cita',icon:'fa-calendar-check',type:'submit'})}</div></form>`
        })}

        ${Section({title:'Agenda próxima',subtitle:'Citas y seguimiento para los próximos días.',className:'cg-health-wide',children:appointmentCards(appointments)})}

        ${Section({
          title:'Historia clínica',
          subtitle:selectedPatient ? `Expediente: ${selectedPatient.displayName}` : 'Selecciona un paciente desde la tabla para registrar o consultar notas.',
          className:'cg-health-wide',
          children:`${selectedPatient ? `<form id="careEncounterForm" class="cg-record-form">
            <input type="hidden" name="patientId" value="${safe(selectedPatient.id)}">
            <div class="cg-record-fields">
              ${Select({labelKey:'Profesional',name:'professionalId',options:[{value:'',label:'Profesional'},...optionList(professionals,(item)=>item.fullName)]})}
              ${Select({labelKey:'Especialidad',name:'specialty',options:specialtyOptions.map((value)=>({value,label:value}))})}
              ${Textarea({labelKey:'Motivo / subjetivo',name:'subjective',className:'cg-field-wide'})}
              ${Textarea({labelKey:'Hallazgos / objetivo',name:'objective',className:'cg-field-wide'})}
              ${Textarea({labelKey:'Evaluación / diagnóstico',name:'assessment',className:'cg-field-wide'})}
              ${Textarea({labelKey:'Plan / seguimiento',name:'plan',className:'cg-field-wide'})}
              <label class="cg-check-row cg-field-wide"><input type="checkbox" name="confidential"><span>Nota confidencial (psicología u observación restringida)</span></label>
            </div>
            <div class="cg-record-actions">${Button({text:'Guardar nota clínica',icon:'fa-file-medical',type:'submit'})}</div>
          </form>` : ''}${encounterCards(data.encounters || [])}`
        })}

        ${selectedPatient ? Section({
          title:'Mediciones',
          subtitle:`Controles de ${selectedPatient.displayName}.`,
          children:`<form id="careMeasurementForm" class="cg-record-form"><input type="hidden" name="patientId" value="${safe(selectedPatient.id)}"><div class="cg-record-fields">
            ${Select({labelKey:'Tipo de medición',name:'kind',options:[
              {value:'weight',label:'Peso'},{value:'height',label:'Altura'},{value:'blood_pressure_systolic',label:'Presión sistólica'},
              {value:'blood_pressure_diastolic',label:'Presión diastólica'},{value:'temperature',label:'Temperatura'},{value:'heart_rate',label:'Frecuencia cardíaca'}
            ]})}
            ${Field({labelKey:'Valor',name:'value',type:'number',required:true,attrs:'step="0.01"'})}
            ${Field({labelKey:'Unidad',name:'unit',placeholder:'kg, cm, mmHg…',required:true})}
          </div><div class="cg-record-actions">${Button({text:'Guardar medición',icon:'fa-chart-line',type:'submit',variant:'secondary'})}</div></form>`
        }) : ''}
      </div>
    </section>`;
  },

  mount(state, { Store, Toast }) {
    const load = async ({silent=false}={}) => {
      try {
        const [summary,patients,professionals,appointments] = await Promise.all([
          HealthVerticalService.summary(),
          HealthVerticalService.patients({kind:'human'}),
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
      event.preventDefault();
      const form=event.currentTarget;
      if(!form.reportValidity()) return;
      const data=Object.fromEntries(new FormData(form));
      const submit=form.querySelector('[type="submit"]');
      submit?.setAttribute('disabled','disabled');
      try { await service(transform(data,form)); Toast.show(success,'success'); form.reset(); await load({silent:true}); }
      catch(error){Toast.show(error.message,'error');}
      finally{submit?.removeAttribute('disabled');}
    });

    handle('carePatientForm',HealthVerticalService.createPatient,(data)=>({...data,kind:'human',active:true}),'Paciente registrado.');
    handle('careProfessionalForm',HealthVerticalService.createProfessional,(data)=>({...data,status:'active',schedule:{}}),'Profesional registrado.');
    handle('careAppointmentForm',HealthVerticalService.createAppointment,(data)=>({...data,status:'scheduled',channel:'onsite'}),'Cita agendada.');
    handle('careEncounterForm',HealthVerticalService.createEncounter,(data,form)=>({...data,confidential:Boolean(form.confidential?.checked),status:'signed',diagnosisCodes:[],clinicalData:{}}),'Historia clínica actualizada.');
    handle('careMeasurementForm',HealthVerticalService.createMeasurement,(data)=>({...data,metadata:{}}),'Medición registrada.');
  }
};
