import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Mui from '@mui/material';
import { Toaster, toast } from 'react-hot-toast';
import { translations } from '../i18n/translations.js';

const runtime = { React, createRoot, Mui, HotToast: { Toaster, toast } };
const mountedRoots = new WeakMap();

function parseJson(value, fallback = []) { try { return JSON.parse(value || '[]'); } catch { return fallback; } }
function ensureId(node, prefix = 'mui') { if (!node.dataset.muiId) node.dataset.muiId = `${prefix}_${Math.random().toString(36).slice(2, 9)}`; return node.dataset.muiId; }
export function muiModeFor(state) { return state?.settings?.theme === 'dark' ? 'dark' : 'light'; }
function humanize(value='Campo') { return String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,(char)=>char.toUpperCase()); }

export function createContaGestMuiTheme(mode = 'light') {
  const normalized = mode === 'dark' ? 'dark' : 'light';
  const dark = normalized === 'dark';
  const palette = dark ? {
    bg:'#111214', surface:'#181a1d', surface2:'#1f2125', text:'#f4f5f7', muted:'#a4a9b2', subtle:'#737984', border:'#2b2e34', borderStrong:'#3d4149', brand:'#7c86ff', brandHover:'#939bff', brandSoft:'#252942'
  } : {
    bg:'#f4f5f7', surface:'#ffffff', surface2:'#f8f9fb', text:'#17191d', muted:'#626874', subtle:'#8b919c', border:'#e1e4e9', borderStrong:'#cfd3da', brand:'#5661e8', brandHover:'#4650ca', brandSoft:'#eef0ff'
  };
  return Mui.createTheme({
    palette: {
      mode: normalized,
      primary: { main: palette.brand },
      secondary: { main: palette.muted },
      success: { main: dark ? '#69c5a3' : '#157357' },
      warning: { main: dark ? '#e4b461' : '#94620d' },
      error: { main: dark ? '#ef9299' : '#b52a35' },
      info: { main: dark ? '#8bb5eb' : '#3766aa' },
      background: { default: palette.bg, paper: palette.surface },
      text: { primary: palette.text, secondary: palette.muted },
      divider: palette.border,
      action: { hover: palette.surface2, selected: palette.brandSoft, disabledBackground:palette.surface2 }
    },
    typography: {
      fontFamily:'Inter, "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize:12,
      h4:{fontWeight:700,fontSize:'clamp(1.25rem,1.08rem + .42vw,1.5rem)',lineHeight:1.18,letterSpacing:'-.032em'},
      h5:{fontWeight:700,fontSize:'1.0625rem',lineHeight:1.22,letterSpacing:'-.02em'},
      h6:{fontWeight:650,fontSize:'.9375rem',lineHeight:1.25},
      subtitle1:{fontWeight:600,fontSize:'.8125rem'},
      subtitle2:{fontWeight:600,fontSize:'.75rem'},
      body1:{fontSize:'.8125rem',lineHeight:1.48},
      body2:{fontSize:'.75rem',lineHeight:1.45},
      caption:{fontSize:'.625rem',lineHeight:1.35},
      button:{fontWeight:600,fontSize:'.6875rem',textTransform:'none',letterSpacing:0}
    },
    shape: { borderRadius:10 },
    components: {
      MuiCssBaseline:{styleOverrides:{body:{backgroundImage:'none',backgroundColor:palette.bg,color:palette.text}}},
      MuiPaper:{styleOverrides:{root:{backgroundImage:'none',borderColor:palette.border}}},
      MuiCard:{styleOverrides:{root:{backgroundImage:'none',border:`1px solid ${palette.border}`,borderRadius:12,boxShadow:dark?'0 1px 2px rgba(0,0,0,.20), 0 5px 18px rgba(0,0,0,.12)':'0 1px 2px rgba(17,24,39,.035), 0 4px 14px rgba(17,24,39,.025)'}}},
      MuiButton:{defaultProps:{disableElevation:true,size:'small'},styleOverrides:{root:{minHeight:38,borderRadius:8,paddingInline:11,whiteSpace:'nowrap',boxShadow:'none',fontSize:11},containedPrimary:{'&:hover':{backgroundColor:palette.brandHover}}}},
      MuiIconButton:{styleOverrides:{root:{borderRadius:8}}},
      MuiTextField:{defaultProps:{size:'small',fullWidth:true,variant:'outlined',InputLabelProps:{shrink:true}}},
      MuiOutlinedInput:{styleOverrides:{root:{minHeight:38,borderRadius:8,backgroundColor:palette.surface,alignItems:'center','& .MuiOutlinedInput-notchedOutline':{borderColor:palette.borderStrong},'&:hover .MuiOutlinedInput-notchedOutline':{borderColor:palette.subtle},'&.Mui-focused .MuiOutlinedInput-notchedOutline':{borderColor:palette.brand,borderWidth:1.5}},input:{padding:'9px 10px',fontSize:12,fontWeight:400},inputMultiline:{padding:0}}},
      MuiInputBase:{styleOverrides:{inputMultiline:{padding:0,lineHeight:1.48}}},
      MuiInputLabel:{styleOverrides:{root:{fontSize:10,fontWeight:600,color:palette.muted}}},
      MuiSelect:{styleOverrides:{select:{paddingBlock:'8px',fontSize:12,fontWeight:500}}},
      MuiMenuItem:{styleOverrides:{root:{minHeight:34,margin:'2px 5px',borderRadius:7,fontSize:12,fontWeight:500}}},
      MuiTab:{styleOverrides:{root:{minHeight:36,minWidth:0,padding:'7px 10px',fontSize:11,fontWeight:600,textTransform:'none'}}},
      MuiTabs:{styleOverrides:{root:{minHeight:36},indicator:{height:2,borderRadius:4}}},
      MuiTableContainer:{styleOverrides:{root:{border:`1px solid ${palette.border}`,borderRadius:10,boxShadow:'none'}}},
      MuiTableCell:{styleOverrides:{root:{padding:'9px 10px',fontSize:11,borderColor:palette.border},head:{fontSize:9,fontWeight:650,textTransform:'uppercase',letterSpacing:'.045em',color:palette.subtle,backgroundColor:palette.surface2}}},
      MuiChip:{defaultProps:{size:'small'},styleOverrides:{root:{height:22,fontSize:9,fontWeight:650,borderRadius:999}}},
      MuiDialog:{styleOverrides:{paper:{borderRadius:12,backgroundImage:'none',border:`1px solid ${palette.border}`,boxShadow:dark?'0 22px 60px rgba(0,0,0,.42)':'0 18px 48px rgba(17,24,39,.14)'}}},
      MuiBreadcrumbs:{styleOverrides:{root:{fontSize:10,fontWeight:500,color:palette.subtle}}},
      MuiTooltip:{styleOverrides:{tooltip:{fontSize:10,borderRadius:7}}}
    }
  });
}

