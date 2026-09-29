import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Mui from '@mui/material';
import { Toaster, toast } from 'react-hot-toast';
import { translations } from '../i18n/translations.js';
import { createContaGestMuiTheme } from './muiThemeAdapter.js';
import { CgButton, CgTextField, CgSelect, CgDatePicker, CgTimeField } from './vnext/index.js';

export { createContaGestMuiTheme } from './muiThemeAdapter.js';

const runtime={React,createRoot,Mui,HotToast:{Toaster,toast}};
const mountedRoots=new WeakMap();
const SYSTEM_THEME_QUERY='(prefers-color-scheme: dark)';

function parseJson(value,fallback=[]){try{return JSON.parse(value||'[]');}catch{return fallback;}}
function ensureId(node,prefix='mui'){if(!node.dataset.muiId)node.dataset.muiId=`${prefix}_${Math.random().toString(36).slice(2,9)}`;return node.dataset.muiId;}
function systemPrefersDark(){return Boolean(globalThis.matchMedia?.(SYSTEM_THEME_QUERY)?.matches);}
export function muiModeFor(state){const requested=state?.settings?.theme||'light';if(requested==='dark'||requested==='light')return requested;return systemPrefersDark()?'dark':'light';}
function useMuiMode(state){
  const requested=state?.settings?.theme||'light';
  const [systemDark,setSystemDark]=React.useState(systemPrefersDark);
  React.useEffect(()=>{
    if(requested!=='system'||!globalThis.matchMedia)return undefined;
    const query=globalThis.matchMedia(SYSTEM_THEME_QUERY);
    const onChange=(event)=>setSystemDark(Boolean(event.matches));
    setSystemDark(Boolean(query.matches));
    query.addEventListener('change',onChange);
    return()=>query.removeEventListener('change',onChange);
  },[requested]);
  return requested==='system'?(systemDark?'dark':'light'):muiModeFor(state);
}
function humanize(value='Campo'){return String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,(char)=>char.toUpperCase());}

function Theme({state,children}){const mode=useMuiMode(state);const theme=React.useMemo(()=>createContaGestMuiTheme(mode),[mode]);return React.createElement(Mui.ThemeProvider,{theme},children);}
function labelFor(node,fallback='Campo'){const key=node.dataset.muiLabel||node.querySelector('label')?.dataset?.i18n||'',explicit=node.querySelector(':scope > span')?.textContent?.trim()||node.getAttribute('aria-label')||'',lang=node.dataset.muiLang||'es';return translations?.[lang]?.[key]||explicit||key||fallback;}
function syncFallback(fallback,value){fallback.value=value;fallback.dispatchEvent(new Event('input',{bubbles:true}));fallback.dispatchEvent(new Event('change',{bubbles:true}));}

function NativeFieldIsland({node,state,multiline=false}){
  const fallback=node.querySelector(multiline?'textarea':'input');
  const [value,setValue]=React.useState(String(fallback?.value??''));
  const [passwordVisible,setPasswordVisible]=React.useState(false);
  React.useEffect(()=>{const form=fallback?.form;const reset=()=>window.setTimeout(()=>setValue(String(fallback?.defaultValue??'')),0);form?.addEventListener('reset',reset);return()=>form?.removeEventListener('reset',reset);},[fallback]);
  if(!fallback)return null;
  const sourceType=multiline?'text':(fallback.type||'text'),type=sourceType==='password'&&passwordVisible?'text':sourceType;
  const endAdornment=sourceType==='password'?React.createElement(Mui.InputAdornment,{position:'end'},React.createElement(Mui.IconButton,{size:'small',edge:'end','aria-label':passwordVisible?'Ocultar contraseña':'Mostrar contraseña',onClick:()=>setPasswordVisible((current)=>!current)},React.createElement('i',{className:`fa-solid ${passwordVisible?'fa-eye-slash':'fa-eye'}`,style:{fontSize:12}}))):undefined;
  const slotProps={htmlInput:{min:fallback.min||undefined,max:fallback.max||undefined,step:fallback.step||undefined,pattern:fallback.pattern||undefined,inputMode:fallback.inputMode||undefined,maxLength:fallback.maxLength>0?fallback.maxLength:undefined},input:endAdornment?{endAdornment}:undefined,inputLabel:{shrink:true}};
  const common={label:labelFor(node,humanize(fallback.name||fallback.placeholder)),value,fullWidth:true,size:'small',required:Boolean(fallback.dataset.wasRequired==='true'),placeholder:fallback.placeholder||'',slotProps,onChange:(eventOrValue)=>{const next=typeof eventOrValue==='string'?eventOrValue:eventOrValue?.target?.value??'';setValue(next);syncFallback(fallback,next);},onBlur:()=>fallback.dispatchEvent(new Event('blur',{bubbles:true}))};
  const FieldComponent=sourceType==='date'?CgDatePicker:sourceType==='time'?CgTimeField:CgTextField;
  return React.createElement(Theme,{state},React.createElement(FieldComponent,{...common,type:sourceType==='date'||sourceType==='time'?undefined:type,variant:'outlined',multiline,minRows:multiline?3:undefined,autoComplete:fallback.autocomplete||undefined}));
}

