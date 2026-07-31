import { PageHeader, Button, Badge } from '../components/ui/index.js';
import { GymVerticalService } from '../services/verticalService.js';
import { escapeHtml } from '../utils/dom.js';

const safe = (value) => escapeHtml(value ?? '');
const dateValue = (days = 0) => {
  const date = new Date(Date.now() + days * 86400000 - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 10);
};
const dateTimeValue = (minutes = 0) => {
  const date = new Date(Date.now() + minutes * 60000 - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
};
const option = (item, label) => `<option value="${safe(item.id)}">${safe(label)}</option>`;

function summaryCards(summary = {}) {
  return `<section class="cg-vertical-kpis cg-gym-kpis">
    <article><span>Clientes activos</span><strong>${Number(summary.members?.active || 0)}</strong><small>${Number(summary.members?.total || 0)} registrados</small><i class="fa-solid fa-users"></i></article>
    <article><span>Membresías activas</span><strong>${Number(summary.memberships?.active || 0)}</strong><small>${Number(summary.memberships?.expiring || 0)} vencen en 7 días</small><i class="fa-solid fa-id-card"></i></article>
    <article><span>Entradas de hoy</span><strong>${Number(summary.checkinsToday || 0)}</strong><small>Control de acceso</small><i class="fa-solid fa-right-to-bracket"></i></article>
    <article><span>Ingresos del mes</span><strong>$ ${Number(summary.revenueThisMonth || 0).toLocaleString('es-VE',{minimumFractionDigits:2})}</strong><small>Pagos confirmados</small><i class="fa-solid fa-chart-line"></i></article>
  </section>`;
}

function memberCards(members) {
  if (!members.length) return '<div class="cgx-empty"><i class="fa-solid fa-user-plus"></i><strong>Sin clientes registrados</strong><p>Crea el primer perfil del gimnasio.</p></div>';
  return `<div class="cg-gym-member-grid">${members.map((member) => {
    const initials = String(member.fullName || 'CG').split(' ').map((part) => part[0]).join('').slice(0,2).toUpperCase();
    const expires = member.membershipEndsAt ? new Date(member.membershipEndsAt) : null;
    const expiring = expires && expires.getTime() < Date.now() + 7 * 86400000;
    return `<article class="cg-gym-member-card ${member.status !== 'active' ? 'is-muted' : ''}">
      <button type="button" class="cg-gym-member-main" data-gym-member="${safe(member.id)}">
        <span class="cg-gym-member-photo">${member.photoUrl ? `<img src="${safe(member.photoUrl)}" alt="Foto de ${safe(member.fullName)}">` : initials}</span>
        <span class="cg-gym-member-copy"><strong>${safe(member.fullName)}</strong><small>${safe(member.memberCode)} · ${safe(member.phone || member.email || 'Sin contacto')}</small><span>${safe(member.planName || 'Sin membresía')} ${expires ? `· vence ${expires.toLocaleDateString('es-VE')}` : ''}</span></span>
      </button>
      <footer>${Badge(member.status, member.status === 'active' ? 'success' : 'warning')}${member.membershipStatus ? Badge(member.membershipStatus, expiring ? 'warning' : member.membershipStatus === 'active' ? 'success' : 'danger') : Badge('Sin plan','danger')}</footer>
    </article>`;
  }).join('')}</div>`;
}

function assessmentTimeline(assessments = []) {
  if (!assessments.length) return '<p class="cg-vertical-empty">No hay evaluaciones corporales registradas.</p>';
  return `<div class="cg-assessment-timeline">${assessments.map((assessment) => `<article>
    <time>${new Date(assessment.measuredAt).toLocaleDateString('es-VE')}</time>
    <div class="cg-assessment-values">
      <span><small>Peso</small><strong>${assessment.weightKg ?? '—'} kg</strong></span>
      <span><small>Grasa</small><strong>${assessment.bodyFatPct ?? '—'} %</strong></span>
      <span><small>Músculo</small><strong>${assessment.muscleMassKg ?? '—'} kg</strong></span>
      <span><small>IMC</small><strong>${assessment.bmi ?? '—'}</strong></span>
    </div>
    ${assessment.notes ? `<p>${safe(assessment.notes)}</p>` : ''}
  </article>`).join('')}</div>`;
}

function routineCards(routines = []) {
  if (!routines.length) return '<p class="cg-vertical-empty">No hay rutinas creadas.</p>';
  return `<div class="cg-routine-grid">${routines.map((routine) => `<article>
    <header><div><strong>${safe(routine.name)}</strong><span>${safe(routine.goal || 'Objetivo general')} · ${safe(routine.level)}</span></div>${Badge(routine.active ? 'Activa' : 'Inactiva',routine.active?'success':'warning')}</header>
    <div class="cg-routine-days">${Array.from(new Set((routine.exercises || []).map((item) => Number(item.dayOfWeek)))).sort().map((day) => `<span>Día ${day}</span>`).join('')}</div>
    <ul>${(routine.exercises || []).slice(0,8).map((item) => `<li><strong>${safe(item.exerciseName || 'Ejercicio')}</strong><span>${Number(item.sets || 0)} × ${safe(item.reps || '')}${item.loadKg ? ` · ${item.loadKg} kg` : ''}</span></li>`).join('')}</ul>
  </article>`).join('')}</div>`;
}

function nutritionCards(plans = []) {
  if (!plans.length) return '<p class="cg-vertical-empty">No hay planes nutricionales creados.</p>';
  return `<div class="cg-nutrition-grid">${plans.map((plan) => `<article>
    <header><div><strong>${safe(plan.name)}</strong><span>${safe(plan.goal || 'Plan nutricional')}</span></div>${Badge(plan.active?'Activo':'Inactivo',plan.active?'success':'warning')}</header>
    <div class="cg-macro-grid"><span><small>Calorías</small><strong>${plan.targetCalories ?? '—'}</strong></span><span><small>Proteína</small><strong>${plan.proteinG ?? '—'} g</strong></span><span><small>Carbos</small><strong>${plan.carbsG ?? '—'} g</strong></span><span><small>Grasas</small><strong>${plan.fatG ?? '—'} g</strong></span></div>
    <ul>${(plan.meals || []).map((meal) => `<li><strong>${safe(meal.mealType)}</strong><span>${meal.calories ?? '—'} kcal · ${safe((meal.items || []).map((item)=>typeof item==='string'?item:item?.name||'').filter(Boolean).join(', '))}</span></li>`).join('')}</ul>
  </article>`).join('')}</div>`;
}

function classesList(classes = []) {
  if (!classes.length) return '<p class="cg-vertical-empty">No hay clases próximas.</p>';
  return `<div class="cg-class-list">${classes.map((item) => `<article><time>${new Date(item.startsAt).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})}</time><div><strong>${safe(item.name)}</strong><span>${safe(item.trainerName || 'Instructor por asignar')} · ${safe(item.location || 'Sala principal')}</span></div><span class="cg-class-capacity">${Number(item.bookings || 0)} / ${Number(item.capacity || 0)}</span>${Badge(item.status,item.status==='scheduled'?'success':'warning')}</article>`).join('')}</div>`;
}

