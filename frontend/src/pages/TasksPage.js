import { PageHeader, Field, Select, Textarea, Button, Table, Badge, StatCard, EmptyState } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, qsa, today } from '../utils/dom.js';
import { shortDate } from '../core/formatters.js';
import { TasksService } from '../services/enterpriseOperationsService.js';

const STATUSES = ['Pendiente','En proceso','En revisión','Completada'];
const statusTone = (status) => status === 'Completada' ? 'success' : status === 'En revisión' ? 'brand' : status === 'En proceso' ? 'warning' : 'neutral';
const priorityTone = (priority) => priority === 'Crítica' ? 'danger' : priority === 'Alta' ? 'warning' : priority === 'Baja' ? 'neutral' : 'brand';

function taskCard(task) {
  return `<article class="cgx-section" data-task-card="${task.id}"><header class="cgx-section-head"><div><h2>${escapeHtml(task.title)}</h2><p>${escapeHtml(task.module || 'General')} · ${escapeHtml(task.assignee || 'Sin asignar')}</p></div>${Badge(task.priority || 'Media', priorityTone(task.priority))}</header><div class="cgx-section-body"><p>${escapeHtml(task.description || 'Sin descripción')}</p><div class="cgx-meta-row"><span>Inicio: ${shortDate(task.start || task.createdAt)}</span><span>Vence: ${shortDate(task.due)}</span>${task.recurrence && task.recurrence !== 'No' ? `<span>Repite: ${escapeHtml(task.recurrence)}</span>` : ''}${task.dependsOn ? `<span>Depende de: ${escapeHtml(task.dependsOn)}</span>` : ''}</div><div class="cg-row-actions"><button type="button" class="btn btn-secondary" data-task-status="${task.id}">${Badge(task.status || 'Pendiente', statusTone(task.status))}</button><button type="button" class="btn btn-danger !p-2" data-delete-task="${task.id}" aria-label="Archivar tarea"><i class="fa-solid fa-box-archive"></i></button></div></div></article>`;
}

