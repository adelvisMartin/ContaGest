import { PageHeader, Button, Badge } from '../components/ui/index.js';
import { CommunicationTemplateService } from '../services/verticalService.js';
import { escapeHtml } from '../utils/dom.js';

const safe = (value) => escapeHtml(value ?? '');

const DEFAULT_TEMPLATES = [
  { vertical:'general', event:'welcome', name:'Bienvenida', body:'Hola {{nombre}}, te damos la bienvenida a {{empresa}}. Tu acceso está listo. Escríbenos si necesitas ayuda.', variables:['nombre','empresa'] },
  { vertical:'health', event:'appointment_reminder', name:'Recordatorio de cita', body:'Hola {{nombre}}, te recordamos tu cita en {{empresa}} el {{fecha}} a las {{hora}} con {{profesional}}. Responde CONFIRMAR o REPROGRAMAR.', variables:['nombre','empresa','fecha','hora','profesional'] },
  { vertical:'veterinary', event:'vaccine_due', name:'Vacuna próxima', body:'Hola {{tutor}}, la vacuna {{vacuna}} de {{mascota}} corresponde el {{fecha}}. Puedes responder a este mensaje para reservar la cita.', variables:['tutor','mascota','vacuna','fecha'] },
  { vertical:'gym', event:'membership_expiry', name:'Membresía por vencer', body:'Hola {{nombre}}, tu membresía {{plan}} vence el {{fecha}}. Renueva antes del vencimiento para mantener tu acceso y tus rutinas activas.', variables:['nombre','plan','fecha'] },
  { vertical:'gym', event:'routine_ready', name:'Rutina disponible', body:'Hola {{nombre}}, tu rutina {{rutina}} ya está disponible. Tu instructor {{instructor}} recomienda comenzar el {{fecha}}.', variables:['nombre','rutina','instructor','fecha'] },
  { vertical:'gym', event:'class_reminder', name:'Recordatorio de clase', body:'Hola {{nombre}}, te esperamos en la clase {{clase}} el {{fecha}} a las {{hora}} en {{sala}}.', variables:['nombre','clase','fecha','hora','sala'] },
  { vertical:'gym', event:'payment_due', name:'Pago pendiente', body:'Hola {{nombre}}, tienes un saldo pendiente de {{monto}} correspondiente a {{concepto}}. Puedes enviarnos el comprobante por este chat.', variables:['nombre','monto','concepto'] }
];

function templateCards(templates, selectedId) {
  if (!templates.length) return '<p class="cg-vertical-empty">No hay plantillas guardadas.</p>';
  return templates.map((template) => `<button type="button" class="cg-message-template-card ${selectedId===template.id?'active':''}" data-message-template="${safe(template.id)}">
    <span class="cg-message-icon"><i class="fa-brands fa-whatsapp"></i></span>
    <span><strong>${safe(template.name)}</strong><small>${safe(template.vertical)} · ${safe(template.event)}</small><p>${safe(template.body)}</p></span>
    ${Badge(template.active?'Activa':'Inactiva',template.active?'success':'warning')}
  </button>`).join('');
}

function variableFields(variables, values = {}) {
  return (variables || []).map((name) => `<label><span>${safe(name)}</span><input class="input" name="value_${safe(name)}" value="${safe(values[name]||'')}" placeholder="Valor para {{${safe(name)}}}"></label>`).join('');
}

