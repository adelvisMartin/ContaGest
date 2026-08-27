import { PageHeader, Field, Select, Button, Textarea } from '../components/ui/index.js';
import { mountSubmit, qs, downloadText, escapeHtml } from '../utils/dom.js';
import { DataSyncService } from '../services/dataSyncService.js';
import { BUSINESS_MODES } from '../data/moduleCatalog.js';
import { SUPPORT_WIDGET_OPTIONS, THEME_OPTIONS, themeSelectOptions } from '../data/themeCatalog.js';
import { LANGUAGE_OPTIONS } from '../i18n/locales.js';

const settingsNavButton=({target,text,icon,active=false})=>Button({
  text,
  icon,
  variant:active?'primary':'secondary',
  type:'button',
  className:'settings-nav-button',
  attrs:`data-settings-jump="${target}" ${active?'aria-current="page"':''}`
});

const themeChoice=(theme,current)=>Button({
  text:theme.name,
  icon:'fa-palette',
  variant:current===theme.key?'primary':'secondary',
  type:'button',
  className:'settings-theme-choice',
  attrs:`data-theme-card="${escapeHtml(theme.key)}" aria-pressed="${current===theme.key?'true':'false'}" title="${escapeHtml(theme.description||theme.name)}"`
});

const letterhead=(s)=>`<article class="cgx-section settings-letterhead" aria-label="Vista previa del membrete documental"><header class="cgx-section-head"><div><p class="cgx-eyebrow">Vista previa</p><h2>Membrete documental</h2><p>Así se identificará la empresa en documentos y reportes.</p></div><span class="cgx-metric-icon" aria-hidden="true">${s.companyLogoDataUrl?`<img src="${escapeHtml(s.companyLogoDataUrl)}" alt="">`:escapeHtml(String(s.companyTradeName||s.companyName||'CG').slice(0,2).toUpperCase())}</span></header><div class="cgx-section-body"><div class="cgx-module-standard"><div><strong>${escapeHtml(s.companyTradeName||s.companyName||'Empresa')}</strong><p class="cg-ui-muted m-0">RIF ${escapeHtml(s.companyRif||'—')}</p></div><div class="cg-record-fields">${['companyAddress','companyPhone','companyEmail','companyWebsite'].map((key)=>`<div><small class="cg-ui-muted">${escapeHtml(s[key]||'Pendiente')}</small></div>`).join('')}</div><div class="cg-ui-card cg-ui-card-body"><p class="cg-ui-muted m-0">${escapeHtml(s.documentFooter||'Documento generado por ContaGest-VE')}</p></div></div></div></article>`;