export const TasksPage = {
  render(state, { query = {} } = {}) {
    const tasks = state.tasks || [];
    const search = String(query.search || '').toLowerCase();
    const statusFilter = query.status || 'all';
    const view = query.view === 'board' ? 'board' : 'list';
    const filtered = tasks.filter((task) => (!search || [task.title,task.description,task.module,task.assignee].some((value)=>String(value||'').toLowerCase().includes(search))) && (statusFilter === 'all' || task.status === statusFilter));
    const pending = tasks.filter((task) => task.status !== 'Completada').length;
    const overdue = tasks.filter((task) => task.status !== 'Completada' && task.due && new Date(task.due).getTime() < Date.now()).length;
    const critical = tasks.filter((task) => ['Alta','Crítica'].includes(task.priority) && task.status !== 'Completada').length;
    const dependencyOptions = [{value:'',label:'Sin dependencia'},...tasks.map((task)=>({value:task.title,label:task.title}))];
    const rows = filtered.map((task) => `<tr><td><strong>${escapeHtml(task.title)}</strong><br><small>${escapeHtml(task.description || '')}</small></td><td>${escapeHtml(task.module || 'General')}</td><td>${escapeHtml(task.assignee || 'Sin asignar')}</td><td>${shortDate(task.start || task.createdAt)}</td><td>${shortDate(task.due)}</td><td>${Badge(task.priority || 'Media', priorityTone(task.priority))}</td><td>${Badge(task.status || 'Pendiente', statusTone(task.status))}</td><td><div class="cg-row-actions"><button class="btn btn-secondary !p-2" data-task-status="${task.id}" aria-label="Cambiar estado"><i class="fa-solid fa-rotate"></i></button><button class="btn btn-danger !p-2" data-delete-task="${task.id}" aria-label="Archivar"><i class="fa-solid fa-box-archive"></i></button></div></td></tr>`);
    const columns = STATUSES.map((status) => `<section class="cgx-section"><header class="cgx-section-head"><div><h2>${status}</h2><p>${filtered.filter((task)=>task.status===status).length} tareas</p></div></header><div class="cgx-section-body grid gap-3">${filtered.filter((task)=>task.status===status).map(taskCard).join('') || EmptyState({title:'Sin tareas',description:'No hay elementos en esta etapa.',iconName:'fa-check'})}</div></section>`).join('');

    return `<section class="cg-page-stack">
      ${PageHeader({ eyebrow:'Operaciones', title:'Tareas y seguimiento', description:'Responsables, fechas, dependencias, recurrencias, auditoría y persistencia multiempresa.', actions:`${Button({id:'btnTaskRefresh',text:'Actualizar',icon:'fa-rotate',variant:'secondary'})}${Button({id:'btnTaskList',text:'Lista',icon:'fa-list',variant:view==='list'?'primary':'secondary'})}${Button({id:'btnTaskBoard',text:'Tablero',icon:'fa-table-columns',variant:view==='board'?'primary':'secondary'})}` })}
      <div class="grid gap-3 md:grid-cols-4">${StatCard({label:'Pendientes',value:String(pending),icon:'fa-list-check'})}${StatCard({label:'Críticas',value:String(critical),icon:'fa-triangle-exclamation',tone:'warning'})}${StatCard({label:'Vencidas',value:String(overdue),icon:'fa-clock',tone:'danger'})}${StatCard({label:'Completadas',value:String(tasks.length-pending),icon:'fa-circle-check',tone:'success'})}</div>
      <div class="cgx-toolbar"><strong>${filtered.length} resultados</strong><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-query-param="search" value="${escapeHtml(query.search || '')}" placeholder="Buscar tarea, módulo o responsable"></label><select class="select" data-query-param="status"><option value="all">Todos los estados</option>${STATUSES.map((status)=>`<option value="${status}" ${statusFilter===status?'selected':''}>${status}</option>`).join('')}</select><button type="button" class="btn btn-secondary" data-query-clear="search,status">Limpiar</button></div>
      <div class="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form id="taskForm" class="cgx-section"><header class="cgx-section-head"><div><h2>Nueva tarea</h2><p>Define alcance, dueño y secuencia.</p></div></header><div class="cgx-section-body grid gap-3">
          ${Field({labelKey:'Título',name:'title',required:true})}${Textarea({labelKey:'Descripción',name:'description'})}
          <div class="grid gap-3 sm:grid-cols-2">${Field({labelKey:'Módulo',name:'module',value:'General'})}${Field({labelKey:'Responsable',name:'assignee',placeholder:'Nombre o rol'})}${Field({labelKey:'Inicio',name:'start',type:'date',value:today()})}${Field({labelKey:'Vencimiento',name:'due',type:'date',value:today()})}${Select({labelKey:'Prioridad',name:'priority',options:['Baja','Media','Alta','Crítica'].map((value)=>({value,label:value})),value:'Media'})}${Select({labelKey:'Estado',name:'status',options:STATUSES.map((value)=>({value,label:value})),value:'Pendiente'})}${Select({labelKey:'Recurrencia',name:'recurrence',options:['No','Diaria','Semanal','Mensual'].map((value)=>({value,label:value})),value:'No'})}${Select({labelKey:'Dependencia',name:'dependsOn',options:dependencyOptions})}</div>
          ${Button({text:'Crear tarea',icon:'fa-plus',type:'submit'})}
        </div></form>
        <div>${view === 'board' ? `<div class="grid gap-4 xl:grid-cols-4">${columns}</div>` : `<section class="cgx-section"><header class="cgx-section-head"><div><h2>Plan de trabajo</h2><p>Registros auditados y filtrados mediante la URL.</p></div></header><div class="cgx-section-body">${Table({headers:[{label:'Tarea'},{label:'Módulo'},{label:'Responsable'},{label:'Inicio'},{label:'Vence'},{label:'Prioridad'},{label:'Estado'},{label:'Acciones'}],rows})}</div></section>`}</div>
      </div>
    </section>`;
  },
  mount(state, { Store, Toast, UrlStateService, Loading }) {
    const params = UrlStateService.getParams();
    const load = async ({silent=false}={}) => {
      try {
        if(!silent)Loading?.mount?.('Cargando tareas…');
        const tasks=await TasksService.list({search:params.search,status:params.status});
        Store.set({tasks,tasksLoadedAt:new Date().toISOString()});
      } catch(error) { Toast.show(`No se pudieron cargar las tareas: ${error.message}`,'error'); }
      finally { if(!silent)Loading?.unmount?.(); }
    };
    if(!state.tasksLoadedAt)load({silent:true});
    document.getElementById('btnTaskRefresh')?.addEventListener('click',()=>load());
    document.getElementById('btnTaskList')?.addEventListener('click',()=>UrlStateService.setParams({view:'list'}));
    document.getElementById('btnTaskBoard')?.addEventListener('click',()=>UrlStateService.setParams({view:'board'}));
    mountSubmit('#taskForm', async (data, form) => {
      const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');
      try {
        const task=await TasksService.create(data);
        Store.update((draft)=>{draft.tasks=[task,...(draft.tasks||[]).filter((item)=>item.id!==task.id)];draft.tasksLoadedAt=new Date().toISOString();});
        form.reset();Toast.show('Tarea creada y auditada.','success');
      } catch(error) { Toast.show(`No se creó la tarea: ${error.message}`,'error'); }
      finally { submit?.removeAttribute('disabled'); }
    });
    qsa('[data-task-status]').forEach((button)=>button.addEventListener('click',async()=>{
      const task=(Store.get().tasks||[]).find((item)=>item.id===button.dataset.taskStatus);if(!task)return;
      const index=STATUSES.indexOf(task.status||'Pendiente');const next=STATUSES[(index+1)%STATUSES.length];
      try { const updated=await TasksService.setStatus(task.id,next);Store.update((draft)=>{draft.tasks=(draft.tasks||[]).map((item)=>item.id===updated.id?updated:item);});Toast.show(`Tarea movida a ${next}.`,'success'); }
      catch(error){Toast.show(`No se actualizó la tarea: ${error.message}`,'error');}
    }));
    qsa('[data-delete-task]').forEach((button)=>button.addEventListener('click',async()=>{
      try { await TasksService.archive(button.dataset.deleteTask);Store.update((draft)=>{draft.tasks=(draft.tasks||[]).filter((item)=>item.id!==button.dataset.deleteTask);});Toast.show('Tarea archivada.','success'); }
      catch(error){Toast.show(`No se archivó la tarea: ${error.message}`,'error');}
    }));
  }
};
