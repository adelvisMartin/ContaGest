import { Badge, Button, EmptyState, Field, PageHeader, Select, MetricGrid, Section, Table } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, today } from '../utils/dom.js';
import { HealthVerticalService } from '../services/verticalService.js';
import { AppointmentReminderService } from '../services/appointmentReminderService.js';
import { dateTime, shortDate } from '../core/formatters.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statusLabel = (status = '') => ({ scheduled:'Por confirmar', pending:'Por confirmar', confirmed:'Confirmada', checked_in:'En sala', in_progress:'En sesión', completed:'Completada', cancelled:'Cancelada', no_show:'No asistió' }[String(status).toLowerCase()] || status || 'Por confirmar');
const statusTone = (status = '') => { const value=String(status).toLowerCase(); if(['confirmed','completed','checked_in'].includes(value))return'success'; if(['cancelled','no_show'].includes(value))return'danger'; return'warning'; };
const cleanName = (value='') => { const text=String(value||'').trim(); return text && !UUID_RE.test(text) ? text : ''; };
const patientName = (patient = {}) => {
  const composed=[patient.firstName,patient.lastName].map(cleanName).filter(Boolean).join(' ').trim();
  return cleanName(patient.displayName) || cleanName(patient.fullName) || cleanName(patient.name) || composed || cleanName(patient.email) || cleanName(patient.phone) || 'Paciente sin nombre';
};
const patientOptionLabel = (patient={}) => { const name=patientName(patient); const contact=cleanName(patient.phone)||cleanName(patient.email); return contact&&contact!==name?`${name} · ${contact}`:name; };
const appointmentStart = (appointment = {}) => AppointmentReminderService.appointmentStart(appointment);
const appointmentDuration = (appointment = {}) => AppointmentReminderService.appointmentDurationMinutes(appointment);
const appointmentTime = (appointment = {}) => { const start=appointmentStart(appointment); return start ? new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(start) : '—'; };
const appointmentMode = (appointment = {}) => appointment.channel==='telemedicine'?'Videollamada':(appointment.modality||'Presencial');
const sortedAppointments = (items = []) => [...items].sort((a,b)=>(appointmentStart(a)?.getTime?.()??Number.MAX_SAFE_INTEGER)-(appointmentStart(b)?.getTime?.()??Number.MAX_SAFE_INTEGER));

function appointmentIso(date,time,durationMinutes=50){
  const start=new Date(`${String(date||'')}T${String(time||'09:00')}:00`);
  if(Number.isNaN(start.getTime()))throw new Error('Fecha u hora de cita inválida.');
  const duration=Math.max(15,Math.min(240,Number(durationMinutes||50)));
  return{startsAt:start.toISOString(),endsAt:new Date(start.getTime()+duration*60000).toISOString()};
}
function startOfWeek(base=new Date()) { const date=new Date(base); const day=(date.getDay()+6)%7; date.setHours(0,0,0,0); date.setDate(date.getDate()-day); return date; }
function weekDays(base=new Date()) { const start=startOfWeek(base); return Array.from({length:7},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return date;}); }
function dateKey(value){const date=value instanceof Date?value:new Date(value); if(Number.isNaN(date.getTime()))return''; return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}

function weeklyCalendar(appointments,patientById){
  const days=weekDays();
  const byDay=new Map(days.map((day)=>[dateKey(day),[]]));
  appointments.forEach((item)=>{const start=appointmentStart(item),key=start?dateKey(start):'';if(byDay.has(key))byDay.get(key).push(item);});
  return `<div class="cg-psych-calendar" role="region" aria-label="Agenda semanal" tabindex="0">${days.map((day)=>{
    const key=dateKey(day),items=byDay.get(key)||[],isToday=key===today();
    return `<section class="cg-psych-day ${isToday?'is-today':''}"><header><span>${new Intl.DateTimeFormat('es-VE',{weekday:'short'}).format(day).replace('.','')}</span><strong>${day.getDate()}</strong></header><div>${items.length?items.map((item)=>{const patient=patientById.get(item.patientId)||item.patient||{};return `<article class="cg-psych-event" data-status="${escapeHtml(String(item.status||'scheduled').toLowerCase())}"><time>${escapeHtml(appointmentTime(item))}</time><strong>${escapeHtml(patientName(patient))}</strong><small>${escapeHtml(appointmentMode(item))}</small></article>`;}).join(''):`<span class="cg-psych-day-empty">Sin citas</span>`}</div></section>`;
  }).join('')}</div>`;
}

