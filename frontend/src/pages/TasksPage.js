import { PageHeader, Field, Select, Button, Table, Badge, StatCard } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, qsa, uid, today } from '../utils/dom.js';
import { shortDate } from '../core/formatters.js';

export const TasksPage = {
  render(state) {
    const tasks = state.tasks || [];
    const pending = tasks.filter((task) => task.status !== 'Completada').length;
    const critical = tasks.filter((task) => ['Alta','Crítica'].includes(task.priority)).length;
    const rows = tasks.map((task) => `<tr><td>${escapeHtml(task.title)}</td><td>${escapeHtml(task.module)}</td><td>${shortDate(task.due)}</td><td>${Badge(task.priority, task.priority === 'Crítica' ? 'danger' : task.priority === 'Alta' ? 'warning' : 'slate')}</td><td>${Badge(task.status, task.status === 'Completada' ? 'success' : task.status === 'En proceso' ? 'brand' : 'warning')}</td><td><button class="btn btn-secondary !p-2" data-toggle-task="${task.id}"><i class="fa-solid fa-check"></i></button><button class="btn btn-danger !p-2" data-delete-task="${task.id}"><i class="fa-solid fa-trash"></i></button></td></tr>`);
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">${PageHeader({ eyebrowKey:'tasksEyebrow', titleKey:'tasksTitle', descKey:'tasksDesc' })}
      <div class="mb-5 grid gap-4 md:grid-cols-3">${StatCard({label:'Pendientes', value:String(pending), icon:'fa-list-check'})}${StatCard({label:'Alta prioridad', value:String(critical), icon:'fa-triangle-exclamation', tone:'accent'})}${StatCard({label:'Completadas', value:String(tasks.length-pending), icon:'fa-circle-check'})}</div>
      <div class="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><form id="taskForm" class="panel-soft grid gap-4 rounded-[1.5rem] p-4 sm:grid-cols-2">${Field({labelKey:'title', name:'title', required:true})}${Select({labelKey:'module', name:'module', options:['Ventas','Inventario','Tributos','Bancos','Nómina','Contabilidad','Auditoría'].map((m)=>({value:m,label:m}))})}${Field({labelKey:'date', name:'due', type:'date', value:today()})}${Select({labelKey:'priority', name:'priority', options:[{value:'Media',label:'Media'}, {value:'Alta',label:'Alta'}, {value:'Crítica',label:'Crítica'}]})}${Select({labelKey:'status', name:'status', options:[{value:'Pendiente',label:'Pendiente'}, {value:'En proceso',label:'En proceso'}, {value:'Completada',label:'Completada'}]})}<div class="sm:col-span-2">${Button({text:'Agregar tarea', i18n:'add', icon:'fa-list-check'})}</div></form><div class="panel-soft rounded-[1.5rem] p-4">${Table({headers:[{key:'title'}, {key:'module'}, {key:'date'}, {key:'priority'}, {key:'status'}, {key:'actions'}], rows})}</div></div></section>`;
  },
  mount(state, { Store, Toast }) {
    mountSubmit('#taskForm', (data, form) => { Store.update((draft) => { draft.tasks = draft.tasks || []; draft.tasks.unshift({ id:uid('task'), ...data }); }); form.reset(); Toast.show('Tarea guardada.', 'success'); });
    qsa('[data-toggle-task]').forEach((button) => button.addEventListener('click', () => Store.update((draft) => { const task = (draft.tasks || []).find((item) => item.id === button.dataset.toggleTask); if (task) task.status = task.status === 'Completada' ? 'Pendiente' : 'Completada'; })));
    qsa('[data-delete-task]').forEach((button) => button.addEventListener('click', () => Store.update((draft) => { draft.tasks = (draft.tasks || []).filter((item) => item.id !== button.dataset.deleteTask); })));
  }
};
