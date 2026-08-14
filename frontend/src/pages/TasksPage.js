import { PageHeader, Field, Select, Textarea, Button, Badge, MetricGrid, EmptyState, ErpButton, ErpDataTable, ErpGrid, ErpRow, ErpSection } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, qsa, today } from '../utils/dom.js';
import { shortDate } from '../core/formatters.js';
import { TasksService } from '../services/enterpriseOperationsService.js';

const STATUSES=['Pendiente','En proceso','En revisión','Completada'];
const safe=(value)=>escapeHtml(String(value??''));
const statusTone=(status)=>status==='Completada'?'success':status==='En revisión'?'brand':status==='En proceso'?'warning':'neutral';
const priorityTone=(priority)=>priority==='Crítica'?'danger':priority==='Alta'?'warning':priority==='Baja'?'neutral':'brand';

function taskCard(task){
  const meta=[`Inicio: ${shortDate(task.start||task.createdAt)}`,`Vence: ${shortDate(task.due)}`,task.recurrence&&task.recurrence!=='No'?`Repite: ${task.recurrence}`:'',task.dependsOn?`Depende de: ${task.dependsOn}`:''].filter(Boolean).map((value)=>`<span>${safe(value)}</span>`).join('');
  return ErpSection({
    title:task.title,
    description:`${task.module||'General'} · ${task.assignee||'Sin asignar'}`,
    actions:Badge(task.priority||'Media',priorityTone(task.priority)),
    content:`<p class="cg-ui-muted">${safe(task.description||'Sin descripción')}</p><div class="cgx-meta-row">${meta}</div>${ErpRow(ErpButton(task.status||'Pendiente',{variant:'secondary',icon:'fa-solid fa-rotate',data:{'task-status':task.id}})+ErpButton('Archivar tarea',{variant:'danger',icon:'fa-solid fa-box-archive',iconOnly:true,data:{'delete-task':task.id}}),{wrap:true})}`
  });
}