export const PsychologyPracticePage={
  render(state){
    const psychology=state.psychology||{patients:[],appointments:[]};
    const patients=psychology.patients||[];
    const appointments=sortedAppointments(psychology.appointments||[]).filter((item)=>String(item.type||'').toLowerCase()==='psychology');
    const week=AppointmentReminderService.appointmentsThisWeek(appointments),upcoming=AppointmentReminderService.upcomingAppointments(appointments,state.settings?.appointmentReminderHours||24),todayKey=today();
    const todayAppointments=appointments.filter((item)=>dateKey(appointmentStart(item))===todayKey&&!['cancelled','completed'].includes(String(item.status||'').toLowerCase()));
    const pending=appointments.filter((item)=>['scheduled','pending',''].includes(String(item.status||'').toLowerCase())).length,noShows=appointments.filter((item)=>String(item.status||'').toLowerCase()==='no_show').length;
    const active=appointments.filter((item)=>String(item.status||'').toLowerCase()!=='cancelled'),confirmedFlow=active.filter((item)=>['confirmed','checked_in','in_progress','completed'].includes(String(item.status||'').toLowerCase())).length,confirmationRate=active.length?Math.round((confirmedFlow/active.length)*100):0;
    const patientById=new Map(patients.map((patient)=>[patient.id,patient]));
    const patientOptions=[{value:'',label:'Selecciona un paciente'},...patients.map((patient)=>({value:patient.id,label:patientOptionLabel(patient)}))];
    const rows=appointments.map((appointment)=>{const patient=patientById.get(appointment.patientId)||appointment.patient||{},calendar=AppointmentReminderService.calendarTemplateUrl(appointment,patient,state.settings),email=AppointmentReminderService.emailConfirmationUrl(appointment,patient,state.settings),whatsapp=AppointmentReminderService.whatsappConfirmationUrl(appointment,patient,state.settings),start=appointmentStart(appointment);return `<tr><td>${start?shortDate(start):'—'}</td><td>${escapeHtml(appointmentTime(appointment))}</td><td><strong>${escapeHtml(patientName(patient))}</strong>${patient.phone?`<br><small>${escapeHtml(patient.phone)}</small>`:''}</td><td>${escapeHtml(appointmentMode(appointment))}</td><td>${appointmentDuration(appointment)} min</td><td>${Badge(statusLabel(appointment.status),statusTone(appointment.status))}</td><td><div class="cg-row-actions cg-psych-actions">${calendar?`<a class="cg-ui-button cg-ui-button-secondary cg-ui-button-icon" href="${escapeHtml(calendar)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir en Google Calendar" title="Abrir en Google Calendar"><i class="fa-brands fa-google"></i></a>`:''}${email?`<a class="cg-ui-button cg-ui-button-secondary cg-ui-button-icon" href="${escapeHtml(email)}" aria-label="Enviar confirmación por correo" title="Enviar confirmación por correo"><i class="fa-solid fa-envelope"></i></a>`:''}${whatsapp?`<a class="cg-ui-button cg-ui-button-secondary cg-ui-button-icon" href="${escapeHtml(whatsapp)}" target="_blank" rel="noopener noreferrer" aria-label="Enviar confirmación por WhatsApp" title="Enviar confirmación por WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>`:''}</div></td></tr>`;});
    const reminderCards=upcoming.map((appointment)=>{const patient=patientById.get(appointment.patientId)||appointment.patient||{};return `<article class="cg-psych-reminder"><span class="cg-psych-reminder-icon"><i class="fa-solid fa-bell"></i></span><div><strong>${escapeHtml(patientName(patient))}</strong><p>${escapeHtml(dateTime(appointmentStart(appointment)))} · ${escapeHtml(appointmentMode(appointment))}</p></div>${Badge(statusLabel(appointment.status),statusTone(appointment.status))}</article>`;}).join('');

    return `<section class="cg-page-stack cg-psychology-workspace">
      ${PageHeader({eyebrow:'Salud · Psicología',title:'Agenda y seguimiento',description:'Planifica sesiones, confirma citas y revisa la semana sin perder contexto del paciente.',actions:Button({id:'btnPsychRefresh',text:'Actualizar agenda',icon:'fa-rotate',variant:'secondary'})})}
      ${MetricGrid([{label:'Pacientes',value:String(patients.length),iconName:'fa-user-group',tone:'neutral'},{label:'Esta semana',value:String(week.length),iconName:'fa-calendar-week',tone:'brand'},{label:'Hoy',value:String(todayAppointments.length),iconName:'fa-calendar-day',tone:todayAppointments.length?'brand':'success'},{label:'Por confirmar',value:String(pending),iconName:'fa-circle-question',tone:pending?'warning':'success'}])}
      ${Section({title:'Semana actual',subtitle:'Vista operativa compacta. En móvil la agenda conserva su propio desplazamiento horizontal.',children:weeklyCalendar(appointments,patientById)})}
      <section class="cg-psych-editor-grid">
        ${Section({title:'Agendar cita',subtitle:'La acción queda visible sin exigir recorrer una tarjeta vertical sobredimensionada.',children:`<form id="psychAppointmentForm" class="cg-record-form cg-psych-appointment-form"><div class="cg-record-fields"><div class="cg-field-wide">${Select({labelKey:'Paciente',name:'patientId',options:patientOptions,attrs:'required'})}</div>${Field({labelKey:'Fecha',name:'date',type:'date',value:today(),required:true})}${Field({labelKey:'Hora',name:'time',type:'time',value:'09:00',required:true})}${Field({labelKey:'Duración (min)',name:'durationMinutes',type:'number',value:'50',attrs:'min="15" max="240" step="5"'})}${Select({labelKey:'Modalidad',name:'modality',options:[{value:'Presencial',label:'Presencial'},{value:'Videollamada',label:'Videollamada'}]})}<div class="cg-field-wide">${Field({labelKey:'Motivo de agenda',name:'reason',placeholder:'Referencia breve para la agenda'})}</div></div><div class="cg-record-actions">${Button({text:'Registrar cita',icon:'fa-calendar-plus',type:'submit'})}</div></form>`})}
        ${Section({title:'Nuevo paciente',subtitle:'Datos mínimos para agenda y contacto; no almacena notas clínicas en esta ficha.',children:`<form id="psychPatientForm" class="cg-record-form"><div class="cg-record-fields"><div class="cg-field-wide">${Field({labelKey:'Nombre completo',name:'displayName',required:true})}</div>${Field({labelKey:'Correo',name:'email',type:'email'})}${Field({labelKey:'Teléfono',name:'phone',attrs:'inputmode="tel"'})}</div><div class="cg-record-actions">${Button({text:'Guardar paciente',icon:'fa-user-plus',type:'submit',variant:'secondary'})}</div></form>`})}
      </section>
      <section class="cg-psych-lower-grid">
        ${Section({title:'Próximos recordatorios',subtitle:`Ventana de ${Number(state.settings?.appointmentReminderHours||24)} horas.`,children:reminderCards||EmptyState({title:'Sin recordatorios próximos',description:'Las citas cercanas aparecerán aquí.',iconName:'fa-bell-slash',assetKey:'psychology'})})}
        ${Section({title:'Seguimiento',subtitle:'Indicadores operativos de confirmación y asistencia.',children:`<div class="cg-psych-flow-grid"><article class="cg-psych-flow-card"><span>Confirmación</span><strong>${confirmationRate}%</strong><small>${confirmedFlow} de ${active.length} citas activas</small></article><article class="cg-psych-flow-card"><span>Próximas ${Number(state.settings?.appointmentReminderHours||24)} h</span><strong>${upcoming.length}</strong><small>requieren seguimiento</small></article><article class="cg-psych-flow-card"><span>Hoy</span><strong>${todayAppointments.length}</strong><small>sesiones en agenda</small></article><article class="cg-psych-flow-card"><span>No asistió</span><strong>${noShows}</strong><small>histórico</small></article></div>`})}
      </section>
      ${Section({title:'Agenda registrada',subtitle:`${appointments.length} citas · ${week.length} durante la semana actual.`,children:Table({headers:[{label:'Fecha'},{label:'Hora'},{label:'Paciente'},{label:'Modalidad'},{label:'Duración'},{label:'Estado'},{label:'Confirmación'}],rows,emptyKey:'noData'})})}
      <aside class="cg-psych-integration-note"><i class="fa-solid fa-shield-halved"></i><div><strong>Confirmaciones controladas</strong><p>Calendar, correo y WhatsApp se abren como acciones confirmadas por el profesional. Las credenciales de integración permanecen fuera del navegador.</p></div></aside>
    </section>`;
  },

  mount(state,{Store,Toast,Loading}){
    const load=async({silent=false}={})=>{try{if(!silent)Loading?.mount?.('Actualizando agenda…');const[patients,appointments]=await Promise.all([HealthVerticalService.patients({kind:'human'}),HealthVerticalService.appointments({})]);Store.set({psychology:{patients:patients||[],appointments:(appointments||[]).filter((item)=>String(item.type||'').toLowerCase()==='psychology'),reminders:[],loadedAt:new Date().toISOString()}});}catch(error){if(!silent)Toast.show(`No se pudo actualizar la agenda: ${error.message}`,'warning');}finally{if(!silent)Loading?.unmount?.();}};
    if(!state.psychology?.loadedAt)load({silent:true});
    document.getElementById('btnPsychRefresh')?.addEventListener('click',()=>load());
    mountSubmit('#psychPatientForm',async(data,form)=>{const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');try{const patient=await HealthVerticalService.createPatient({kind:'human',displayName:data.displayName,email:data.email||'',phone:data.phone||''});Store.update((draft)=>{draft.psychology=draft.psychology||{patients:[],appointments:[],reminders:[]};draft.psychology.patients=[patient,...(draft.psychology.patients||[]).filter((item)=>item.id!==patient.id)];});form.reset();Toast.show('Paciente guardado. Ya está disponible para agendar.','success');}catch(error){Toast.show(`No se guardó el paciente: ${error.message}`,'error');}finally{submit?.removeAttribute('disabled');}});
    mountSubmit('#psychAppointmentForm',async(data,form)=>{
      if(!data.patientId)return Toast.show('Selecciona un paciente.','warning');
      const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');
      try{
        const{startsAt,endsAt}=appointmentIso(data.date,data.time,data.durationMinutes);
        const duplicate=(Store.get().psychology?.appointments||[]).find((item)=>item.patientId===data.patientId&&appointmentStart(item)?.toISOString()===startsAt&&!['cancelled','no_show'].includes(String(item.status||'').toLowerCase()));
        if(duplicate)throw new Error('Ya existe una cita activa para ese paciente en la misma fecha y hora.');
        const appointment=await HealthVerticalService.createAppointment({patientId:data.patientId,startsAt,endsAt,type:'psychology',status:'scheduled',reason:data.reason||'',channel:data.modality==='Videollamada'?'telemedicine':'onsite',notes:''});
        Store.update((draft)=>{draft.psychology=draft.psychology||{patients:[],appointments:[],reminders:[]};draft.psychology.appointments=[appointment,...(draft.psychology.appointments||[]).filter((item)=>item.id!==appointment.id)];});
        form.reset();
        form.querySelector('[name="date"]')?.setAttribute('value',today());
        if(form.elements.date)form.elements.date.value=today();
        if(form.elements.time)form.elements.time.value='09:00';
        if(form.elements.durationMinutes)form.elements.durationMinutes.value='50';
        if(form.elements.modality)form.elements.modality.value='Presencial';
        Toast.show('Cita registrada. La agenda semanal fue actualizada.','success');
      }catch(error){Toast.show(`No se registró la cita: ${error.message}`,'error');}
      finally{submit?.removeAttribute('disabled');}
    });
  }
};
