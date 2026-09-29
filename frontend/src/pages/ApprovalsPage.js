import { PageHeader, MetricGrid, ErpSection, Badge, ErpButton, CgLegacyTable, CgLegacyDataState } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';
import { ApprovalsService } from '../services/approvalsService.js';

const safe=(value)=>escapeHtml(String(value??''));
const statusLabel={pending:'Esperando aprobación',approved:'Aprobada',rejected:'Rechazada',cancelled:'Cancelada',expired:'Expirada',executing:'Ejecutando',executed:'Ejecutada'};
const statusTone={pending:'warning',approved:'success',rejected:'danger',cancelled:'neutral',expired:'danger',executing:'brand',executed:'success'};
const fmtDate=(value)=>value?new Intl.DateTimeFormat('es-VE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
const approvalColumns=(actionable=false)=>[
  {key:'capability',label:'Capability',render:(item)=>`<strong>${safe(item.capability)}</strong><small class="cg-ui-muted">Rev. ${safe(item.revision)}</small>`},
  {key:'status',label:'Estado',render:(item)=>Badge(statusLabel[item.status]||item.status,statusTone[item.status]||'neutral')},
  {key:'amount',label:'Monto',render:(item)=>item.amount?`${safe(item.amount)} ${safe(item.currency||'')}`:'Sin umbral monetario'},
  {key:'approvals',label:'Aprobaciones',render:(item)=>`${safe(item.approvedCount||0)}/${safe(item.requiredApprovals||1)}`},
  {key:'expiresAt',label:'Expira',render:(item)=>safe(fmtDate(item.expiresAt))},
  {key:'actions',label:'Acciones',render:(item)=>actionable?`${ErpButton('Aprobar',{variant:'primary',icon:'fa-solid fa-check',data:{'approval-approve':item.id}})} ${ErpButton('Rechazar',{variant:'secondary',icon:'fa-solid fa-xmark',data:{'approval-reject':item.id}})}`:'—'}
];
const approvalTable=(items,actionable=false)=>CgLegacyTable({caption:actionable?'Bandeja de aprobación':'Mis solicitudes',columns:approvalColumns(actionable),rows:items,emptyTitle:'Sin elementos pendientes',emptyDescription:'No hay decisiones que requieran atención en este momento.'});
const reportTable=(rows)=>CgLegacyTable({caption:'Resumen de aging y decisiones',columns:[{key:'capability',label:'Capability',render:(item)=>safe(item.capability)},{key:'status',label:'Estado',render:(item)=>Badge(statusLabel[item.status]||item.status,statusTone[item.status]||'neutral')},{key:'count',label:'Casos',numeric:true,render:(item)=>safe(item.count)},{key:'age',label:'Edad promedio',numeric:true,render:(item)=>`${Number(item.avgAgeHours||0).toFixed(1)} h`}],rows,emptyTitle:'Aún no hay historial de aprobaciones.'});

export const ApprovalsPage={
  render(){return `<section class="cg-page-stack">${PageHeader({eyebrow:'Gobierno operativo',title:'Aprobaciones y segregación de funciones',description:'Maker-checker para operaciones sensibles. Una solicitud pendiente es un estado de negocio, no un error.'})}<div id="approvalMetrics">${MetricGrid([{label:'Pendientes para mí',value:'…',iconName:'fa-user-check',tone:'warning'},{label:'Mis solicitudes',value:'…',iconName:'fa-paper-plane',tone:'neutral'},{label:'Aprobadas',value:'…',iconName:'fa-circle-check',tone:'success'},{label:'Edad pendiente',value:'…',iconName:'fa-clock',tone:'brand'}])}</div>${ErpSection({title:'Bandeja de aprobación',description:'Solicitudes para las que tu rol o delegación vigente te habilita como checker.',content:`<div id="approvalInbox" aria-live="polite">${CgLegacyDataState({kind:'loading'})}</div>`})}${ErpSection({title:'Mis solicitudes',description:'Trazabilidad del maker: pendientes, decisiones y ejecuciones.',content:`<div id="approvalMine" aria-live="polite">${CgLegacyDataState({kind:'loading'})}</div>`})}${ErpSection({title:'Aging y decisiones',description:'Resumen por capability y estado para auditoría operacional.',content:`<div id="approvalReport" aria-live="polite">${CgLegacyDataState({kind:'loading'})}</div>`})}</section>`;},
  mount(_state,{Toast}){
    const load=async()=>{
      try{
        const [inbox,mine,report]=await Promise.all([ApprovalsService.inbox(),ApprovalsService.mine(),ApprovalsService.report().catch(()=>({rows:[]}))]);
        document.getElementById('approvalInbox').innerHTML=approvalTable(inbox,true);
        document.getElementById('approvalMine').innerHTML=approvalTable(mine,false);
        const rows=report?.rows||[];const pending=rows.filter((item)=>item.status==='pending');const pendingCount=pending.reduce((sum,item)=>sum+Number(item.count||0),0);const approved=rows.filter((item)=>item.status==='approved'||item.status==='executed').reduce((sum,item)=>sum+Number(item.count||0),0);const avg=pending.length?pending.reduce((sum,item)=>sum+Number(item.avgAgeHours||0)*Number(item.count||0),0)/Math.max(1,pendingCount):0;
        document.getElementById('approvalMetrics').innerHTML=MetricGrid([{label:'Pendientes para mí',value:String(inbox.length),iconName:'fa-user-check',tone:'warning'},{label:'Mis solicitudes',value:String(mine.length),iconName:'fa-paper-plane',tone:'neutral'},{label:'Aprobadas / ejecutadas',value:String(approved),iconName:'fa-circle-check',tone:'success'},{label:'Edad pendiente',value:`${avg.toFixed(1)} h`,iconName:'fa-clock',tone:'brand'}]);
        document.getElementById('approvalReport').innerHTML=reportTable(rows);
        document.querySelectorAll('[data-approval-approve]').forEach((button)=>button.addEventListener('click',async()=>{button.disabled=true;try{await ApprovalsService.approve(button.dataset.approvalApprove,{reasonCode:'REVIEWED',comment:'Aprobado desde la bandeja operativa.'});Toast.show('Solicitud aprobada.','success');await load();}catch(error){Toast.show(error.message,'error');}finally{button.disabled=false;}}));
        document.querySelectorAll('[data-approval-reject]').forEach((button)=>button.addEventListener('click',async()=>{const reason=window.prompt('Motivo del rechazo:');if(!reason)return;button.disabled=true;try{await ApprovalsService.reject(button.dataset.approvalReject,{reasonCode:'REJECTED',comment:reason});Toast.show('Solicitud rechazada.','warning');await load();}catch(error){Toast.show(error.message,'error');}finally{button.disabled=false;}}));
      }catch(error){const message=`No se pudo cargar Aprobaciones: ${error.message}`;const target=document.getElementById('approvalInbox');if(target)target.innerHTML=CgLegacyDataState({kind:'error',message});const mine=document.getElementById('approvalMine');if(mine)mine.innerHTML=CgLegacyDataState({kind:'error',message:'No se pudieron cargar tus solicitudes.'});const report=document.getElementById('approvalReport');if(report)report.innerHTML=CgLegacyDataState({kind:'error',message:'No se pudo cargar el reporte de aging.'});Toast.show(message,'error');}
    };
    void load();
  }
};