function SelectIsland({node,state}){
  const fallback=node.querySelector('select[data-mui-fallback],select'),hidden=node.querySelector('input[type="hidden"]');
  const options=parseJson(node.dataset.muiOptions,fallback?[...fallback.options].map((option)=>({value:option.value,label:option.textContent})):[]),label=labelFor(node,humanize(fallback?.name||'Seleccione')),labelHidden=node.dataset.muiLabelHidden==='true',id=ensureId(node,'mui-select');
  const [value,setValue]=React.useState(String(node.dataset.muiValue??hidden?.value??fallback?.value??''));
  React.useEffect(()=>{const form=fallback?.form;const reset=()=>window.setTimeout(()=>setValue(String(fallback?.defaultValue??fallback?.options?.[0]?.value??'')),0);form?.addEventListener('reset',reset);return()=>form?.removeEventListener('reset',reset);},[fallback]);
  const emit=(next)=>{setValue(next);node.dataset.muiValue=next;if(hidden)syncFallback(hidden,next);if(fallback)syncFallback(fallback,next);};
  return React.createElement(Theme,{state},React.createElement(CgSelect,{id,label:labelHidden?'':label,value,options,required:Boolean(fallback?.dataset?.wasRequired==='true'),onChange:(next)=>emit(String(next)),'aria-label':label}));
}

function icon(name){return React.createElement('i',{className:`fa-solid ${name||'fa-circle-dot'}`,style:{fontSize:11}});}
function navigate(route){if(route)window.dispatchEvent(new CustomEvent('cg:navigate',{detail:{route}}));}
function QuickTabsIsland({node,state}){const items=parseJson(node.dataset.items,[]);return React.createElement(Theme,{state},React.createElement(Mui.Box,{sx:{display:'flex',alignItems:'center',gap:.5,overflowX:'auto',py:.2,px:.2,scrollbarWidth:'none'}},items.map((item)=>React.createElement(Mui.Chip,{key:item.route,icon:icon(item.locked?'fa-lock':item.icon),label:item.label,color:item.active?'primary':'default',variant:item.active?'filled':'outlined',clickable:!item.active&&!item.locked,disabled:Boolean(item.locked),'aria-current':item.active?'page':undefined,title:item.locked?'Bloqueado por rol/perfil activo':item.label,onClick:()=>!item.active&&!item.locked&&navigate(item.route),sx:{flex:'0 0 auto',opacity:1,'& .MuiChip-icon':{color:item.active?'primary.contrastText':'primary.main'}}}))));}
function BreadcrumbsIsland({node,state}){const items=parseJson(node.dataset.items,[]);return React.createElement(Theme,{state},React.createElement(Mui.Breadcrumbs,{separator:'›',maxItems:4,'aria-label':'breadcrumb'},items.map((item,index)=>{const key=`${item.label}-${index}`;if(item.current)return React.createElement(Mui.Typography,{key,color:'text.secondary',sx:{fontSize:10,fontWeight:500},'aria-current':'page'},item.label);if(!item.route)return React.createElement(Mui.Typography,{key,component:'span',color:'text.secondary',sx:{fontSize:10,fontWeight:500}},item.label);return React.createElement(Mui.Link,{key,component:'button',type:'button',underline:'hover',color:'inherit',onClick:()=>navigate(item.route),sx:{border:0,bgcolor:'transparent',p:0,fontSize:10,fontWeight:500,cursor:'pointer'}},item.label);}))));}
function ButtonIsland({node,state}){const fallback=node.querySelector('[data-mui-button-fallback]'),label=node.dataset.muiText||fallback?.textContent?.trim()||'Acción',iconName=node.dataset.muiIcon||'',variant=node.dataset.muiVariant||'contained';return React.createElement(Theme,{state},React.createElement(CgButton,{tone:'brand',variant:variant==='outlined'?'outline':variant==='text'?'ghost':'solid',startIcon:iconName?icon(iconName):undefined,onClick:()=>fallback?.click(),sx:{whiteSpace:'nowrap'}},label));}

function mount(node,marker,mountSelector,element){if(!node||node.dataset[marker]==='true')return;const target=node.querySelector(mountSelector);if(!target)return;node.dataset[marker]='true';const root=createRoot(target);root.render(element);mountedRoots.set(node,root);return root;}
function hideLegacyLabel(node){const ownSpan=node.querySelector(':scope > span');if(ownSpan)ownSpan.classList.add('mui-fallback-hidden');node.querySelector('label')?.classList.add('mui-fallback-hidden');}
function prepareNativeField(node,type){if(!node||node.dataset.muiNativePrepared==='true')return;const fallback=node.querySelector(type==='textarea'?'textarea':'input');if(!fallback||['hidden','file','checkbox','radio','color','range','submit','button'].includes(fallback.type))return;node.dataset.muiNativePrepared='true';fallback.dataset.wasRequired=String(fallback.required);fallback.required=false;fallback.classList.add('mui-fallback-hidden');hideLegacyLabel(node);const target=document.createElement('div');target.dataset.muiNativeMount='';node.appendChild(target);}
function prepareSelect(node){if(!node||node.dataset.muiSelectPrepared==='true')return;const fallback=node.querySelector('select');if(!fallback)return;node.dataset.muiSelectPrepared='true';fallback.dataset.wasRequired=String(fallback.required);fallback.required=false;fallback.dataset.muiFallback='';fallback.classList.add('mui-fallback-hidden');hideLegacyLabel(node);node.dataset.muiOptions=JSON.stringify([...fallback.options].map((option)=>({value:option.value,label:option.textContent})));const target=document.createElement('div');target.dataset.muiMount='';node.appendChild(target);}

