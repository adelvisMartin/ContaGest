import { PageHeader, Button, Badge } from '../components/ui/index.js';
import { GymVerticalService } from '../services/verticalService.js';
import { escapeHtml } from '../utils/dom.js';

const safe = (value) => escapeHtml(value ?? '');
const rows = (value) => Array.isArray(value) ? value : value?.data || [];
const object = (value) => value?.data || value || {};
const dateValue = (days = 0) => {
  const date = new Date(Date.now() + days * 86400000 - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 10);
};
const dateTimeValue = (minutes = 0) => {
  const date = new Date(Date.now() + minutes * 60000 - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
};
const option = (item, label) => `<option value="${safe(item.id)}">${safe(label)}</option>`;
const amount = (value, currency = 'USD') => `${safe(currency)} ${Number(value || 0).toLocaleString('es-VE', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;

function summaryCards(summary = {}) {
  return `<section class="cg-vertical-kpis cg-gym-kpis">
    <article><span>Clientes activos</span><strong>${Number(summary.members?.active || 0)}</strong><small>${Number(summary.members?.total || 0)} registrados</small><i class="fa-solid fa-users"></i></article>
    <article><span>Membresías activas</span><strong>${Number(summary.memberships?.active || 0)}</strong><small>${Number(summary.memberships?.expiring || 0)} vencen en 7 días</small><i class="fa-solid fa-id-card"></i></article>
    <article><span>Entradas de hoy</span><strong>${Number(summary.checkinsToday || 0)}</strong><small>Control de acceso</small><i class="fa-solid fa-right-to-bracket"></i></article>
    <article><span>Ingresos del mes</span><strong>$ ${Number(summary.revenueThisMonth || 0).toLocaleString('es-VE',{minimumFractionDigits:2})}</strong><small>Pagos confirmados</small><i class="fa-solid fa-chart-line"></i></article>
  </section>`;
}

function prerequisites(members, trainers, plans) {
  const missing = [];
  if (!members.length) missing.push('al menos un cliente');
  if (!trainers.length) missing.push('al menos un instructor');
  return `<section class="cg-gym-v1124-status" aria-label="Preparación del gimnasio">
    <article><small>Clientes</small><strong>${members.length}</strong></article>
    <article><small>Instructores</small><strong>${trainers.length}</strong></article>
    <article><small>Planes</small><strong>${plans.length}</strong></article>
  </section>${missing.length ? `<section class="cg-gym-v1124-prereq"><strong>Completa la configuración básica</strong><p>Para programar clases y asignar seguimiento necesitas ${safe(missing.join(' y '))}. Ya no tienes que buscar estos registros en otra vista.</p><div class="cg-gym-v1124-actions">${!members.length ? '<button type="button" class="cgx-btn cgx-btn-primary" data-gym-tab="members"><i class="fa-solid fa-user-plus"></i> Registrar cliente</button>' : ''}${!trainers.length ? '<button type="button" class="cgx-btn cgx-btn-secondary" data-gym-tab="trainers"><i class="fa-solid fa-user-tie"></i> Registrar instructor</button>' : ''}</div></section>` : ''}`;
}

function tabs(active) {
  const items = [
    ['overview','Operación','fa-gauge-high'],['members','Clientes','fa-users'],['trainers','Instructores','fa-user-tie'],
    ['assessments','Evaluaciones','fa-person-running'],['routines','Rutinas','fa-dumbbell'],['nutrition','Nutrición','fa-apple-whole'],['classes','Clases','fa-calendar-days']
  ];
  return `<nav class="cg-vertical-tabs cg-gym-v1124-tabs" aria-label="Secciones del gimnasio">${items.map(([key,label,icon])=>`<button type="button" data-gym-tab="${key}" class="${active===key?'active':''}" aria-current="${active===key?'page':'false'}"><i class="fa-solid ${icon}"></i> ${label}</button>`).join('')}</nav>`;
}

function memberList(members = []) {
  if (!members.length) return '<div class="cg-gym-v1124-empty">Todavía no hay clientes. Usa el formulario de esta misma sección para registrar el primero.</div>';
  return `<div class="cg-gym-v1124-list">${members.map((member)=>`<article><div><strong>${safe(member.fullName)}</strong><small>${safe(member.memberCode || 'Sin código')} · ${safe(member.phone || member.email || 'Sin contacto')}</small></div><button type="button" class="cgx-btn cgx-btn-secondary" data-gym-member="${safe(member.id)}">Abrir</button></article>`).join('')}</div>`;
}

function trainerList(trainers = []) {
  if (!trainers.length) return '<div class="cg-gym-v1124-empty">Todavía no hay instructores. Registra el primero arriba para poder programar clases.</div>';
  return `<div class="cg-gym-v1124-list">${trainers.map((trainer)=>`<article><div><strong>${safe(trainer.fullName)}</strong><small>${safe((trainer.specialties || []).join(', ') || trainer.phone || 'Instructor')}</small></div>${Badge(trainer.status || 'active','success')}</article>`).join('')}</div>`;
}

function classList(classes = []) {
  if (!classes.length) return '<div class="cg-gym-v1124-empty">No hay clases próximas.</div>';
  return `<div class="cg-gym-v1124-list">${classes.map((item)=>`<article><div><strong>${safe(item.name)}</strong><small>${new Date(item.startsAt).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})} · ${safe(item.trainerName || 'Sin instructor')} · ${safe(item.location || 'Sin sala')}</small></div><span>${Number(item.bookings || 0)} / ${Number(item.capacity || 0)}</span></article>`).join('')}</div>`;
}

function planList(plans = []) {
  if (!plans.length) return '<div class="cg-gym-v1124-empty">No hay planes comerciales configurados.</div>';
  return `<div class="cg-gym-v1124-list">${plans.map((plan)=>`<article><div><strong>${safe(plan.name)}</strong><small>${Number(plan.durationDays || 0)} días</small></div><span>${amount(plan.price, plan.currency)}</span></article>`).join('')}</div>`;
}

function assessmentList(items = []) {
  if (!items.length) return '<div class="cg-gym-v1124-empty">No hay evaluaciones del cliente seleccionado.</div>';
  return `<div class="cg-gym-v1124-list">${items.map((item)=>`<article><div><strong>${new Date(item.measuredAt || item.createdAt).toLocaleDateString('es-VE')}</strong><small>Peso ${safe(item.weightKg ?? '—')} kg · Grasa ${safe(item.bodyFatPct ?? '—')}% · Músculo ${safe(item.muscleMassKg ?? '—')} kg</small></div><span>IMC ${safe(item.bmi ?? '—')}</span></article>`).join('')}</div>`;
}

function routineList(items = []) {
  if (!items.length) return '<div class="cg-gym-v1124-empty">No hay rutinas del cliente seleccionado.</div>';
  return `<div class="cg-gym-v1124-list">${items.map((item)=>`<article><div><strong>${safe(item.name)}</strong><small>${safe(item.goal || 'Objetivo general')} · ${safe(item.level || '')}</small></div>${Badge(item.active === false ? 'Inactiva' : 'Activa', item.active === false ? 'warning' : 'success')}</article>`).join('')}</div>`;
}

function nutritionList(items = []) {
  if (!items.length) return '<div class="cg-gym-v1124-empty">No hay planes nutricionales del cliente seleccionado.</div>';
  return `<div class="cg-gym-v1124-list">${items.map((item)=>`<article><div><strong>${safe(item.name)}</strong><small>${safe(item.goal || 'Plan nutricional')} · ${safe(item.targetCalories || '—')} kcal</small></div>${Badge(item.active === false ? 'Inactivo' : 'Activo', item.active === false ? 'warning' : 'success')}</article>`).join('')}</div>`;
}

function selectedMemberControl(members, selectedMemberId) {
  return `<label><span>Cliente de seguimiento</span><select name="selectedMemberId" data-gym-selected-member><option value="">Seleccionar cliente</option>${members.map((member)=>`<option value="${safe(member.id)}" ${member.id===selectedMemberId?'selected':''}>${safe(member.fullName)}</option>`).join('')}</select></label>`;
}

function overview(data) {
  const members = data.members || [], trainers = data.trainers || [], plans = data.plans || [];
  return `<div class="cg-gym-v1124-grid">
    <section class="cg-gym-v1124-card"><header><div><h3>Preparación operativa</h3><p>Clientes e instructores están disponibles desde este mismo módulo.</p></div></header>${prerequisites(members,trainers,plans)}</section>
    <section class="cg-gym-v1124-card"><header><div><h3>Registrar entrada</h3><p>Control de acceso de clientes ya creados.</p></div></header><form id="gymCheckInForm" class="cg-gym-v1124-form ${members.length?'':'cg-gym-v1124-disabled'}"><label><span>Cliente</span><select name="memberId" required><option value="">${members.length?'Seleccionar cliente':'Primero registra un cliente'}</option>${members.map((member)=>option(member,`${member.memberCode || ''} · ${member.fullName}`)).join('')}</select></label><label><span>Método</span><select name="method"><option value="manual">Manual</option><option value="qr">Código QR</option><option value="barcode">Código de barras</option><option value="nfc">NFC</option></select></label><button class="cgx-btn cgx-btn-primary" type="submit" ${members.length?'':'disabled'}><i class="fa-solid fa-right-to-bracket"></i> Registrar entrada</button></form></section>
    <section class="cg-gym-v1124-card"><header><div><h3>Nuevo plan comercial</h3><p>Configura una membresía antes de asignarla.</p></div></header><form id="gymPlanForm" class="cg-gym-v1124-form"><label><span>Nombre</span><input name="name" placeholder="Plan mensual" required></label><div class="cg-gym-v1124-fields"><label><span>Duración (días)</span><input type="number" name="durationDays" value="30" min="1" required></label><label><span>Precio</span><input type="number" step="0.01" name="price" value="20" min="0" required></label></div><label><span>Moneda</span><select name="currency"><option>USD</option><option>VES</option></select></label><button class="cgx-btn cgx-btn-secondary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Guardar plan</button></form>${planList(plans)}</section>
    <section class="cg-gym-v1124-card"><header><div><h3>Activar membresía</h3><p>Asigna un plan comercial a un cliente.</p></div></header><form id="gymMembershipForm" class="cg-gym-v1124-form ${members.length&&plans.length?'':'cg-gym-v1124-disabled'}"><label><span>Cliente</span><select name="memberId" required><option value="">${members.length?'Seleccionar cliente':'Primero registra un cliente'}</option>${members.map((member)=>option(member,member.fullName)).join('')}</select></label><label><span>Plan</span><select name="planId" required><option value="">${plans.length?'Seleccionar plan':'Primero crea un plan'}</option>${plans.map((plan)=>option(plan,`${plan.name} · ${amount(plan.price,plan.currency)}`)).join('')}</select></label><label><span>Inicio</span><input type="date" name="startsAt" value="${dateValue()}" required></label><label><span><input type="checkbox" name="autoRenew"> Renovación automática</span></label><button class="cgx-btn cgx-btn-primary" type="submit" ${members.length&&plans.length?'':'disabled'}><i class="fa-solid fa-id-card"></i> Activar membresía</button></form></section>
    <section class="cg-gym-v1124-card" style="grid-column:1/-1"><header><div><h3>Próximas clases</h3><p>Agenda disponible para operación diaria.</p></div><button type="button" class="cgx-btn cgx-btn-secondary" data-gym-tab="classes">Programar clase</button></header>${classList(data.classes || [])}</section>
  </div>`;
}

function membersPanel(members) {
  return `<div class="cg-gym-v1124-grid"><section class="cg-gym-v1124-card"><header><div><h3>Nuevo cliente</h3><p>Este formulario permanece visible en móvil para que puedas comenzar sin depender de otra vista.</p></div></header><form id="gymMemberForm" class="cg-gym-v1124-form"><div class="cg-gym-v1124-fields"><label><span>Código</span><input name="memberCode" value="GYM-${Date.now().toString().slice(-5)}" required></label><label><span>Nombre completo</span><input name="fullName" autocomplete="name" required></label></div><div class="cg-gym-v1124-fields"><label><span>Correo</span><input type="email" name="email" autocomplete="email"></label><label><span>Teléfono</span><input name="phone" inputmode="tel" autocomplete="tel"></label></div><div class="cg-gym-v1124-fields"><label><span>Nacimiento</span><input type="date" name="birthDate"></label><label><span>Sexo</span><select name="sex"><option value="">No indicado</option><option>Femenino</option><option>Masculino</option><option>Otro</option></select></label></div><label><span>Objetivos, separados por coma</span><input name="goals" placeholder="Pérdida de grasa, masa muscular"></label><label><span>Observaciones médicas</span><textarea name="medicalNotes"></textarea></label><button class="cgx-btn cgx-btn-primary" type="submit"><i class="fa-solid fa-user-plus"></i> Guardar cliente</button></form></section><section class="cg-gym-v1124-card"><header><div><h3>Clientes registrados</h3><p>Selecciona uno para abrir su seguimiento.</p></div></header>${memberList(members)}</section></div>`;
}

function trainersPanel(trainers) {
  return `<div class="cg-gym-v1124-grid"><section class="cg-gym-v1124-card"><header><div><h3>Nuevo instructor</h3><p>Registra el responsable antes de programar clases, rutinas o evaluaciones.</p></div></header><form id="gymTrainerForm" class="cg-gym-v1124-form"><label><span>Nombre completo</span><input name="fullName" autocomplete="name" required></label><label><span>Teléfono</span><input name="phone" inputmode="tel" autocomplete="tel"></label><label><span>Especialidades</span><input name="specialties" placeholder="Musculación, funcional, pilates"></label><button class="cgx-btn cgx-btn-primary" type="submit"><i class="fa-solid fa-user-tie"></i> Guardar instructor</button></form></section><section class="cg-gym-v1124-card"><header><div><h3>Equipo de instructores</h3><p>Personal disponible para asignaciones.</p></div></header>${trainerList(trainers)}</section></div>`;
}

function assessmentsPanel(data) {
  const members=data.members||[], trainers=data.trainers||[];
  return `<div class="cg-gym-v1124-grid"><section class="cg-gym-v1124-card"><header><div><h3>Nueva evaluación</h3><p>El cliente es obligatorio; el instructor puede asignarse cuando corresponda.</p></div></header><form id="gymAssessmentForm" class="cg-gym-v1124-form ${members.length?'':'cg-gym-v1124-disabled'}"><label><span>Cliente</span><select name="memberId" required><option value="">${members.length?'Seleccionar cliente':'Primero registra un cliente'}</option>${members.map((member)=>option(member,member.fullName)).join('')}</select></label><label><span>Instructor</span><select name="trainerId"><option value="">Sin asignar</option>${trainers.map((trainer)=>option(trainer,trainer.fullName)).join('')}</select></label><div class="cg-gym-v1124-fields"><label><span>Peso kg</span><input type="number" step="0.01" name="weightKg"></label><label><span>Altura cm</span><input type="number" step="0.01" name="heightCm"></label></div><div class="cg-gym-v1124-fields"><label><span>Grasa %</span><input type="number" step="0.01" name="bodyFatPct"></label><label><span>Músculo kg</span><input type="number" step="0.01" name="muscleMassKg"></label></div><label><span>Observaciones</span><textarea name="notes"></textarea></label><button class="cgx-btn cgx-btn-primary" type="submit" ${members.length?'':'disabled'}>Guardar evaluación</button></form></section><section class="cg-gym-v1124-card"><header><div><h3>Evolución</h3><p>Cambia el cliente para consultar su historial.</p></div></header><form class="cg-gym-v1124-form">${selectedMemberControl(members,data.selectedMemberId)}</form>${assessmentList(data.assessments||[])}</section></div>`;
}

function routinesPanel(data) {
  const members=data.members||[], trainers=data.trainers||[];
  return `<div class="cg-gym-v1124-grid"><section class="cg-gym-v1124-card"><header><div><h3>Nueva rutina</h3><p>Programa ejercicios para un cliente registrado.</p></div></header><form id="gymRoutineForm" class="cg-gym-v1124-form ${members.length?'':'cg-gym-v1124-disabled'}"><label><span>Cliente</span><select name="memberId" required><option value="">${members.length?'Seleccionar cliente':'Primero registra un cliente'}</option>${members.map((member)=>option(member,member.fullName)).join('')}</select></label><label><span>Instructor</span><select name="trainerId"><option value="">Sin asignar</option>${trainers.map((trainer)=>option(trainer,trainer.fullName)).join('')}</select></label><label><span>Nombre</span><input name="name" placeholder="Hipertrofia 4 días" required></label><label><span>Objetivo</span><input name="goal"></label><div class="cg-gym-v1124-fields"><label><span>Nivel</span><select name="level"><option value="beginner">Principiante</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option></select></label><label><span>Días/semana</span><input type="number" name="daysPerWeek" value="3" min="1" max="7"></label></div><label><span>Ejercicios, uno por línea: Día | Ejercicio | Grupo | Series | Reps | Descanso</span><textarea name="exerciseLines" placeholder="Día 1 | Sentadilla | Piernas | 4 | 10 | 60"></textarea></label><button class="cgx-btn cgx-btn-primary" type="submit" ${members.length?'':'disabled'}>Crear rutina</button></form></section><section class="cg-gym-v1124-card"><header><div><h3>Rutinas activas</h3><p>Planes del cliente seleccionado.</p></div></header><form class="cg-gym-v1124-form">${selectedMemberControl(members,data.selectedMemberId)}</form>${routineList(data.routines||[])}</section></div>`;
}

function nutritionPanel(data) {
  const members=data.members||[], trainers=data.trainers||[];
  return `<div class="cg-gym-v1124-grid"><section class="cg-gym-v1124-card"><header><div><h3>Nuevo plan nutricional</h3><p>Asocia el plan a un cliente registrado.</p></div></header><form id="gymNutritionForm" class="cg-gym-v1124-form ${members.length?'':'cg-gym-v1124-disabled'}"><label><span>Cliente</span><select name="memberId" required><option value="">${members.length?'Seleccionar cliente':'Primero registra un cliente'}</option>${members.map((member)=>option(member,member.fullName)).join('')}</select></label><label><span>Responsable</span><select name="trainerId"><option value="">Sin asignar</option>${trainers.map((trainer)=>option(trainer,trainer.fullName)).join('')}</select></label><label><span>Nombre</span><input name="name" placeholder="Déficit controlado" required></label><label><span>Objetivo</span><input name="goal"></label><div class="cg-gym-v1124-fields"><label><span>Calorías</span><input type="number" name="targetCalories"></label><label><span>Agua ml</span><input type="number" name="waterMl"></label></div><label><span>Comidas, una por línea: Tipo | kcal | alimentos</span><textarea name="mealLines" placeholder="Desayuno | 450 | Avena, huevos, fruta"></textarea></label><button class="cgx-btn cgx-btn-primary" type="submit" ${members.length?'':'disabled'}>Crear plan nutricional</button></form></section><section class="cg-gym-v1124-card"><header><div><h3>Planes activos</h3><p>Seguimiento del cliente seleccionado.</p></div></header><form class="cg-gym-v1124-form">${selectedMemberControl(members,data.selectedMemberId)}</form>${nutritionList(data.nutrition||[])}</section></div>`;
}

function classesPanel(data) {
  const trainers=data.trainers||[]; const members=data.members||[]; const ready=members.length>0&&trainers.length>0;
  return `<div class="cg-gym-v1124-grid"><section class="cg-gym-v1124-card"><header><div><h3>Nueva clase</h3><p>Primero deben existir clientes e instructores; el formulario te indica qué falta.</p></div></header>${ready?'':`<div class="cg-gym-v1124-prereq"><strong>No se puede programar todavía</strong><p>${!members.length?'Falta registrar al menos un cliente. ':''}${!trainers.length?'Falta registrar al menos un instructor.':''}</p><div class="cg-gym-v1124-actions">${!members.length?'<button type="button" class="cgx-btn cgx-btn-primary" data-gym-tab="members">Registrar cliente</button>':''}${!trainers.length?'<button type="button" class="cgx-btn cgx-btn-secondary" data-gym-tab="trainers">Registrar instructor</button>':''}</div></div>`}<form id="gymClassForm" class="cg-gym-v1124-form ${ready?'':'cg-gym-v1124-disabled'}"><label><span>Nombre de la clase</span><input name="name" placeholder="Funcional, spinning, pilates" required></label><label><span>Instructor</span><select name="trainerId" required><option value="">${trainers.length?'Seleccionar instructor':'Primero registra un instructor'}</option>${trainers.map((trainer)=>option(trainer,trainer.fullName)).join('')}</select></label><div class="cg-gym-v1124-fields"><label><span>Inicio</span><input type="datetime-local" name="startsAt" value="${dateTimeValue(60)}" required></label><label><span>Fin</span><input type="datetime-local" name="endsAt" value="${dateTimeValue(120)}" required></label></div><div class="cg-gym-v1124-fields"><label><span>Cupo</span><input type="number" name="capacity" value="20" min="1"></label><label><span>Sala / sede</span><input name="location" placeholder="Sala principal"></label></div><button class="cgx-btn cgx-btn-primary" type="submit" ${ready?'':'disabled'}><i class="fa-solid fa-calendar-plus"></i> Programar clase</button></form></section><section class="cg-gym-v1124-card"><header><div><h3>Próximas clases</h3><p>Calendario operativo.</p></div></header>${classList(data.classes||[])}</section></div>`;
}

export const GymManagementPage = {
  render(state) {
    const data = state.gymVertical || {};
    const routeTab = state.route === 'rutinas' ? 'routines' : state.route === 'nutricion' ? 'nutrition' : data.tab || 'overview';
    const panel = routeTab === 'members' ? membersPanel(data.members || [])
      : routeTab === 'trainers' ? trainersPanel(data.trainers || [])
      : routeTab === 'assessments' ? assessmentsPanel(data)
      : routeTab === 'routines' ? routinesPanel(data)
      : routeTab === 'nutrition' ? nutritionPanel(data)
      : routeTab === 'classes' ? classesPanel(data)
      : overview(data);
    return `<section class="cg-page-stack cg-vertical-page cg-gym-page">
      ${PageHeader({eyebrow:'Vertical Fitness',title:'Control integral de gimnasio',description:'Clientes, instructores, membresías, asistencia, evaluaciones, rutinas, nutrición y clases desde una sola vista funcional.',actions:`${Button({id:'btnGymRefresh',text:'Actualizar',icon:'fa-rotate',variant:'secondary'})}${Button({text:'Mensajes WhatsApp',icon:'fa-message',variant:'secondary',attrs:'data-route="mensajes"'})}`})}
      ${summaryCards(data.summary)}
      ${tabs(routeTab)}
      <div data-gym-panel="${safe(routeTab)}">${panel}</div>
    </section>`;
  },

  mount(state, { Store, Toast, navigate }) {
    const load = async ({ silent=false }={}) => {
      try {
        const [summaryResponse,membersResponse,trainersResponse,plansResponse,classesResponse] = await Promise.all([
          GymVerticalService.summary(),GymVerticalService.members(),GymVerticalService.trainers(),GymVerticalService.plans(),GymVerticalService.classes()
        ]);
        const members=rows(membersResponse), trainers=rows(trainersResponse), plans=rows(plansResponse), classes=rows(classesResponse), summary=object(summaryResponse);
        const selectedId=Store.get().gymVertical?.selectedMemberId || members[0]?.id || '';
        const [assessments,routines,nutrition]=selectedId ? await Promise.all([GymVerticalService.assessments(selectedId),GymVerticalService.routines(selectedId),GymVerticalService.nutrition(selectedId)]) : [[],[],[]];
        Store.update((draft)=>{draft.gymVertical={...(draft.gymVertical||{}),summary,members,trainers,plans,classes,selectedMemberId:selectedId,assessments:rows(assessments),routines:rows(routines),nutrition:rows(nutrition),loaded:true,loading:false,error:''};});
        if(!silent)Toast.show('Control de gimnasio actualizado.','success');
      } catch(error) {
        Store.update((draft)=>{draft.gymVertical={...(draft.gymVertical||{}),loading:false,error:error.message};});
        if(!silent)Toast.show(error.message,'error');
      }
    };

    if(!state.gymVertical?.loaded&&!state.gymVertical?.loading){Store.update((draft)=>{draft.gymVertical={...(draft.gymVertical||{}),loading:true};});load({silent:true});}
    document.getElementById('btnGymRefresh')?.addEventListener('click',()=>load());

    document.querySelectorAll('[data-gym-tab]').forEach((button)=>button.addEventListener('click',(event)=>{
      event.preventDefault();
      const tab=button.dataset.gymTab;
      if(tab==='routines')return navigate('rutinas');
      if(tab==='nutrition')return navigate('nutricion');
      if(state.route==='rutinas'||state.route==='nutricion')return navigate('gimnasio',{tab});
      Store.update((draft)=>{draft.gymVertical={...(draft.gymVertical||{}),tab};});
    }));

    const changeSelected=async(id,tab)=>{
      try {
        const [assessments,routines,nutrition]=id ? await Promise.all([GymVerticalService.assessments(id),GymVerticalService.routines(id),GymVerticalService.nutrition(id)]) : [[],[],[]];
        Store.update((draft)=>{draft.gymVertical={...(draft.gymVertical||{}),selectedMemberId:id,assessments:rows(assessments),routines:rows(routines),nutrition:rows(nutrition),...(tab?{tab}:{})};});
      } catch(error){Toast.show(error.message,'error');}
    };
    document.querySelectorAll('[data-gym-member]').forEach((button)=>button.addEventListener('click',()=>changeSelected(button.dataset.gymMember,'assessments')));
    document.querySelectorAll('[data-gym-selected-member]').forEach((select)=>select.addEventListener('change',()=>changeSelected(select.value)));

    const bind=(id,service,transform=(data)=>data,message='Registro guardado.')=>document.getElementById(id)?.addEventListener('submit',async(event)=>{
      event.preventDefault();
      const form=event.currentTarget;
      if(form.matches('.cg-gym-v1124-disabled'))return;
      const data=Object.fromEntries(new FormData(form));
      try{await service(transform(data,form));Toast.show(message,'success');form.reset();await load({silent:true});}
      catch(error){Toast.show(error.message,'error');}
    });

    bind('gymMemberForm',GymVerticalService.createMember,(data)=>({...data,goals:String(data.goals||'').split(',').map((item)=>item.trim()).filter(Boolean),emergencyContact:{},status:'active'}),'Cliente registrado.');
    bind('gymTrainerForm',GymVerticalService.createTrainer,(data)=>({...data,specialties:String(data.specialties||'').split(',').map((item)=>item.trim()).filter(Boolean),status:'active'}),'Instructor registrado.');
    bind('gymPlanForm',GymVerticalService.createPlan,(data)=>({...data,durationDays:Number(data.durationDays||30),price:Number(data.price||0),active:true,metadata:{}}),'Plan guardado.');
    bind('gymMembershipForm',GymVerticalService.createMembership,(data,form)=>({...data,autoRenew:Boolean(form.autoRenew?.checked),balance:0}),'Membresía activada.');
    bind('gymCheckInForm',GymVerticalService.checkIn,(data)=>({...data,device:navigator.userAgentData?.platform||navigator.platform||'web'}),'Entrada procesada.');
    bind('gymAssessmentForm',GymVerticalService.createAssessment,(data)=>data,'Evaluación corporal guardada.');
    bind('gymRoutineForm',GymVerticalService.createRoutine,(data)=>{
      const exercises=String(data.exerciseLines||'').split('\n').map((line)=>line.split('|').map((part)=>part.trim())).filter((parts)=>parts[1]).map((parts,index)=>({dayOfWeek:Number(String(parts[0]||'1').replace(/\D/g,''))||1,exerciseName:parts[1],muscleGroup:parts[2]||'',sets:Number(parts[3]||3),reps:parts[4]||'10',restSeconds:Number(parts[5]||60),sortOrder:index+1}));
      return {...data,daysPerWeek:Number(data.daysPerWeek||3),exercises};
    },'Rutina creada.');
    bind('gymNutritionForm',GymVerticalService.createNutrition,(data)=>{
      const meals=String(data.mealLines||'').split('\n').map((line)=>line.split('|').map((part)=>part.trim())).filter((parts)=>parts[0]).map((parts)=>({mealType:parts[0],calories:Number(parts[1]||0),items:String(parts[2]||'').split(',').map((item)=>item.trim()).filter(Boolean)}));
      return {...data,targetCalories:Number(data.targetCalories||0)||null,waterMl:Number(data.waterMl||0)||null,meals};
    },'Plan nutricional creado.');
    bind('gymClassForm',GymVerticalService.createClass,(data)=>({...data,capacity:Number(data.capacity||20)}),'Clase programada.');
  }
};