export const CommunicationTemplatesPage = {
  render(state) {
    const data = state.communicationTemplates || {};
    const templates = data.items || [];
    const selected = templates.find((item) => item.id === data.selectedId) || templates[0] || DEFAULT_TEMPLATES[0];
    const variables = Array.isArray(selected.variables) ? selected.variables : [];
    return `<section class="cg-page-stack cg-message-page">
      ${PageHeader({
        eyebrow:'Comunicaciones',
        title:'Mensajes editables de WhatsApp',
        description:'Personaliza recordatorios y comunicaciones por empresa. Las variables se reemplazan al generar el mensaje, sin enviar datos automáticamente.',
        actions:`${Button({id:'btnMessageRefresh',text:'Actualizar',icon:'fa-rotate',variant:'secondary'})}${Button({id:'btnSeedMessages',text:'Crear plantillas recomendadas',icon:'fa-wand-magic-sparkles',variant:'secondary'})}`
      })}
      <div class="cg-message-layout">
        <aside class="surface cg-message-library">
          <header><div><p class="cgx-eyebrow">Biblioteca</p><h3>Plantillas</h3></div><span>${templates.length}</span></header>
          <div class="cg-message-filter"><select id="messageVerticalFilter" class="select"><option value="">Todas</option><option value="general">General</option><option value="health">Salud</option><option value="veterinary">Veterinaria</option><option value="gym">Gimnasio</option></select></div>
          <div class="cg-message-template-list">${templateCards(templates,data.selectedId)}</div>
        </aside>

        <section class="surface cg-message-editor">
          <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Editor</p><h3>${safe(selected.name||'Nueva plantilla')}</h3></div>${Badge(selected.active===false?'Inactiva':'Activa',selected.active===false?'warning':'success')}</header>
          <form id="messageTemplateForm" class="cg-message-form">
            <input type="hidden" name="id" value="${safe(selected.id||'')}">
            <div class="cg-two-fields"><label><span>Vertical</span><select class="select" name="vertical"><option value="general" ${selected.vertical==='general'?'selected':''}>General</option><option value="health" ${selected.vertical==='health'?'selected':''}>Salud</option><option value="veterinary" ${selected.vertical==='veterinary'?'selected':''}>Veterinaria</option><option value="gym" ${selected.vertical==='gym'?'selected':''}>Gimnasio</option></select></label><label><span>Evento</span><input class="input" name="event" value="${safe(selected.event||'')}" placeholder="appointment_reminder" required></label></div>
            <label><span>Nombre interno</span><input class="input" name="name" value="${safe(selected.name||'')}" required></label>
            <label><span>Mensaje</span><textarea class="textarea cg-message-body" name="body" rows="8" required>${safe(selected.body||'')}</textarea></label>
            <label><span>Variables, separadas por coma</span><input class="input" name="variables" value="${safe(variables.join(', '))}" placeholder="nombre, fecha, hora"></label>
            <label class="cg-check-row"><input type="checkbox" name="active" ${selected.active===false?'':'checked'}><span>Plantilla activa</span></label>
            <div class="cg-form-actions">${Button({text:'Guardar plantilla',icon:'fa-floppy-disk',type:'submit'})}</div>
          </form>
        </section>

        <section class="surface cg-message-preview">
          <header class="cg-vertical-head"><div><p class="cgx-eyebrow">Vista previa</p><h3>Personalizar y abrir</h3></div><i class="fa-brands fa-whatsapp"></i></header>
          <form id="messagePreviewForm" class="cg-stack-form">
            <input type="hidden" name="vertical" value="${safe(selected.vertical||'general')}">
            <input type="hidden" name="event" value="${safe(selected.event||'welcome')}">
            ${variableFields(variables,data.previewValues||{})}
            <label><span>Teléfono destino (opcional)</span><input class="input" name="phone" inputmode="tel" placeholder="58412…"></label>
            ${Button({text:'Generar mensaje',icon:'fa-message',type:'submit',variant:'secondary'})}
          </form>
          <div class="cg-whatsapp-preview">
            <span class="cg-whatsapp-avatar"><i class="fa-brands fa-whatsapp"></i></span>
            <div><small>Vista previa</small><p id="messageRenderedPreview">${safe(data.rendered||selected.body||'Completa las variables y genera el mensaje.')}</p><time>${new Date().toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})}</time></div>
          </div>
          <div class="cg-message-preview-actions">
            ${Button({id:'btnCopyRendered',text:'Copiar',icon:'fa-copy',variant:'secondary'})}
            ${Button({id:'btnOpenWhatsApp',text:'Abrir WhatsApp',icon:'fa-arrow-up-right-from-square',variant:'primary'})}
          </div>
          <p class="cg-message-privacy"><i class="fa-solid fa-shield-halved"></i> ContaGest genera el enlace; el usuario confirma el envío dentro de WhatsApp.</p>
        </section>
      </div>
    </section>`;
  },

  mount(state,{Store,Toast}) {
    const load=async({silent=false,vertical=''}={})=>{
      try{const items=await CommunicationTemplateService.list(vertical);Store.update((draft)=>{draft.communicationTemplates={...(draft.communicationTemplates||{}),items,selectedId:draft.communicationTemplates?.selectedId||items[0]?.id||null,loaded:true};});if(!silent)Toast.show('Plantillas actualizadas.','success');}
      catch(error){if(!silent)Toast.show(error.message,'error');}
    };
    if(!state.communicationTemplates?.loaded)load({silent:true});
    document.getElementById('btnMessageRefresh')?.addEventListener('click',()=>load());
    document.getElementById('messageVerticalFilter')?.addEventListener('change',(event)=>load({vertical:event.target.value}));
    document.querySelectorAll('[data-message-template]').forEach((button)=>button.addEventListener('click',()=>Store.update((draft)=>{draft.communicationTemplates={...(draft.communicationTemplates||{}),selectedId:button.dataset.messageTemplate,rendered:''};})));

    document.getElementById('btnSeedMessages')?.addEventListener('click',async()=>{
      try{for(const template of DEFAULT_TEMPLATES)await CommunicationTemplateService.save({...template,channel:'whatsapp',active:true});Toast.show('Plantillas recomendadas creadas.','success');await load({silent:true});}
      catch(error){Toast.show(error.message,'error');}
    });

    document.getElementById('messageTemplateForm')?.addEventListener('submit',async(event)=>{
      event.preventDefault();const form=event.currentTarget;const data=Object.fromEntries(new FormData(form));
      try{const saved=await CommunicationTemplateService.save({channel:'whatsapp',vertical:data.vertical,event:data.event,name:data.name,body:data.body,variables:String(data.variables||'').split(',').map((item)=>item.trim()).filter(Boolean),active:Boolean(form.active.checked)});Store.update((draft)=>{const items=draft.communicationTemplates?.items||[];draft.communicationTemplates={...(draft.communicationTemplates||{}),items:[saved,...items.filter((item)=>item.id!==saved.id)],selectedId:saved.id};});Toast.show('Plantilla guardada.','success');}
      catch(error){Toast.show(error.message,'error');}
    });

    document.getElementById('messagePreviewForm')?.addEventListener('submit',async(event)=>{
      event.preventDefault();const form=event.currentTarget;const raw=Object.fromEntries(new FormData(form));const values=Object.fromEntries(Object.entries(raw).filter(([key])=>key.startsWith('value_')).map(([key,value])=>[key.slice(6),value]));
      try{const result=await CommunicationTemplateService.render({vertical:raw.vertical,event:raw.event,values});const phone=String(raw.phone||'').replace(/\D/g,'');const whatsappUrl=phone?`https://wa.me/${phone}?text=${encodeURIComponent(result.rendered)}`:result.whatsappUrl;Store.update((draft)=>{draft.communicationTemplates={...(draft.communicationTemplates||{}),rendered:result.rendered,whatsappUrl,previewValues:values};});}
      catch(error){Toast.show(error.message,'error');}
    });
    document.getElementById('btnCopyRendered')?.addEventListener('click',async()=>{const text=Store.get().communicationTemplates?.rendered||document.getElementById('messageRenderedPreview')?.textContent||'';try{await navigator.clipboard.writeText(text);Toast.show('Mensaje copiado.','success');}catch{Toast.show('No se pudo copiar automáticamente.','warning');}});
    document.getElementById('btnOpenWhatsApp')?.addEventListener('click',()=>{const url=Store.get().communicationTemplates?.whatsappUrl;if(!url)return Toast.show('Genera primero el mensaje.','warning');window.open(url,'_blank','noopener,noreferrer');});
  }
};