function Theme({ state, children }) { const mode=muiModeFor(state); const theme=React.useMemo(()=>createContaGestMuiTheme(mode),[mode]); return React.createElement(Mui.ThemeProvider,{theme},children); }
function labelFor(node,fallback='Campo') {
  const key=node.dataset.muiLabel||node.querySelector('label')?.dataset?.i18n||'';
  const explicit=node.querySelector(':scope > span')?.textContent?.trim()||node.getAttribute('aria-label')||'';
  const lang=node.dataset.muiLang||'es';
  return translations?.[lang]?.[key]||explicit||key||fallback;
}
function syncFallback(fallback,value){fallback.value=value;fallback.dispatchEvent(new Event('input',{bubbles:true}));fallback.dispatchEvent(new Event('change',{bubbles:true}));}

function NativeFieldIsland({ node, state, multiline=false }) {
  const fallback=node.querySelector(multiline?'textarea':'input');
  const [value,setValue]=React.useState(String(fallback?.value??''));
  const [passwordVisible,setPasswordVisible]=React.useState(false);
  React.useEffect(()=>{
    const form=fallback?.form;
    const reset=()=>window.setTimeout(()=>setValue(String(fallback?.defaultValue??'')),0);
    form?.addEventListener('reset',reset);
    return()=>form?.removeEventListener('reset',reset);
  },[fallback]);
  if(!fallback)return null;
  const sourceType=multiline?'text':(fallback.type||'text');
  const type=sourceType==='password'&&passwordVisible?'text':sourceType;
  const endAdornment=sourceType==='password'?React.createElement(Mui.InputAdornment,{position:'end'},React.createElement(Mui.IconButton,{size:'small',edge:'end','aria-label':passwordVisible?'Ocultar contraseña':'Mostrar contraseña',onClick:()=>setPasswordVisible((current)=>!current)},React.createElement('i',{className:`fa-solid ${passwordVisible?'fa-eye-slash':'fa-eye'}`,style:{fontSize:12}}))):undefined;
  return React.createElement(Theme,{state},React.createElement(Mui.TextField,{
    label:labelFor(node,humanize(fallback.name||fallback.placeholder)),value,type,fullWidth:true,size:'small',variant:'outlined',required:Boolean(fallback.dataset.wasRequired==='true'),
    placeholder:fallback.placeholder||'',multiline,minRows:multiline?3:undefined,autoComplete:fallback.autocomplete||undefined,
    inputProps:{min:fallback.min||undefined,max:fallback.max||undefined,step:fallback.step||undefined,pattern:fallback.pattern||undefined,inputMode:fallback.inputMode||undefined,maxLength:fallback.maxLength>0?fallback.maxLength:undefined},
    InputProps:endAdornment?{endAdornment}:undefined,
    InputLabelProps:['date','datetime-local','time','month'].includes(type)?{shrink:true}:undefined,
    onChange:(event)=>{const next=event.target.value;setValue(next);syncFallback(fallback,next);},onBlur:()=>fallback.dispatchEvent(new Event('blur',{bubbles:true}))
  }));
}

