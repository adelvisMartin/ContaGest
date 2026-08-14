import { Badge, Button, EmptyState, Field, PageHeader, Select, StatCard, Table } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, today } from '../utils/dom.js';
import { HealthVerticalService } from '../services/verticalService.js';
import { AppointmentReminderService } from '../services/appointmentReminderService.js';
import { dateTime, shortDate } from '../core/formatters.js';

const statusLabel = (status = '') => ({
  scheduled:'Por confirmar',
  pending:'Por confirmar',
  confirmed:'Confirmada',
  checked_in:'En sala',
  in_progress:'En sesión',
  completed:'Completada',
  cancelled:'Cancelada',
  no_show:'No asistió'
}[String(status).toLowerCase()] || status || 'Por confirmar');

const statusTone = (status = '') => {
  const value=String(status).toLowerCase();
  if(value==='confirmed'||value==='completed'||value==='checked_in')return 'success';
  if(value==='cancelled'||value==='no_show')return 'danger';
  return 'warning';
};

const patientName = (patient = {}) => patient.displayName || patient.name || patient.fullName || 'Paciente';
const appointmentStart = (appointment = {}) => AppointmentReminderService.appointmentStart(appointment);
const appointmentDuration = (appointment = {}) => AppointmentReminderService.appointmentDurationMinutes(appointment);
const appointmentTime = (appointment = {}) => {
  const start=appointmentStart(appointment);
  if(!start)return '—';
  return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(start);
};
const appointmentMode = (appointment = {}) => appointment.channel==='telemedicine'?'Videollamada':(appointment.modality||'Presencial');

function sortedAppointments(items = []) {
  return [...items].sort((a,b)=>{
    const left=appointmentStart(a),right=appointmentStart(b);
    return (left?.getTime?.() ?? Number.MAX_SAFE_INTEGER) - (right?.getTime?.() ?? Number.MAX_SAFE_INTEGER);
  });
}

function appointmentIso(date, time, durationMinutes = 50) {
  const start = new Date(`${String(date || '')}T${String(time || '09:00')}:00`);
  if (Number.isNaN(start.getTime())) throw new Error('Fecha u hora de cita inválida.');
  const duration = Math.max(15, Math.min(240, Number(durationMinutes || 50)));
  const end = new Date(start.getTime() + duration * 60000);
  return { startsAt:start.toISOString(), endsAt:end.toISOString() };
}

