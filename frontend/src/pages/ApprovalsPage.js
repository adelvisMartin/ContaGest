import { PageHeader, MetricGrid, ErpSection, Badge, ErpButton } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';
import { ApprovalsService } from '../services/approvalsService.js';

const safe=(value)=>escapeHtml(String(value??''));
const statusLabel={pending:'Esperando aprobación',approved:'Aprobada',rejected:'Rechazada',cancelled:'Cancelada',expired:'Expirada',executing:'Ejecutando',executed:'Ejecutada'};
const statusTone={pending:'warning',approved:'success',rejected:'danger',cancelled:'neutral',expired:'danger',executing:'brand',executed:'success'};
const fmtDate=(value)=>value?new Intl.DateTimeFormat('es-VE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
const row=(item,actionable=false)=>`<tr>
  <td><strong>${safe(item.capability)}</strong><small class="cg-ui-muted">Rev. ${safe(item.revision)}</small></td>
  <td>${Badge(statusLabel[item.status]||item.status,statusTone[item.status]||'neutral')}</td>
  <td>${item.amount?`${safe(item.amount)} ${safe(item.currency||'')}`:'Sin umbral monetario'}</td>
  <td>${safe(item.approvedCount||0)}/${safe(item.requiredApprovals||1)}</td>
  <td>${safe(fmtDate(item.expiresAt))}</td>
  <td>${actionable?`${ErpButton('Aprobar',{variant:'primary',icon:'fa-solid fa-check',data:{'approval-approve':item.id}})} ${ErpButton('Rechazar',{variant:'secondary',icon:'fa-solid fa-xmark',data:{'approval-reject':item.id}})}`:'—'}</td>
</tr>`;
const table=(items,actionable=false)=>items.length?`<div class="table-wrap"><table><thead><tr><th>Capability</th><th>Estado</th><th>Monto</th><th>Aprobaciones</th><th>Expira</th><th>Acciones</th></tr></thead><tbody>${items.map((item)=>row(item,actionable)).join('')}</tbody></table></div>`:`<div class="cgx-empty"><span class="cgx-empty-icon"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></span><strong>Sin elementos pendientes</strong><p>No hay decisiones que requieran atención en este momento.</p></div>`;

export const ApprovalsPage={
  render(){return `<section class="cg-page-stack">${PageHeader({eyebrow:'Gobierno operativo',title:'Aprobaciones y segregación de funciones',description:'Maker-checker para operaciones sensibles. Una solicitud pendiente es un estado de negocio, no un error.'})}<div id="approvalMetrics">${MetricGrid([{label:'Pendientes para mí',value:'…',iconName:'fa-user-check',tone:'warning'},{label:'Mis solicitudes',value:'…',iconName:'fa-paper-plane',tone:'neutral'},{label:'Aprobadas',value:'…',iconName:'fa-circle-check',tone:'success'},{label:'Edad pendiente',value:'…',iconName:'fa-clock',tone:'brand'}])}</div>${ErpSection({title:'Bandeja de aprobación',description:'Solicitudes para las que tu rol o delegación vigente te habilita como checker.',content:'<div id="approvalInbox" aria-live="polite">Cargando…</div>'})}${ErpSection({title:'Mis solicitudes',description:'Trazabilidad del maker: pendientes, decisiones y ejecuciones.',content:'<div id="approvalMine" aria-live="polite">Cargando…</div>'})}${ErpSection({title:'Aging y decisiones',description:'Resumen por capability y estado para auditoría operacional.',content:'<div id="approvalReport" aria-live="polite">Cargando…</div>'})}</section>`;},
  mount(_state,{Toast}){
    const load=async()=>{
      try{
        const [inbox,mine,report]=await Promise.all([ApprovalsService.inbox(),ApprovalsService.mine(),ApprovalsService.report().catch(()=>({rows:[]}))]);
        document.getElementById('approvalInbox').innerHTML=table(inbox,true);
        document.getElementById('approvalMine').innerHTML=table(mine,false);
        const rows=report?.rows||[];const pending=rows.filter((item)=>item.status==='pending');const pendingCount=pending.reduce((sum,item)=>sum+Number(item.count||0),0);const approved=rows.filter((item)=>item.status==='approved'||item.status==='executed').reduce((sum,item)=>sum+Number(item.count||0),0);const avg=pending.length?pending.reduce((sum,item)=>sum+Number(item.avgAgeHours||0)*Number(item.count||0),0)/Math.max(1,pendingCount):0;
        document.getElementById('approvalMetrics').innerHTML=MetricGrid([{label:'Pendientes para mí',value:String(inbox.length),iconName:'fa-user-check',tone:'warning'},{label:'Mis solicitudes',value:String(mine.length),iconName:'fa-paper-plane',tone:'neutral'},{label:'Aprobadas / ejecutadas',value:String(approved),iconName:'fa-circle-check',tone:'success'},{label:'Edad pendiente',value:`${avg.toFixed(1)} h`,iconName:'fa-clock',tone:'brand'}]);
        document.getElementById('approvalReport').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Capability</th><th>Estado</th><th>Casos</th><th>Edad promedio</th></tr></thead><tbody>${rows.map((item)=>`<tr><td>${safe(item.capability)}</td><td>${Badge(statusLabel[item.status]||item.status,statusTone[item.status]||'neutral')}</td><td>${safe(item.count)}</td><td>${Number(item.avgAgeHours||0).toFixed(1)} h</td></tr>`).join('')}</tbody></table></div>`:'<p class="cg-ui-muted">Aún no hay historial de aprobaciones.</p>';
        document.querySelectorAll('[data-approval-approve]').forEach((button)=>button.addEventListener('click',async()=>{button.disabled=true;try{await ApprovalsService.approve(button.dataset.approvalApprove,{reasonCode:'REVIEWED',comment:'Aprobado desde la bandeja operativa.'});Toast.show('Solicitud aprobada.','success');await load();}catch(error){Toast.show(error.message,'error');}finally{button.disabled=false;}}));
        document.querySelectorAll('[data-approval-reject]').forEach((button)=>button.addEventListener('click',async()=>{const reason=window.prompt('Motivo del rechazo:');if(!reason)return;button.disabled=true;try{await ApprovalsService.reject(button.dataset.approvalReject,{reasonCode:'REJECTED',comment:reason});Toast.show('Solicitud rechazada.','warning');await load();}catch(error){Toast.show(error.message,'error');}finally{button.disabled=false;}}));
      }catch(error){const target=document.getElementById('approvalInbox');if(target)target.innerHTML=`<div class="cg-inline-error">${safe(error.message)}</div>`;const mine=document.getElementById('approvalMine');if(mine)mine.innerHTML='';const report=document.getElementById('approvalReport');if(report)report.innerHTML='';Toast.show(`No se pudo cargar Aprobaciones: ${error.message}`,'error');}
    };
    void load();
  }
};
