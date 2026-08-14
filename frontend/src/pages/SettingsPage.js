import { PageHeader, Field, Select, Button, Textarea } from '../components/ui/index.js';
import { mountSubmit, qs, downloadText, escapeHtml } from '../utils/dom.js';
import { DataSyncService } from '../services/dataSyncService.js';
import { BUSINESS_MODES } from '../data/moduleCatalog.js';
import { SUPPORT_WIDGET_OPTIONS, THEME_OPTIONS, themeSelectOptions } from '../data/themeCatalog.js';
import { LANGUAGE_OPTIONS } from '../i18n/locales.js';

const themeCard=(theme,current)=>`<button type="button" data-theme-card="${theme.key}" class="settings-theme-card ${current===theme.key?'active':''}" title="${escapeHtml(theme.description||theme.name)}"><div class="settings-theme-preview">${[0,1,2,3].map((index)=>`<span class="settings-theme-swatch settings-theme-${theme.key}-${index}"></span>`).join('')}</div><footer><span><strong>${escapeHtml(theme.name)}</strong><small>${escapeHtml(theme.description||'')}</small></span><i class="fa-solid ${current===theme.key?'fa-circle-check':'fa-circle'}"></i></footer></button>`;
const letterhead=(s)=>`<article class="settings-letterhead"><header><div class="settings-logo-preview">${s.companyLogoDataUrl?`<img src="${escapeHtml(s.companyLogoDataUrl)}" alt="Logo">`:escapeHtml(String(s.companyTradeName||s.companyName||'CG').slice(0,2).toUpperCase())}</div><div><small>Membrete documental</small><strong>${escapeHtml(s.companyTradeName||s.companyName||'Empresa')}</strong><span>RIF ${escapeHtml(s.companyRif||'—')}</span></div></header><div>${['companyAddress','companyPhone','companyEmail','companyWebsite'].map((key)=>`<p>${escapeHtml(s[key]||'Pendiente')}</p>`).join('')}</div><footer>${escapeHtml(s.documentFooter||'Documento generado por ContaGest-VE')}</footer></article>`;