function SelectIsland({ node, state }) {
  const fallback=node.querySelector('select[data-mui-fallback],select'); const hidden=node.querySelector('input[type="hidden"]');
  const options=parseJson(node.dataset.muiOptions,fallback?[...fallback.options].map((option)=>({value:option.value,label:option.textContent})):[]);
  const label=labelFor(node,humanize(fallback?.name||'Seleccione')); const labelHidden=node.dataset.muiLabelHidden==='true'; const id=ensureId(node,'mui-select');
  const [value,setValue]=React.useState(String(node.dataset.muiValue??hidden?.value??fallback?.value??''));
  React.useEffect(()=>{const form=fallback?.form;const reset=()=>window.setTimeout(()=>setValue(String(fallback?.defaultValue??fallback?.options?.[0]?.value??'')),0);form?.addEventListener('reset',reset);return()=>form?.removeEventListener('reset',reset);},[fallback]);
  const emit=(next)=>{setValue(next);node.dataset.muiValue=next;if(hidden)syncFallback(hidden,next);if(fallback)syncFallback(fallback,next);};
  return React.createElement(Theme,{state},React.createElement(Mui.FormControl,{fullWidth:true,size:'small'},!labelHidden&&React.createElement(Mui.InputLabel,{id:`${id}-label`},label),React.createElement(Mui.Select,{id,labelId:labelHidden?undefined:`${id}-label`,label:labelHidden?undefined:label,value,displayEmpty:labelHidden,required:Boolean(fallback?.dataset?.wasRequired==='true'),onChange:(event)=>emit(String(event.target.value)),inputProps:{'aria-label':label},MenuProps:{PaperProps:{sx:{mt:.6,maxHeight:340,borderRadius:2,'& .MuiMenu-list':{p:.5}}}}},options.map((option)=>React.createElement(Mui.MenuItem,{key:String(option.value),value:String(option.value)},String(option.label))))));
}

function icon(name){return React.createElement('i',{className:`fa-solid ${name||'fa-circle-dot'}`,style:{fontSize:11}});}function navigate(route){if(route)window.dispatchEvent(new CustomEvent('cg:navigate',{detail:{route}}));}
function QuickTabsIsland({node,state}){const items=parseJson(node.dataset.items,[]);return React.createElement(Theme,{state},React.createElement(Mui.Box,{sx:{display:'flex',alignItems:'center',gap:.5,overflowX:'auto',py:.2,px:.2,scrollbarWidth:'none'}},items.map((item)=>React.createElement(Mui.Chip,{key:item.route,icon:icon(item.locked?'fa-lock':item.icon),label:item.label,color:item.active?'primary':'default',variant:item.active?'filled':'outlined',clickable:!item.active&&!item.locked,disabled:Boolean(item.locked),'aria-current':item.active?'page':undefined,title:item.locked?'Bloqueado por rol/perfil activo':item.label,onClick:()=>!item.active&&!item.locked&&navigate(item.route),sx:{flex:'0 0 auto',opacity:1,'& .MuiChip-icon':{color:item.active?'#fff':'primary.main'}}}))));}
function BreadcrumbsIsland({node,state}){const items=parseJson(node.dataset.items,[]);return React.createElement(Theme,{state},React.createElement(Mui.Breadcrumbs,{separator:'›',maxItems:4,'aria-label':'breadcrumb'},items.map((item,index)=>item.current?React.createElement(Mui.Typography,{key:`${item.label}-${index}`,color:'text.secondary',sx:{fontSize:10,fontWeight:500},'aria-current':'page'},item.label):React.createElement(Mui.Link,{key:`${item.label}-${index}`,component:'button',type:'button',underline:item.route?'hover':'none',color:'inherit',onClick:()=>item.route&&navigate(item.route),sx:{border:0,bgcolor:'transparent',p:0,fontSize:10,fontWeight:500,cursor:item.route?'pointer':'default'}},item.label))));}
function ButtonIsland({node,state}){const fallback=node.querySelector('[data-mui-button-fallback]');const label=node.dataset.muiText||fallback?.textContent?.trim()||'Acción';const iconName=node.dataset.muiIcon||'';const variant=node.dataset.muiVariant||'contained';const color=node.dataset.muiColor||'primary';return React.createElement(Theme,{state},React.createElement(Mui.Button,{variant,color,startIcon:iconName?icon(iconName):undefined,onClick:()=>fallback?.click(),sx:{whiteSpace:'nowrap'}},label));}

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
      if(!host||!form.contains(host)){
        host=document.createElement('div');
        host.className='cgx-field';
        field.before(host);
        host.appendChild(field);
      }
      const type=field.tagName==='SELECT'?'select':field.tagName==='TEXTAREA'?'textarea':'field';
      host.dataset.cgxKit=type;
      host.dataset.muiLabel=host.querySelector(':scope > span')?.textContent?.trim()||field.getAttribute('aria-label')||field.placeholder||humanize(field.name);
      if(host.classList.contains('cg-form-span'))host.classList.add('cg-field-wide');
    });
  });
}