function promoteLegacyFields(root=document){
  root.querySelectorAll('.cg-vertical-page form,.cg-stack-form,.cg-inline-form,.cg-clinical-form').forEach((form)=>{
    if(form.closest('.login-form,.coordinate-challenge-card,[data-no-mui]'))return;
    form.querySelectorAll('input.input,textarea.textarea,select.select').forEach((field)=>{
      if(field.closest('[data-cgx-kit]')||['hidden','file','checkbox','radio','color','range','submit','button'].includes(field.type))return;
      let host=field.closest('label');
      if(!host||!form.contains(host)){host=document.createElement('div');host.className='cgx-field';field.before(host);host.appendChild(field);}
      const type=field.tagName==='SELECT'?'select':field.tagName==='TEXTAREA'?'textarea':'field';
      host.dataset.cgxKit=type;host.dataset.muiLabel=host.querySelector(':scope > span')?.textContent?.trim()||field.getAttribute('aria-label')||field.placeholder||humanize(field.name);
      if(host.classList.contains('cg-form-span'))host.classList.add('cg-field-wide');
    });
  });
}

function mountNativeFields(ctx){
  promoteLegacyFields();
  document.querySelectorAll('[data-cgx-kit="field"]').forEach((node)=>{const fallback=node.querySelector('input');if(!fallback||!['date','time'].includes(fallback.type))return;prepareNativeField(node,'field');if(node.dataset.muiNativePrepared==='true')mount(node,'muiNativeMounted','[data-mui-native-mount]',React.createElement(NativeFieldIsland,{node,state:ctx.state}));});
  document.querySelectorAll('[data-cgx-kit="select"]').forEach((node)=>{prepareSelect(node);if(node.dataset.muiSelectPrepared==='true')mount(node,'muiMounted','[data-mui-mount]',React.createElement(SelectIsland,{node,state:ctx.state}));});
}
function mountSelect(node,ctx){const root=mount(node,'muiMounted','[data-mui-mount]',React.createElement(SelectIsland,{node,state:ctx.state}));if(root)node.classList.add('mui-loading-done');}
function mountQuickTabs(node,ctx){const root=mount(node,'muiQuicktabsMounted','[data-mui-quicktabs-mount]',React.createElement(QuickTabsIsland,{node,state:ctx.state}));if(root){node.querySelectorAll('.page-tab').forEach((item)=>item.classList.add('mui-fallback-hidden'));node.classList.add('mui-quicktabs-ready');}}
function mountBreadcrumbs(node,ctx){const root=mount(node,'muiBreadcrumbsMounted','[data-mui-breadcrumb-mount]',React.createElement(BreadcrumbsIsland,{node,state:ctx.state}));if(root){node.querySelector('.hf-breadcrumbs-fallback')?.classList.add('mui-fallback-hidden');node.classList.add('mui-breadcrumbs-ready');}}
function mountButton(node,ctx){const root=mount(node,'muiButtonMounted','[data-mui-button-mount]',React.createElement(ButtonIsland,{node,state:ctx.state}));if(root){node.querySelector('[data-mui-button-fallback]')?.classList.add('mui-fallback-hidden');node.classList.add('mui-button-ready');}}
function mountToast(ctx){const node=document.getElementById('hot-toast-root');if(!node||node.dataset.hotToastMounted==='true')return;node.dataset.hotToastMounted='true';window.CG_HOT_TOAST=toast;createRoot(node).render(React.createElement(Toaster,{position:'top-right',gutter:8,toastOptions:{duration:3600,style:{borderRadius:'10px',background:'var(--cg-v-surface)',color:'var(--cg-v-text)',border:'1px solid var(--cg-v-border)',boxShadow:'var(--cg-v-shadow-2)',fontSize:11,fontWeight:600}}}));}

export const MuiRuntime={mountAll(ctx={}){window.__CG_MUI__=runtime;mountToast(ctx);mountNativeFields(ctx);document.querySelectorAll('[data-mui-select-field]').forEach((node)=>mountSelect(node,ctx));document.querySelectorAll('[data-mui-button-field]').forEach((node)=>mountButton(node,ctx));document.querySelectorAll('[data-mui-quicktabs]').forEach((node)=>mountQuickTabs(node,ctx));document.querySelectorAll('[data-mui-breadcrumbs]').forEach((node)=>mountBreadcrumbs(node,ctx));}};