export const GymManagementPage = {
  render(state) {
    const data = state.gymVertical || {};
    const members = data.members || [];
    const trainers = data.trainers || [];
    const plans = data.plans || [];
    const selected = members.find((member) => member.id === data.selectedMemberId);
    const routeTab = state.route === 'rutinas' ? 'routines' : state.route === 'nutricion' ? 'nutrition' : data.tab || 'overview';

    return `<section class="cg-page-stack cg-vertical-page cg-gym-page">
      ${PageHeader({
        eyebrow:'Vertical Fitness',
        title:'Control integral de gimnasio',
        description:'Clientes, fotos, membresías, cobros, asistencia, evaluaciones corporales, instructores, rutinas, nutrición y clases desde cualquier dispositivo.',
        actions:`${Button({id:'btnGymRefresh',text:'Actualizar',icon:'fa-rotate',variant:'secondary'})}${Button({text:'Mensajes WhatsApp',icon:'fa-message',variant:'secondary',attrs:'data-route="mensajes"'})}`
      })}
      ${summaryCards(data.summary)}

      <nav class="cg-vertical-tabs" aria-label="Secciones del gimnasio">
        <button type="button" data-gym-tab="overview" class="${routeTab==='overview'?'active':''}"><i class="fa-solid fa-gauge-high"></i> Operación</button>
        <button type="button" data-gym-tab="members" class="${routeTab==='members'?'active':''}"><i class="fa-solid fa-users"></i> Clientes</button>
        <button type="button" data-gym-tab="assessments" class="${routeTab==='assessments'?'active':''}"><i class="fa-solid fa-person-running"></i> Evaluaciones</button>
        <button type="button" data-gym-tab="routines" class="${routeTab==='routines'?'active':''}"><i class="fa-solid fa-dumbbell"></i> Rutinas</button>
        <button type="button" data-gym-tab="nutrition" class="${routeTab==='nutrition'?'active':''}"><i class="fa-solid fa-apple-whole"></i> Nutrición</button>
        <button type="button" data-gym-tab="classes" class="${routeTab==='classes'?'active':''}"><i class="fa-solid fa-calendar-days"></i> Clases</button>
      </nav>

      <div class="cg-gym-tab-panel ${routeTab==='overview'?'active':''}" data-gym-panel="overview">
        <div class="cg-vertical-grid">
          <section class="surface cg-vertical-panel">
            <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Acceso</p><h3>Registrar entrada</h3></div></header>
            <form id="gymCheckInForm" class="cg-stack-form"><select class="select" name="memberId" required><option value="">Seleccionar cliente</option>${members.map((member)=>option(member,`${member.memberCode} · ${member.fullName}`)).join('')}</select><select class="select" name="method"><option value="manual">Manual</option><option value="qr">Código QR</option><option value="barcode">Código de barras</option><option value="nfc">NFC</option></select>${Button({text:'Validar y registrar entrada',icon:'fa-right-to-bracket',type:'submit'})}</form>
          </section>

          <section class="surface cg-vertical-panel">
            <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Membresías</p><h3>Planes comerciales</h3></div><button type="button" class="cgx-icon-action" data-toggle-panel="gymPlanForm" aria-label="Nuevo plan"><i class="fa-solid fa-plus"></i></button></header>
            <form id="gymPlanForm" class="cg-inline-form is-collapsed"><input class="input" name="name" placeholder="Plan mensual" required><div class="cg-two-fields"><input class="input" type="number" name="durationDays" value="30" min="1" required><input class="input" type="number" step="0.01" name="price" value="20" min="0" required></div><select class="select" name="currency"><option>USD</option><option>VES</option></select>${Button({text:'Guardar plan',icon:'fa-floppy-disk',type:'submit',variant:'secondary'})}</form>
            <div class="cg-plan-list">${plans.length?plans.map((plan)=>`<article><div><strong>${safe(plan.name)}</strong><span>${Number(plan.durationDays)} días</span></div><b>${safe(plan.currency)} ${Number(plan.price).toFixed(2)}</b></article>`).join(''):'<p>No hay planes configurados.</p>'}</div>
          </section>

          <section class="surface cg-vertical-panel">
            <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Asignación</p><h3>Nueva membresía</h3></div></header>
            <form id="gymMembershipForm" class="cg-stack-form"><select class="select" name="memberId" required><option value="">Cliente</option>${members.map((member)=>option(member,member.fullName)).join('')}</select><select class="select" name="planId" required><option value="">Plan</option>${plans.map((plan)=>option(plan,`${plan.name} · ${plan.currency} ${plan.price}`)).join('')}</select><label><span>Fecha de inicio</span><input class="input" type="date" name="startsAt" value="${dateValue()}" required></label><label class="cg-check-row"><input type="checkbox" name="autoRenew"><span>Renovación automática</span></label>${Button({text:'Activar membresía',icon:'fa-id-card',type:'submit'})}</form>
          </section>

          <section class="surface cg-vertical-panel">
            <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Equipo</p><h3>Instructores</h3></div></header>
            <form id="gymTrainerForm" class="cg-stack-form"><input class="input" name="fullName" placeholder="Nombre del instructor" required><input class="input" name="phone" placeholder="Teléfono"><input class="input" name="specialties" placeholder="Musculación, funcional, pilates…">${Button({text:'Agregar instructor',icon:'fa-user-tie',type:'submit',variant:'secondary'})}</form>
            <div class="cg-mini-list">${trainers.length?trainers.map((trainer)=>`<article><span class="cg-mini-avatar">${safe(trainer.fullName?.slice(0,2).toUpperCase())}</span><div><strong>${safe(trainer.fullName)}</strong><small>${safe((trainer.specialties||[]).join(', ')||'Instructor')}</small></div>${Badge(trainer.status,'success')}</article>`).join(''):'<p>Sin instructores.</p>'}</div>
          </section>

          <section class="surface cg-vertical-panel cg-vertical-wide"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Clases próximas</p><h3>Agenda operativa</h3></div></header>${classesList(data.classes||[])}</section>
        </div>
      </div>

      <div class="cg-gym-tab-panel ${routeTab==='members'?'active':''}" data-gym-panel="members">
        <section class="surface cg-vertical-panel">
          <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Base de clientes</p><h3>Perfiles y membresías</h3></div><button type="button" class="cgx-btn cgx-btn-primary" data-toggle-panel="gymMemberForm"><i class="fa-solid fa-user-plus"></i> Nuevo cliente</button></header>
          <form id="gymMemberForm" class="cg-inline-form is-collapsed"><label><span>Código</span><input class="input" name="memberCode" value="GYM-${Date.now().toString().slice(-5)}" required></label><label><span>Nombre completo</span><input class="input" name="fullName" required></label><label><span>Correo</span><input class="input" type="email" name="email"></label><label><span>Teléfono</span><input class="input" name="phone"></label><label><span>Nacimiento</span><input class="input" type="date" name="birthDate"></label><label><span>Sexo</span><select class="select" name="sex"><option value="">No indicado</option><option>Femenino</option><option>Masculino</option><option>Otro</option></select></label><label class="cg-form-span"><span>Objetivos (separados por coma)</span><input class="input" name="goals" placeholder="Pérdida de grasa, aumento de masa muscular"></label><label class="cg-form-span"><span>Observaciones médicas</span><textarea class="textarea" name="medicalNotes"></textarea></label><div class="cg-form-actions">${Button({text:'Guardar cliente',icon:'fa-floppy-disk',type:'submit'})}</div></form>
          ${memberCards(members)}
        </section>
      </div>

      <div class="cg-gym-tab-panel ${routeTab==='assessments'?'active':''}" data-gym-panel="assessments">
        <div class="cg-vertical-grid">
          <section class="surface cg-vertical-panel"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Control corporal</p><h3>Nueva evaluación</h3></div></header><form id="gymAssessmentForm" class="cg-stack-form"><select class="select" name="memberId" required><option value="">Cliente</option>${members.map((member)=>option(member,member.fullName)).join('')}</select><select class="select" name="trainerId"><option value="">Instructor</option>${trainers.map((trainer)=>option(trainer,trainer.fullName)).join('')}</select><div class="cg-two-fields"><input class="input" type="number" step="0.01" name="weightKg" placeholder="Peso kg"><input class="input" type="number" step="0.01" name="heightCm" placeholder="Altura cm"></div><div class="cg-two-fields"><input class="input" type="number" step="0.01" name="bodyFatPct" placeholder="Grasa %"><input class="input" type="number" step="0.01" name="muscleMassKg" placeholder="Músculo kg"></div><div class="cg-two-fields"><input class="input" type="number" step="0.01" name="waistCm" placeholder="Cintura cm"><input class="input" type="number" step="0.01" name="hipCm" placeholder="Cadera cm"></div><textarea class="textarea" name="notes" placeholder="Observaciones, rendimiento, lesiones…"></textarea>${Button({text:'Guardar evaluación',icon:'fa-chart-column',type:'submit'})}</form></section>
          <section class="surface cg-vertical-panel cg-vertical-wide"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Evolución</p><h3>${selected?safe(selected.fullName):'Selecciona un cliente'}</h3></div></header>${assessmentTimeline(data.assessments||[])}</section>
        </div>
      </div>

      <div class="cg-gym-tab-panel ${routeTab==='routines'?'active':''}" data-gym-panel="routines">
        <div class="cg-vertical-grid">
          <section class="surface cg-vertical-panel"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Programación</p><h3>Nueva rutina</h3></div></header><form id="gymRoutineForm" class="cg-stack-form"><select class="select" name="memberId" required><option value="">Cliente</option>${members.map((member)=>option(member,member.fullName)).join('')}</select><select class="select" name="trainerId"><option value="">Instructor</option>${trainers.map((trainer)=>option(trainer,trainer.fullName)).join('')}</select><input class="input" name="name" placeholder="Hipertrofia 4 días" required><input class="input" name="goal" placeholder="Objetivo"><select class="select" name="level"><option value="beginner">Principiante</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option></select><input class="input" type="number" name="daysPerWeek" value="3" min="1" max="7"><label><span>Ejercicios, uno por línea</span><textarea class="textarea" name="exerciseLines" placeholder="Día 1 | Sentadilla | Piernas | 4 | 10 | 60\nDía 1 | Press banca | Pecho | 4 | 8 | 90"></textarea></label>${Button({text:'Crear rutina',icon:'fa-dumbbell',type:'submit'})}</form></section>
          <section class="surface cg-vertical-panel cg-vertical-wide"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Planes de entrenamiento</p><h3>Rutinas activas</h3></div></header>${routineCards(data.routines||[])}</section>
        </div>
      </div>

      <div class="cg-gym-tab-panel ${routeTab==='nutrition'?'active':''}" data-gym-panel="nutrition">
        <div class="cg-vertical-grid">
          <section class="surface cg-vertical-panel"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Nutrición</p><h3>Nuevo plan alimentario</h3></div></header><form id="gymNutritionForm" class="cg-stack-form"><select class="select" name="memberId" required><option value="">Cliente</option>${members.map((member)=>option(member,member.fullName)).join('')}</select><select class="select" name="trainerId"><option value="">Responsable</option>${trainers.map((trainer)=>option(trainer,trainer.fullName)).join('')}</select><input class="input" name="name" placeholder="Déficit controlado" required><input class="input" name="goal" placeholder="Objetivo"><div class="cg-two-fields"><input class="input" type="number" name="targetCalories" placeholder="Calorías"><input class="input" type="number" name="waterMl" placeholder="Agua ml"></div><div class="cg-three-fields"><input class="input" type="number" step="0.1" name="proteinG" placeholder="Proteína g"><input class="input" type="number" step="0.1" name="carbsG" placeholder="Carbos g"><input class="input" type="number" step="0.1" name="fatG" placeholder="Grasas g"></div><label><span>Comidas, una por línea</span><textarea class="textarea" name="mealLines" placeholder="Desayuno | 450 | Avena, huevos, fruta\nAlmuerzo | 650 | Pollo, arroz, ensalada"></textarea></label>${Button({text:'Crear plan nutricional',icon:'fa-apple-whole',type:'submit'})}</form></section>
          <section class="surface cg-vertical-panel cg-vertical-wide"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Seguimiento alimentario</p><h3>Planes activos</h3></div></header>${nutritionCards(data.nutrition||[])}</section>
        </div>
      </div>

      <div class="cg-gym-tab-panel ${routeTab==='classes'?'active':''}" data-gym-panel="classes">
        <div class="cg-vertical-grid"><section class="surface cg-vertical-panel"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Agenda grupal</p><h3>Nueva clase</h3></div></header><form id="gymClassForm" class="cg-stack-form"><input class="input" name="name" placeholder="Funcional, spinning, pilates…" required><select class="select" name="trainerId"><option value="">Instructor</option>${trainers.map((trainer)=>option(trainer,trainer.fullName)).join('')}</select><div class="cg-two-fields"><label><span>Inicio</span><input class="input" type="datetime-local" name="startsAt" value="${dateTimeValue(60)}" required></label><label><span>Fin</span><input class="input" type="datetime-local" name="endsAt" value="${dateTimeValue(120)}" required></label></div><div class="cg-two-fields"><input class="input" type="number" name="capacity" value="20" min="1"><input class="input" name="location" placeholder="Sala / sede"></div>${Button({text:'Programar clase',icon:'fa-calendar-plus',type:'submit'})}</form></section><section class="surface cg-vertical-panel cg-vertical-wide"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Calendario</p><h3>Próximas clases</h3></div></header>${classesList(data.classes||[])}</section></div>
      </div>
    </section>`;
  },

  mount(state, { Store, Toast, navigate }) {
    const load = async ({silent=false}={}) => {
      try {
        const [summary,members,trainers,plans,classes] = await Promise.all([GymVerticalService.summary(),GymVerticalService.members(),GymVerticalService.trainers(),GymVerticalService.plans(),GymVerticalService.classes()]);
        const selectedId = Store.get().gymVertical?.selectedMemberId || members[0]?.id || '';
        const [assessments,routines,nutrition] = selectedId ? await Promise.all([GymVerticalService.assessments(selectedId),GymVerticalService.routines(selectedId),GymVerticalService.nutrition(selectedId)]) : [[],[],[]];
        Store.update((draft)=>{draft.gymVertical={...(draft.gymVertical||{}),summary,members,trainers,plans,classes,selectedMemberId:selectedId,assessments,routines,nutrition,loaded:true,loading:false};});
        if(!silent)Toast.show('Control de gimnasio actualizado.','success');
      } catch(error){Store.update((draft)=>{draft.gymVertical={...(draft.gymVertical||{}),loading:false,error:error.message};});if(!silent)Toast.show(error.message,'error');}
    };
    if(!state.gymVertical?.loaded&&!state.gymVertical?.loading){Store.update((draft)=>{draft.gymVertical={...(draft.gymVertical||{}),loading:true};});load({silent:true});}
    document.getElementById('btnGymRefresh')?.addEventListener('click',()=>load());
    document.querySelectorAll('[data-toggle-panel]').forEach((button)=>button.addEventListener('click',()=>document.getElementById(button.dataset.togglePanel)?.classList.toggle('is-collapsed')));
    document.querySelectorAll('[data-gym-tab]').forEach((button)=>button.addEventListener('click',()=>{
      const tab=button.dataset.gymTab;
      if(tab==='routines')return navigate('rutinas');
      if(tab==='nutrition')return navigate('nutricion');
      Store.update((draft)=>{draft.gymVertical={...(draft.gymVertical||{}),tab};});
    }));
    document.querySelectorAll('[data-gym-member]').forEach((button)=>button.addEventListener('click',async()=>{
      try{const id=button.dataset.gymMember;const[assessments,routines,nutrition]=await Promise.all([GymVerticalService.assessments(id),GymVerticalService.routines(id),GymVerticalService.nutrition(id)]);Store.update((draft)=>{draft.gymVertical={...(draft.gymVertical||{}),selectedMemberId:id,assessments,routines,nutrition,tab:'assessments'};});}catch(error){Toast.show(error.message,'error');}
    }));

    const bind=(id,service,transform=(data)=>data,message='Registro guardado.')=>document.getElementById(id)?.addEventListener('submit',async(event)=>{event.preventDefault();const form=event.currentTarget;const data=Object.fromEntries(new FormData(form));try{await service(transform(data,form));Toast.show(message,'success');form.reset();await load({silent:true});}catch(error){Toast.show(error.message,'error');}});
    bind('gymMemberForm',GymVerticalService.createMember,(data)=>({...data,goals:String(data.goals||'').split(',').map((item)=>item.trim()).filter(Boolean),emergencyContact:{},status:'active'}),'Cliente registrado.');
    bind('gymTrainerForm',GymVerticalService.createTrainer,(data)=>({...data,specialties:String(data.specialties||'').split(',').map((item)=>item.trim()).filter(Boolean),status:'active'}),'Instructor registrado.');
    bind('gymPlanForm',GymVerticalService.createPlan,(data)=>({...data,active:true,metadata:{}}),'Plan guardado.');
    bind('gymMembershipForm',GymVerticalService.createMembership,(data,form)=>({...data,autoRenew:Boolean(form.autoRenew?.checked),balance:0}),'Membresía activada.');
    bind('gymCheckInForm',GymVerticalService.checkIn,(data)=>({...data,device:navigator.userAgentData?.platform||navigator.platform||'web'}),'Entrada procesada.');
    bind('gymAssessmentForm',GymVerticalService.createAssessment,(data)=>data,'Evaluación corporal guardada.');
    bind('gymRoutineForm',GymVerticalService.createRoutine,(data)=>{
      const exercises=String(data.exerciseLines||'').split('\n').map((line,index)=>line.split('|').map((part)=>part.trim())).filter((parts)=>parts[1]).map((parts,index)=>({dayOfWeek:Number(String(parts[0]||'1').replace(/\D/g,''))||1,exerciseName:parts[1],muscleGroup:parts[2]||'',sets:Number(parts[3]||3),reps:parts[4]||'10',restSeconds:Number(parts[5]||60),sortOrder:index+1}));
      return {...data,daysPerWeek:Number(data.daysPerWeek),exercises};
    },'Rutina creada.');
    bind('gymNutritionForm',GymVerticalService.createNutrition,(data)=>{
      const meals=String(data.mealLines||'').split('\n').map((line)=>line.split('|').map((part)=>part.trim())).filter((parts)=>parts[0]).map((parts)=>({mealType:parts[0],calories:Number(parts[1]||0),items:String(parts[2]||'').split(',').map((item)=>item.trim()).filter(Boolean)}));
      return {...data,targetCalories:Number(data.targetCalories||0)||null,waterMl:Number(data.waterMl||0)||null,proteinG:Number(data.proteinG||0)||null,carbsG:Number(data.carbsG||0)||null,fatG:Number(data.fatG||0)||null,meals};
    },'Plan nutricional creado.');
    bind('gymClassForm',GymVerticalService.createClass,(data)=>({...data,capacity:Number(data.capacity||20)}),'Clase programada.');
  }
};