function mountNativeFields(ctx){
  promoteLegacyFields();
  document.querySelectorAll('[data-cgx-kit="field"]').forEach((node)=>{prepareNativeField(node,'field');if(node.dataset.muiNativePrepared==='true')mount(node,'muiNativeMounted','[data-mui-native-mount]',React.createElement(NativeFieldIsland,{node,state:ctx.state}));});
  document.querySelectorAll('[data-cgx-kit="textarea"]').forEach((node)=>{prepareNativeField(node,'textarea');if(node.dataset.muiNativePrepared==='true')mount(node,'muiNativeMounted','[data-mui-native-mount]',React.createElement(NativeFieldIsland,{node,state:ctx.state,multiline:true}));});
  document.querySelectorAll('[data-cgx-kit="select"]').forEach((node)=>{prepareSelect(node);if(node.dataset.muiSelectPrepared==='true')mount(node,'muiMounted','[data-mui-mount]',React.createElement(SelectIsland,{node,state:ctx.state}));});
}
function mountSelect(node,ctx){const root=mount(node,'muiMounted','[data-mui-mount]',React.createElement(SelectIsland,{node,state:ctx.state}));if(root)node.classList.add('mui-loading-done');}
function mountQuickTabs(node,ctx){const root=mount(node,'muiQuicktabsMounted','[data-mui-quicktabs-mount]',React.createElement(QuickTabsIsland,{node,state:ctx.state}));if(root){node.querySelectorAll('.page-tab').forEach((item)=>item.classList.add('mui-fallback-hidden'));node.classList.add('mui-quicktabs-ready');}}
function mountBreadcrumbs(node,ctx){const root=mount(node,'muiBreadcrumbsMounted','[data-mui-breadcrumb-mount]',React.createElement(BreadcrumbsIsland,{node,state:ctx.state}));if(root){node.querySelector('.hf-breadcrumbs-fallback')?.classList.add('mui-fallback-hidden');node.classList.add('mui-breadcrumbs-ready');}}
function mountButton(node,ctx){const root=mount(node,'muiButtonMounted','[data-mui-button-mount]',React.createElement(ButtonIsland,{node,state:ctx.state}));if(root){node.querySelector('[data-mui-button-fallback]')?.classList.add('mui-fallback-hidden');node.classList.add('mui-button-ready');}}
function mountToast(ctx){const node=document.getElementById('hot-toast-root');if(!node||node.dataset.hotToastMounted==='true')return;node.dataset.hotToastMounted='true';window.CG_HOT_TOAST=toast;createRoot(node).render(React.createElement(Toaster,{position:'top-right',gutter:8,toastOptions:{duration:3600,style:{borderRadius:'10px',background:'var(--cg-v-surface)',color:'var(--cg-v-text)',border:'1px solid var(--cg-v-border)',boxShadow:'var(--cg-v-shadow-2)',fontSize:11,fontWeight:600}}}));}

export const MuiRuntime={mountAll(ctx={}){window.__CG_MUI__=runtime;mountToast(ctx);mountNativeFields(ctx);document.querySelectorAll('[data-mui-select-field]').forEach((node)=>mountSelect(node,ctx));document.querySelectorAll('[data-mui-button-field]').forEach((node)=>mountButton(node,ctx));document.querySelectorAll('[data-mui-quicktabs]').forEach((node)=>mountQuickTabs(node,ctx));document.querySelectorAll('[data-mui-breadcrumbs]').forEach((node)=>mountBreadcrumbs(node,ctx));}};