export const SettingsPage={
  render(state){
    const s=state.settings||{};
    const modeOptions=Object.entries(BUSINESS_MODES).map(([value,meta])=>({value,label:meta.label}));
    return `<section class="cg-page-stack settings-enterprise-page">${PageHeader({eyebrowKey:'settingsEyebrow',titleKey:'settingsTitle',descKey:'settingsDesc'})}<div class="settings-enterprise-layout"><aside class="surface settings-sidebar"><strong data-i18n="settings">Configuración</strong><nav><button type="button" data-settings-jump="company"><i class="fa-solid fa-building"></i><span data-i18n="company">Empresa</span></button><button type="button" data-settings-jump="appearance"><i class="fa-solid fa-palette"></i><span data-i18n="appearance">Apariencia</span></button><button type="button" data-settings-jump="integration"><i class="fa-solid fa-plug"></i><span data-i18n="integrations">Integraciones</span></button><button type="button" data-settings-jump="backup"><i class="fa-solid fa-shield-halved"></i><span data-i18n="backup">Respaldo</span></button></nav></aside><form id="settingsForm" class="settings-enterprise-content">
      <section id="company" class="surface settings-section"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Identidad</p><h3>Empresa y membrete</h3><p>Datos usados en documentos, facturas, libros y reportes.</p></div><div><input id="companyLogoInput" type="file" accept="image/*" class="hidden"><input id="companyLogoDataUrl" type="hidden" name="companyLogoDataUrl" value="${escapeHtml(s.companyLogoDataUrl||'')}">${Button({id:'btnCompanyLogo',text:'Subir logo',icon:'fa-image',variant:'secondary',type:'button'})}${Button({id:'btnClearCompanyLogo',text:'Quitar',icon:'fa-trash-can',variant:'secondary',type:'button'})}</div></header><div class="settings-company-grid"><div class="settings-fields">${Field({labelKey:'Razón social',name:'companyName',value:s.companyName||''})}${Field({labelKey:'Nombre comercial',name:'companyTradeName',value:s.companyTradeName||s.companyName||''})}${Field({labelKey:'RIF',name:'companyRif',value:s.companyRif||'',attrs:'readonly aria-readonly="true" data-rif-locked="true"'})}<p class="settings-rif-lock-note settings-span"><i class="fa-solid fa-lock"></i> El RIF queda bloqueado después del registro. Si existe un error fiscal, la corrección debe procesarse con autorización y respaldo documental.</p>${Field({labelKey:'Teléfono',name:'companyPhone',value:s.companyPhone||''})}${Field({labelKey:'Correo de empresa',name:'companyEmail',type:'email',value:s.companyEmail||''})}${Field({labelKey:'Sitio web',name:'companyWebsite',value:s.companyWebsite||''})}${Textarea({labelKey:'Dirección fiscal',name:'companyAddress',value:s.companyAddress||'',className:'settings-span'})}${Field({labelKey:'Subtítulo documental',name:'companySlogan',value:s.companySlogan||'',className:'settings-span'})}${Textarea({labelKey:'Pie de documentos',name:'documentFooter',value:s.documentFooter||'',className:'settings-span'})}${Textarea({labelKey:'Nota legal / auditoría',name:'documentLegalNote',value:s.documentLegalNote||'',className:'settings-span'})}</div>${letterhead(s)}</div></section>

      <section id="appearance" class="surface settings-section"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Diseño</p><h3>Apariencia, sector e idioma</h3><p>Paletas globales, identidad contextual por sector, densidad e idioma de toda la interfaz.</p></div></header>
        <div class="settings-theme-grid">${THEME_OPTIONS.map((theme)=>themeCard(theme,s.theme||'light')).join('')}</div>
        <div class="settings-appearance-fields">
          ${Select({labelKey:'Sector / modo de negocio',name:'businessMode',value:s.businessMode||'admin',options:modeOptions})}
          ${Select({labelKey:'Tema',name:'theme',value:s.theme||'light',options:themeSelectOptions()})}
          ${Select({labelKey:'Idioma',name:'lang',value:s.lang||'es',options:LANGUAGE_OPTIONS})}
          ${Select({labelKey:'Densidad',name:'density',value:s.density||'compact',options:[{value:'compact',label:'Compacta empresarial'},{value:'comfortable',label:'Cómoda táctil'}]})}
          ${Select({labelKey:'Moneda en reportes',name:'reportCurrency',value:s.reportCurrency||'dual',options:[{value:'dual',label:'Bs + USD'},{value:'VES',label:'Solo Bs'},{value:'USD',label:'Solo USD'}]})}
          ${Select({labelKey:'Soporte WhatsApp flotante',name:'supportWidget',value:s.supportWidget||'peek',options:SUPPORT_WIDGET_OPTIONS})}
        </div>
      </section>

      <section id="integration" class="surface settings-section"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Infraestructura</p><h3>Backend, agenda y comunicaciones</h3><p>Configura identificadores operativos. Las credenciales de Google, correo y mensajería se mantienen exclusivamente en backend.</p></div></header>
        <div class="settings-appearance-fields">
          ${Field({labelKey:'URL backend',name:'backendUrl',value:s.backendUrl||'/api/v1'})}
          ${Field({labelKey:'URL Apps Script / Sheets',name:'sheetsUrl',value:s.sheetsUrl||''})}
          ${Field({labelKey:'Google Calendar ID',name:'googleCalendarId',value:s.googleCalendarId||'primary',placeholder:'primary'})}
          ${Field({labelKey:'Correo para citas',name:'appointmentEmailFrom',type:'email',value:s.appointmentEmailFrom||s.companyEmail||''})}
          ${Field({labelKey:'WhatsApp del consultorio',name:'whatsappBusinessNumber',value:s.whatsappBusinessNumber||'',attrs:'inputmode="tel"'})}
          ${Field({labelKey:'Recordar con anticipación (horas)',name:'appointmentReminderHours',type:'number',value:String(s.appointmentReminderHours||24),attrs:'min="1" max="168" step="1"'})}
        </div>
        <div class="settings-security-note"><i class="fa-solid fa-shield-halved"></i><div><strong>Credenciales fuera del navegador</strong><p>ContaGest solo guarda aquí identificadores y preferencias no secretas. La sincronización automática con Google Calendar y el envío por Gmail requieren autorización en el servidor. Nunca pegues tokens, claves privadas o secretos en estos campos.</p></div></div>
      </section>

      <section id="backup" class="surface settings-section"><header class="cg-vertical-head"><div><p class="cgx-eyebrow">Continuidad</p><h3>Guardado y respaldo</h3><p>Configuración, sincronización y copia portable de los datos del sistema.</p></div></header><div class="settings-actions">${Button({text:'Guardar configuración',icon:'fa-floppy-disk',type:'submit'})}${Button({id:'btnHealth',text:'Verificar conexión',icon:'fa-plug-circle-check',variant:'secondary',type:'button'})}${Button({id:'btnPushBackend',text:'Subir datos',icon:'fa-cloud-arrow-up',variant:'secondary',type:'button'})}${Button({id:'btnPullBackend',text:'Bajar datos',icon:'fa-cloud-arrow-down',variant:'secondary',type:'button'})}${Button({id:'btnExportState',text:'Exportar respaldo',icon:'fa-download',variant:'secondary',type:'button'})}${Button({id:'btnResetState',text:'Restaurar datos de ejemplo',icon:'fa-rotate-left',variant:'danger',type:'button'})}</div></section>
    </form></div></section>`;
  },
  mount(_state,{Store,Toast,Modal}){
    mountSubmit('#settingsForm',(data)=>{
      Store.set({settings:{...Store.get().settings,...data,appointmentReminderHours:Number(data.appointmentReminderHours||24)}});
      Toast.show('Configuración guardada.','success');
    });
    document.querySelectorAll('[data-theme-card]').forEach((button)=>button.addEventListener('click',()=>Store.update((draft)=>{draft.settings.theme=button.dataset.themeCard;})));
    document.querySelectorAll('[data-settings-jump]').forEach((button)=>button.addEventListener('click',()=>document.getElementById(button.dataset.settingsJump)?.scrollIntoView({behavior:'smooth',block:'start'})));
    const logoInput=qs('#companyLogoInput'),logoHidden=qs('#companyLogoDataUrl');
    qs('#btnCompanyLogo')?.addEventListener('click',()=>logoInput?.click());
    qs('#btnClearCompanyLogo')?.addEventListener('click',()=>{if(logoHidden)logoHidden.value='';Store.update((draft)=>{draft.settings.companyLogoDataUrl='';});});
    logoInput?.addEventListener('change',(event)=>{const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>550*1024)return Toast.show('El logo debe ser una imagen menor de 550 KB.','warning');const reader=new FileReader();reader.onload=()=>{const dataUrl=String(reader.result||'');if(logoHidden)logoHidden.value=dataUrl;Store.update((draft)=>{draft.settings.companyLogoDataUrl=dataUrl;});Toast.show('Logo cargado.','success');};reader.readAsDataURL(file);});
    qs('#btnHealth')?.addEventListener('click',async()=>{try{const result=await DataSyncService.health(Store.get().settings.backendUrl);Toast.show(`Conexión operativa: ${result.service}`,'success');}catch(error){Toast.show(`Conexión no disponible: ${error.message}`,'error');}});
    qs('#btnPushBackend')?.addEventListener('click',async()=>{try{const result=await DataSyncService.pushAll(Store.get().settings.backendUrl,Store.get());Toast.show(`${result.length} recursos enviados.`,'success');}catch(error){Toast.show(error.message,'error');}});
    qs('#btnPullBackend')?.addEventListener('click',async()=>{try{const draft=Store.get();await DataSyncService.pullAll(draft.settings.backendUrl,draft);Store.import(draft);Toast.show('Datos recuperados.','success');}catch(error){Toast.show(error.message,'error');}});
    qs('#btnExportState')?.addEventListener('click',()=>downloadText('contagest-ve-respaldo.json',Store.export(),'application/json'));
    qs('#btnResetState')?.addEventListener('click',()=>Modal.confirm({title:'Restaurar datos de ejemplo',body:'Se restaurarán los datos locales incluidos con la instalación.',confirmText:'Restaurar',onConfirm:()=>Store.reset()}));
  }
};