export const PsychologyPracticePage = {
  render(state) {
    const psychology=state.psychology||{patients:[],appointments:[]};
    const patients=psychology.patients||[];
    const appointments=sortedAppointments(psychology.appointments||[]).filter((item)=>String(item.type||'').toLowerCase()==='psychology');
    const week=AppointmentReminderService.appointmentsThisWeek(appointments);
    const upcoming=AppointmentReminderService.upcomingAppointments(appointments,state.settings?.appointmentReminderHours||24);
    const todayKey=today();
    const todayAppointments=appointments.filter((item)=>appointmentStart(item)?.toISOString().slice(0,10)===todayKey&&!['cancelled','completed'].includes(String(item.status||'').toLowerCase()));
    const pending=appointments.filter((item)=>['scheduled','pending',''].includes(String(item.status||'').toLowerCase())).length;
    const noShows=appointments.filter((item)=>String(item.status||'').toLowerCase()==='no_show').length;
    const active=appointments.filter((item)=>String(item.status||'').toLowerCase()!=='cancelled');
    const confirmedFlow=active.filter((item)=>['confirmed','checked_in','in_progress','completed'].includes(String(item.status||'').toLowerCase())).length;
    const confirmationRate=active.length?Math.round((confirmedFlow/active.length)*100):0;
    const patientById=new Map(patients.map((patient)=>[patient.id,patient]));
    const patientOptions=[{value:'',label:'Selecciona un paciente'},...patients.map((patient)=>({value:patient.id,label:patientName(patient)}))];

    const rows=appointments.map((appointment)=>{
      const patient=patientById.get(appointment.patientId)||appointment.patient||{};
      const calendar=AppointmentReminderService.calendarTemplateUrl(appointment,patient,state.settings);
      const email=AppointmentReminderService.emailConfirmationUrl(appointment,patient,state.settings);
      const whatsapp=AppointmentReminderService.whatsappConfirmationUrl(appointment,patient,state.settings);
      const start=appointmentStart(appointment);
      return `<tr>
        <td>${start?shortDate(start):'—'}</td>
        <td>${escapeHtml(appointmentTime(appointment))}</td>
        <td><strong>${escapeHtml(patientName(patient))}</strong>${patient.phone?`<br><small>${escapeHtml(patient.phone)}</small>`:''}</td>
        <td>${escapeHtml(appointmentMode(appointment))}</td>
        <td>${appointmentDuration(appointment)} min</td>
        <td>${Badge(statusLabel(appointment.status),statusTone(appointment.status))}</td>
        <td><div class="cg-row-actions cg-psych-actions">
          ${calendar?`<a class="cg-ui-button cg-ui-button-secondary cg-ui-button-icon" href="${escapeHtml(calendar)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir en Google Calendar" title="Abrir en Google Calendar"><i class="fa-brands fa-google"></i></a>`:''}
          ${email?`<a class="cg-ui-button cg-ui-button-secondary cg-ui-button-icon" href="${escapeHtml(email)}" aria-label="Enviar confirmación por correo" title="Enviar confirmación por correo"><i class="fa-solid fa-envelope"></i></a>`:''}
          ${whatsapp?`<a class="cg-ui-button cg-ui-button-secondary cg-ui-button-icon" href="${escapeHtml(whatsapp)}" target="_blank" rel="noopener noreferrer" aria-label="Enviar confirmación por WhatsApp" title="Enviar confirmación por WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>`:''}
        </div></td>
      </tr>`;
    });

    const reminderCards=upcoming.map((appointment)=>{
      const patient=patientById.get(appointment.patientId)||appointment.patient||{};
      return `<article class="cg-psych-reminder"><span class="cg-psych-reminder-icon"><i class="fa-solid fa-bell"></i></span><div><strong>${escapeHtml(patientName(patient))}</strong><p>${escapeHtml(dateTime(appointmentStart(appointment)))} · ${escapeHtml(appointmentMode(appointment))}</p></div>${Badge(statusLabel(appointment.status),statusTone(appointment.status))}</article>`;
    }).join('');

    return `<section class="cg-page-stack cg-psychology-workspace">
      ${PageHeader({
        eyebrowKey:'psychologyEyebrow',
        titleKey:'psychologyTitle',
        descKey:'psychologyDesc',
        actions:Button({id:'btnPsychRefresh',text:'Actualizar agenda',icon:'fa-rotate',variant:'secondary'})
      })}
      <div class="grid gap-3 md:grid-cols-4 cg-psych-kpis">
        ${StatCard({label:'Pacientes',value:String(patients.length),icon:'fa-user-group'})}
        ${StatCard({label:'Esta semana',value:String(week.length),icon:'fa-calendar-week',tone:'brand'})}
        ${StatCard({label:'Hoy',value:String(todayAppointments.length),icon:'fa-calendar-day',tone:todayAppointments.length?'accent':'success'})}
        ${StatCard({label:'Por confirmar',value:String(pending),icon:'fa-circle-question',tone:pending?'warning':'success'})}
      </div>

      <section class="cg-psych-planner-grid">
        <form id="psychPatientForm" class="cg-ui-card cg-ui-section">
          <header class="cg-ui-section-head"><div><h2 class="cg-ui-section-title">Nuevo paciente</h2><p class="cg-ui-muted">Solo datos de agenda y contacto. Las notas clínicas requieren un flujo privado independiente.</p></div></header>
          <div class="cg-ui-section-body grid gap-3">
            ${Field({labelKey:'Nombre completo',name:'displayName',required:true})}
            ${Field({labelKey:'Correo',name:'email',type:'email'})}
            ${Field({labelKey:'Teléfono',name:'phone',attrs:'inputmode="tel"'})}
            ${Button({text:'Guardar paciente',icon:'fa-user-plus',type:'submit'})}
          </div>
        </form>

        <form id="psychAppointmentForm" class="cg-ui-card cg-ui-section">
          <header class="cg-ui-section-head"><div><h2 class="cg-ui-section-title">Agendar cita</h2><p class="cg-ui-muted">Planificación con accesos de confirmación por Calendar, correo y WhatsApp.</p></div></header>
          <div class="cg-ui-section-body grid gap-3">
            ${Select({labelKey:'Paciente',name:'patientId',options:patientOptions})}
            <div class="cg-form-grid-2">${Field({labelKey:'Fecha',name:'date',type:'date',value:today(),required:true})}${Field({labelKey:'Hora',name:'time',type:'time',value:'09:00',required:true})}</div>
            <div class="cg-form-grid-2">${Field({labelKey:'Duración (min)',name:'durationMinutes',type:'number',value:'50',attrs:'min="15" max="240" step="5"'})}${Select({labelKey:'Modalidad',name:'modality',options:[{value:'Presencial',label:'Presencial'},{value:'Videollamada',label:'Videollamada'}]})}</div>
            ${Field({labelKey:'Motivo de agenda',name:'reason',placeholder:'Referencia breve para la agenda'})}
            ${Button({text:'Registrar cita',icon:'fa-calendar-plus',type:'submit'})}
          </div>
        </form>

        <aside class="cg-ui-card cg-ui-section cg-psych-reminders">
          <header class="cg-ui-section-head"><div><h2 class="cg-ui-section-title">Próximos recordatorios</h2><p class="cg-ui-muted">Ventana de ${Number(state.settings?.appointmentReminderHours||24)} horas.</p></div></header>
          <div class="cg-ui-section-body">${reminderCards||EmptyState({title:'Sin recordatorios próximos',description:'Las citas cercanas aparecerán aquí.',iconName:'fa-bell-slash'})}</div>
        </aside>
      </section>

      <section class="cg-ui-card cg-ui-section">
        <header class="cg-ui-section-head"><div><h2 class="cg-ui-section-title">Seguimiento del consultorio</h2><p class="cg-ui-muted">Señales operativas para reducir olvidos y priorizar confirmaciones sin almacenar contenido clínico sensible.</p></div></header>
        <div class="cg-ui-section-body cg-psych-flow-grid">
          <article class="cg-psych-flow-card"><span>Confirmación</span><strong>${confirmationRate}%</strong><small>${confirmedFlow} de ${active.length} citas activas</small></article>
          <article class="cg-psych-flow-card"><span>Próximas ${Number(state.settings?.appointmentReminderHours||24)} h</span><strong>${upcoming.length}</strong><small>requieren seguimiento próximo</small></article>
          <article class="cg-psych-flow-card"><span>Hoy</span><strong>${todayAppointments.length}</strong><small>sesiones en agenda</small></article>
          <article class="cg-psych-flow-card"><span>No asistió</span><strong>${noShows}</strong><small>histórico de ausencias</small></article>
        </div>
      </section>

      <section class="cg-ui-card cg-ui-section">
        <header class="cg-ui-section-head"><div><h2 class="cg-ui-section-title">Agenda</h2><p class="cg-ui-muted">${appointments.length} citas registradas · ${week.length} activas esta semana.</p></div></header>
        <div class="cg-ui-section-body">${Table({headers:[{label:'Fecha'},{label:'Hora'},{label:'Paciente'},{label:'Modalidad'},{label:'Duración'},{label:'Estado'},{label:'Confirmación'}],rows,emptyKey:'noData'})}</div>
      </section>

      <aside class="cg-psych-integration-note">
        <i class="fa-solid fa-shield-halved"></i>
        <div><strong>Integraciones seguras</strong><p>Los botones de esta fase abren acciones confirmadas por el profesional. La automatización de Google Calendar y Gmail se conectará desde backend con autorización; las credenciales nunca se guardan en el navegador.</p></div>
      </aside>
    </section>`;
  },

  mount(state,{Store,Toast,Loading}) {
    const load=async({silent=false}={})=>{
      try{
        if(!silent)Loading?.mount?.('Actualizando agenda…');
        const [patients,appointments]=await Promise.all([
          HealthVerticalService.patients({kind:'human'}),
          HealthVerticalService.appointments({})
        ]);
        Store.set({psychology:{patients:patients||[],appointments:(appointments||[]).filter((item)=>String(item.type||'').toLowerCase()==='psychology'),reminders:[],loadedAt:new Date().toISOString()}});
      }catch(error){
        if(!silent)Toast.show(`No se pudo actualizar la agenda: ${error.message}`,'warning');
      }finally{if(!silent)Loading?.unmount?.();}
    };

    if(!state.psychology?.loadedAt)load({silent:true});
    document.getElementById('btnPsychRefresh')?.addEventListener('click',()=>load());

    mountSubmit('#psychPatientForm',async(data,form)=>{
      const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');
      try{
        const patient=await HealthVerticalService.createPatient({kind:'human',displayName:data.displayName,email:data.email||'',phone:data.phone||''});
        Store.update((draft)=>{draft.psychology=draft.psychology||{patients:[],appointments:[],reminders:[]};draft.psychology.patients=[patient,...(draft.psychology.patients||[]).filter((item)=>item.id!==patient.id)];});
        form.reset();Toast.show('Paciente guardado de forma segura.','success');
      }catch(error){Toast.show(`No se guardó el paciente: ${error.message}`,'error');}
      finally{submit?.removeAttribute('disabled');}
    });

    mountSubmit('#psychAppointmentForm',async(data,form)=>{
      if(!data.patientId)return Toast.show('Selecciona un paciente.','warning');
      const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');
      try{
        const { startsAt,endsAt }=appointmentIso(data.date,data.time,data.durationMinutes);
        const appointment=await HealthVerticalService.createAppointment({
          patientId:data.patientId,
          startsAt,
          endsAt,
          type:'psychology',
          status:'scheduled',
          reason:data.reason||'',
          channel:data.modality==='Videollamada'?'telemedicine':'onsite',
          notes:''
        });
        Store.update((draft)=>{draft.psychology=draft.psychology||{patients:[],appointments:[],reminders:[]};draft.psychology.appointments=[appointment,...(draft.psychology.appointments||[]).filter((item)=>item.id!==appointment.id)];});
        form.reset();Toast.show('Cita registrada. Ya puedes enviar la confirmación.','success');
      }catch(error){Toast.show(`No se registró la cita: ${error.message}`,'error');}
      finally{submit?.removeAttribute('disabled');}
    });
  }
};