export const SettingsPage={
  render(state){
    const s=state.settings||{};
    const modeOptions=Object.entries(BUSINESS_MODES).map(([value,meta])=>({value,label:meta.label}));
    const currentTheme=s.theme||'light';
    return `<section class="cg-page-stack settings-enterprise-page">${PageHeader({eyebrowKey:'settingsEyebrow',titleKey:'settingsTitle',descKey:'settingsDesc'})}
      <section class="cgx-section settings-navigation" aria-label="Navegación de configuración"><div class="cgx-section-body"><nav class="flex flex-wrap gap-2" aria-label="Secciones de configuración">${settingsNavButton({target:'company',text:'Empresa',icon:'fa-building',active:true})}${settingsNavButton({target:'appearance',text:'Apariencia',icon:'fa-palette'})}${settingsNavButton({target:'integration',text:'Integraciones',icon:'fa-plug'})}${settingsNavButton({target:'backup',text:'Respaldo',icon:'fa-shield-halved'})}</nav></div></section>
      <form id="settingsForm" class="cgx-module-standard settings-enterprise-content">
        <section id="company" class="cgx-section settings-section" aria-labelledby="settingsCompanyTitle"><header class="cgx-section-head"><div><p class="cgx-eyebrow">Identidad</p><h2 id="settingsCompanyTitle">Empresa y membrete</h2><p>Datos usados en documentos, facturas, libros y reportes.</p></div><div class="cgx-section-actions"><input id="companyLogoInput" type="file" accept="image/*" class="hidden"><input id="companyLogoDataUrl" type="hidden" name="companyLogoDataUrl" value="${escapeHtml(s.companyLogoDataUrl||'')}">${Button({id:'btnCompanyLogo',text:'Subir logo',icon:'fa-image',variant:'secondary',type:'button'})}${Button({id:'btnClearCompanyLogo',text:'Quitar',icon:'fa-trash-can',variant:'secondary',type:'button'})}</div></header><div class="cgx-section-body"><div class="cgx-dashboard-grid"><div class="cg-record-fields">${Field({labelKey:'Razón social',name:'companyName',value:s.companyName||''})}${Field({labelKey:'Nombre comercial',name:'companyTradeName',value:s.companyTradeName||s.companyName||''})}${Field({labelKey:'RIF',name:'companyRif',value:s.companyRif||'',attrs:'readonly aria-readonly="true" data-rif-locked="true"'})}${Field({labelKey:'Teléfono',name:'companyPhone',value:s.companyPhone||''})}<div class="cg-ui-card cg-ui-card-body cg-field-wide"><div class="cg-ui-row items-start"><i class="fa-solid fa-lock" aria-hidden="true"></i><p class="cg-ui-muted m-0">El RIF queda bloqueado después del registro. Si existe un error fiscal, la corrección fiscal controlada debe procesarse con autorización y respaldo documental.</p></div></div>${Field({labelKey:'Correo de empresa',name:'companyEmail',type:'email',value:s.companyEmail||''})}${Field({labelKey:'Sitio web',name:'companyWebsite',value:s.companyWebsite||''})}${Textarea({labelKey:'Dirección fiscal',name:'companyAddress',value:s.companyAddress||'',className:'cg-field-wide'})}${Field({labelKey:'Subtítulo documental',name:'companySlogan',value:s.companySlogan||'',className:'cg-field-wide'})}${Textarea({labelKey:'Pie de documentos',name:'documentFooter',value:s.documentFooter||'',className:'cg-field-wide'})}${Textarea({labelKey:'Nota legal / auditoría',name:'documentLegalNote',value:s.documentLegalNote||'',className:'cg-field-wide'})}</div>${letterhead(s)}</div></div></section>

        <section id="appearance" class="cgx-section settings-section" aria-labelledby="settingsAppearanceTitle"><header class="cgx-section-head"><div><p class="cgx-eyebrow">Diseño</p><h2 id="settingsAppearanceTitle">Apariencia, sector e idioma</h2><p>Paletas globales, identidad contextual por sector, densidad e idioma de toda la interfaz.</p></div></header><div class="cgx-section-body"><div class="cgx-module-standard"><div><p class="cgx-eyebrow">Tema visual</p><div class="flex flex-wrap gap-2">${THEME_OPTIONS.map((theme)=>themeChoice(theme,currentTheme)).join('')}</div></div><div class="cg-record-fields">${Select({labelKey:'Sector / modo de negocio',name:'businessMode',value:s.businessMode||'admin',options:modeOptions})}${Select({labelKey:'Tema',name:'theme',value:currentTheme,options:themeSelectOptions()})}${Select({labelKey:'Idioma',name:'lang',value:s.lang||'es',options:LANGUAGE_OPTIONS})}${Select({labelKey:'Densidad',name:'density',value:s.density||'compact',options:[{value:'compact',label:'Compacta empresarial'},{value:'comfortable',label:'Cómoda táctil'}]})}${Select({labelKey:'Moneda en reportes',name:'reportCurrency',value:s.reportCurrency||'dual',options:[{value:'dual',label:'Bs + USD'},{value:'VES',label:'Solo Bs'},{value:'USD',label:'Solo USD'}]})}${Select({labelKey:'Soporte WhatsApp flotante',name:'supportWidget',value:s.supportWidget||'peek',options:SUPPORT_WIDGET_OPTIONS})}</div></div></div></section>

        <section id="integration" class="cgx-section settings-section" aria-labelledby="settingsIntegrationTitle"><header class="cgx-section-head"><div><p class="cgx-eyebrow">Infraestructura</p><h2 id="settingsIntegrationTitle">Backend, agenda y comunicaciones</h2><p>Configura identificadores operativos. Las credenciales de Google, correo y mensajería se mantienen exclusivamente en backend.</p></div></header><div class="cgx-section-body"><div class="cgx-module-standard"><div class="cg-record-fields">${Field({labelKey:'URL backend',name:'backendUrl',value:s.backendUrl||'/api/v1'})}${Field({labelKey:'URL Apps Script / Sheets',name:'sheetsUrl',value:s.sheetsUrl||''})}${Field({labelKey:'Google Calendar ID',name:'googleCalendarId',value:s.googleCalendarId||'primary',placeholder:'primary'})}${Field({labelKey:'Correo para citas',name:'appointmentEmailFrom',type:'email',value:s.appointmentEmailFrom||s.companyEmail||''})}${Field({labelKey:'WhatsApp del consultorio',name:'whatsappBusinessNumber',value:s.whatsappBusinessNumber||'',attrs:'inputmode="tel"'})}${Field({labelKey:'Recordar con anticipación (horas)',name:'appointmentReminderHours',type:'number',value:String(s.appointmentReminderHours||24),attrs:'min="1" max="168" step="1"'})}</div><div class="cg-ui-card cg-ui-card-body"><div class="cg-ui-row items-start"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><div><strong>Credenciales fuera del navegador</strong><p class="cg-ui-muted m-0">ContaGest solo guarda aquí identificadores y preferencias no secretas. La sincronización automática con Google Calendar y el envío por Gmail requieren autorización en el servidor. Nunca pegues tokens, claves privadas o secretos en estos campos.</p></div></div></div></div></div></section>

        <section id="backup" class="cgx-section settings-section" aria-labelledby="settingsBackupTitle"><header class="cgx-section-head"><div><p class="cgx-eyebrow">Continuidad</p><h2 id="settingsBackupTitle">Guardado y respaldo</h2><p>Configuración, sincronización y copia portable de los datos del sistema.</p></div></header><div class="cgx-section-body"><div class="flex flex-wrap gap-2">${Button({text:'Guardar configuración',icon:'fa-floppy-disk',type:'submit'})}${Button({id:'btnHealth',text:'Verificar conexión',icon:'fa-plug-circle-check',variant:'secondary',type:'button'})}${Button({id:'btnPushBackend',text:'Subir datos',icon:'fa-cloud-arrow-up',variant:'secondary',type:'button'})}${Button({id:'btnPullBackend',text:'Bajar datos',icon:'fa-cloud-arrow-down',variant:'secondary',type:'button'})}${Button({id:'btnExportState',text:'Exportar respaldo',icon:'fa-download',variant:'secondary',type:'button'})}${Button({id:'btnResetState',text:'Restaurar datos de ejemplo',icon:'fa-rotate-left',variant:'danger',type:'button'})}</div></div></section>
      </form>
    </section>`;
  },
  mount(_state,{Store,Toast,Modal}){
    mountSubmit('#settingsForm',(data)=>{
      Store.set({settings:{...Store.get().settings,...data,appointmentReminderHours:Number(data.appointmentReminderHours||24)}});
      Toast.show('Configuración guardada.','success');
    });
    document.querySelectorAll('[data-theme-card]').forEach((button)=>button.addEventListener('click',()=>Store.update((draft)=>{draft.settings.theme=button.dataset.themeCard;})));
    const setActiveSection=(target)=>document.querySelectorAll('[data-settings-jump]').forEach((button)=>{
      const active=button.dataset.settingsJump===target;
      button.classList.toggle('cgx-btn-primary',active);
      button.classList.toggle('btn-primary',active);
      button.classList.toggle('cgx-btn-secondary',!active);
      button.classList.toggle('btn-secondary',!active);
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-settings-jump]').forEach((button)=>button.addEventListener('click',()=>{
      const target=button.dataset.settingsJump;
      setActiveSection(target);
      document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'});
    }));
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