export const TasksPage={
  render(state,{query={}}={}){
    const tasks=state.tasks||[];
    const search=String(query.search||'').toLowerCase();
    const statusFilter=query.status||'all';
    const view=query.view==='board'?'board':'list';
    const filtered=tasks.filter((task)=>(!search||[task.title,task.description,task.module,task.assignee].some((value)=>String(value||'').toLowerCase().includes(search)))&&(statusFilter==='all'||task.status===statusFilter));
    const pending=tasks.filter((task)=>task.status!=='Completada').length;
    const overdue=tasks.filter((task)=>task.status!=='Completada'&&task.due&&new Date(task.due).getTime()<Date.now()).length;
    const critical=tasks.filter((task)=>['Alta','Crítica'].includes(task.priority)&&task.status!=='Completada').length;
    const dependencyOptions=[{value:'',label:'Sin dependencia'},...tasks.map((task)=>({value:task.title,label:task.title}))];

    const table=ErpDataTable({
      caption:'Plan de trabajo',
      columns:[
        {key:'title',label:'Tarea',render:(task)=>`<strong>${safe(task.title)}</strong>${task.description?`<br><small>${safe(task.description)}</small>`:''}`},
        {key:'module',label:'Módulo',render:(task)=>safe(task.module||'General')},
        {key:'assignee',label:'Responsable',render:(task)=>safe(task.assignee||'Sin asignar')},
        {key:'start',label:'Inicio',render:(task)=>safe(shortDate(task.start||task.createdAt))},
        {key:'due',label:'Vence',render:(task)=>safe(shortDate(task.due))},
        {key:'priority',label:'Prioridad',render:(task)=>Badge(task.priority||'Media',priorityTone(task.priority))},
        {key:'status',label:'Estado',render:(task)=>Badge(task.status||'Pendiente',statusTone(task.status))},
        {key:'actions',label:'Acciones',render:(task)=>ErpRow(ErpButton('Cambiar estado',{variant:'secondary',icon:'fa-solid fa-rotate',iconOnly:true,data:{'task-status':task.id}})+ErpButton('Archivar',{variant:'danger',icon:'fa-solid fa-box-archive',iconOnly:true,data:{'delete-task':task.id}}),{wrap:true})}
      ],
      rows:filtered
    });

    const board=ErpGrid(STATUSES.map((status)=>ErpSection({title:status,description:`${filtered.filter((task)=>task.status===status).length} tareas`,content:filtered.filter((task)=>task.status===status).map(taskCard).join('')||EmptyState({title:'Sin tareas',description:'No hay elementos en esta etapa.',iconName:'fa-check'})})).join(''),{columns:'four'});
    const form=`<form id="taskForm" class="cg-ui-stack cg-ui-gap-md">${Field({labelKey:'Título',name:'title',required:true})}${Textarea({labelKey:'Descripción',name:'description'})}<div class="cg-ui-grid cg-ui-grid-two">${Field({labelKey:'Módulo',name:'module',value:'General'})}${Field({labelKey:'Responsable',name:'assignee',placeholder:'Nombre o rol'})}${Field({labelKey:'Inicio',name:'start',type:'date',value:today()})}${Field({labelKey:'Vencimiento',name:'due',type:'date',value:today()})}${Select({labelKey:'Prioridad',name:'priority',options:['Baja','Media','Alta','Crítica'].map((value)=>({value,label:value})),value:'Media'})}${Select({labelKey:'Estado',name:'status',options:STATUSES.map((value)=>({value,label:value})),value:'Pendiente'})}${Select({labelKey:'Recurrencia',name:'recurrence',options:['No','Diaria','Semanal','Mensual'].map((value)=>({value,label:value})),value:'No'})}${Select({labelKey:'Dependencia',name:'dependsOn',options:dependencyOptions})}</div>${Button({text:'Crear tarea',icon:'fa-plus',type:'submit'})}</form>`;
    const toolbar=`<div class="cgx-toolbar"><strong>${filtered.length} resultados</strong><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-query-param="search" value="${safe(query.search||'')}" placeholder="Buscar tarea, módulo o responsable"></label><select class="select" data-query-param="status"><option value="all">Todos los estados</option>${STATUSES.map((status)=>`<option value="${status}" ${statusFilter===status?'selected':''}>${status}</option>`).join('')}</select><button type="button" class="btn btn-secondary" data-query-clear="search,status">Limpiar</button></div>`;

    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'tasksEyebrow',titleKey:'tasksTitle',descKey:'tasksDesc',actions:`${Button({id:'btnTaskRefresh',text:'Actualizar',icon:'fa-rotate',variant:'secondary'})}${Button({id:'btnTaskList',text:'Lista',icon:'fa-list',variant:view==='list'?'primary':'secondary'})}${Button({id:'btnTaskBoard',text:'Tablero',icon:'fa-table-columns',variant:view==='board'?'primary':'secondary'})}`})}${MetricGrid([
      {label:'Pendientes',value:String(pending),iconName:'fa-list-check',tone:'neutral'},
      {label:'Críticas',value:String(critical),iconName:'fa-triangle-exclamation',tone:critical?'warning':'success'},
      {label:'Vencidas',value:String(overdue),iconName:'fa-clock',tone:overdue?'danger':'success'},
      {label:'Completadas',value:String(tasks.length-pending),iconName:'fa-circle-check',tone:'success'}
    ])}${toolbar}<div class="cg-ui-grid cg-ui-grid-two cg-tasks-layout">${ErpSection({title:'Nueva tarea',description:'Define alcance, responsable y secuencia.',content:form})}${view==='board'?ErpSection({title:'Tablero',description:'Estado actual del plan de trabajo.',content:board}):ErpSection({title:'Plan de trabajo',description:'Tareas filtradas y acciones disponibles.',content:table})}</div></section>`;
  },
  mount(state,{Store,Toast,UrlStateService,Loading}){
    const params=UrlStateService.getParams();
    const load=async({silent=false}={})=>{try{if(!silent)Loading?.mount?.('Cargando tareas…');const tasks=await TasksService.list({search:params.search,status:params.status});Store.set({tasks,tasksLoadedAt:new Date().toISOString()});}catch(error){Toast.show(`No se pudieron cargar las tareas: ${error.message}`,'error');}finally{if(!silent)Loading?.unmount?.();}};
    if(!state.tasksLoadedAt)load({silent:true});
    document.getElementById('btnTaskRefresh')?.addEventListener('click',()=>load());
    document.getElementById('btnTaskList')?.addEventListener('click',()=>UrlStateService.setParams({view:'list'}));
    document.getElementById('btnTaskBoard')?.addEventListener('click',()=>UrlStateService.setParams({view:'board'}));
    mountSubmit('#taskForm',async(data,form)=>{const submit=form.querySelector('[type="submit"]');submit?.setAttribute('disabled','disabled');try{const task=await TasksService.create(data);Store.update((draft)=>{draft.tasks=[task,...(draft.tasks||[]).filter((item)=>item.id!==task.id)];draft.tasksLoadedAt=new Date().toISOString();});form.reset();Toast.show('Tarea creada.','success');}catch(error){Toast.show(`No se creó la tarea: ${error.message}`,'error');}finally{submit?.removeAttribute('disabled');}});
    qsa('[data-task-status]').forEach((button)=>button.addEventListener('click',async()=>{const task=(Store.get().tasks||[]).find((item)=>item.id===button.dataset.taskStatus);if(!task)return;const index=STATUSES.indexOf(task.status||'Pendiente');const next=STATUSES[(index+1)%STATUSES.length];try{const updated=await TasksService.setStatus(task.id,next);Store.update((draft)=>{draft.tasks=(draft.tasks||[]).map((item)=>item.id===updated.id?updated:item);});Toast.show(`Tarea movida a ${next}.`,'success');}catch(error){Toast.show(`No se actualizó la tarea: ${error.message}`,'error');}}));
    qsa('[data-delete-task]').forEach((button)=>button.addEventListener('click',async()=>{try{await TasksService.archive(button.dataset.deleteTask);Store.update((draft)=>{draft.tasks=(draft.tasks||[]).filter((item)=>item.id!==button.dataset.deleteTask);});Toast.show('Tarea archivada.','success');}catch(error){Toast.show(`No se archivó la tarea: ${error.message}`,'error');}}));
  }
};
