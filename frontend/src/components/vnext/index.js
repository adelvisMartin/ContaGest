import React from 'react';
import * as Mui from '@mui/material';

const TONES=new Set(['neutral','brand','success','warning','danger','info']);
const SIZES=new Set(['small','medium','large']);
const safeTone=(tone='neutral')=>TONES.has(tone)?tone:'neutral';
const safeSize=(size='medium')=>SIZES.has(size)?size:'medium';
const toneToColor={neutral:'default',brand:'primary',success:'success',warning:'warning',danger:'error',info:'info'};
const stateLabels={loading:'Cargando',empty:'Sin datos',error:'Ocurrió un error',permission:'Sin permisos'};

/** @typedef {'neutral'|'brand'|'success'|'warning'|'danger'|'info'} CgTone */
/** @typedef {'small'|'medium'|'large'} CgSize */

export function CgButton({tone='brand',variant='solid',size='medium',loading=false,disabled=false,startIcon,endIcon,children,...props}={}){
  const muiVariant=variant==='ghost'?'text':variant==='outline'?'outlined':'contained';
  return React.createElement(Mui.Button,{...props,color:toneToColor[safeTone(tone)]||'primary',variant:muiVariant,size:safeSize(size),disabled:disabled||loading,'aria-busy':loading||undefined,startIcon,endIcon},loading?'Cargando…':children);
}

export function CgIconButton({label,tone='neutral',size='medium',disabled=false,children,...props}={}){
  if(!label)throw new Error('CgIconButton requires an accessible label');
  return React.createElement(Mui.IconButton,{...props,'aria-label':label,color:toneToColor[safeTone(tone)]||'default',size:safeSize(size),disabled},children);
}

export function CgTextField({error=false,helperText='',size='medium',...props}={}){
  return React.createElement(Mui.TextField,{...props,error:Boolean(error),helperText,fullWidth:props.fullWidth??true,size:safeSize(size)==='large'?'medium':safeSize(size),variant:props.variant||'outlined'});
}

export function CgTextarea({minRows=3,...props}={}){
  return React.createElement(CgTextField,{...props,multiline:true,minRows});
}

export function CgPageHeader({eyebrow='ContaGest',title,description='',actions=null,meta=null}={}){
  return React.createElement(Mui.Box,{component:'header',sx:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:2,flexWrap:'wrap'}},
    React.createElement(Mui.Box,null,
      React.createElement(Mui.Typography,{variant:'overline',color:'text.secondary'},eyebrow),
      React.createElement(Mui.Typography,{component:'h1',variant:'h4'},title),
      description?React.createElement(Mui.Typography,{color:'text.secondary',sx:{mt:.5,maxWidth:'74ch'}},description):null,
      meta?React.createElement(Mui.Box,{sx:{mt:1}},meta):null),
    actions?React.createElement(Mui.Stack,{direction:'row',spacing:1,flexWrap:'wrap'},actions):null);
}

export function CgSection({title,description='',actions=null,children,...props}={}){
  return React.createElement(Mui.Box,{component:'section',...props},
    React.createElement(Mui.Stack,{direction:'row',justifyContent:'space-between',alignItems:'flex-start',spacing:2,sx:{mb:2}},
      React.createElement(Mui.Box,null,React.createElement(Mui.Typography,{component:'h2',variant:'h6'},title),description?React.createElement(Mui.Typography,{color:'text.secondary'},description):null),actions),children);
}

export function CgStatusChip({label,tone='neutral',size='small',...props}={}){
  return React.createElement(Mui.Chip,{...props,label,color:toneToColor[safeTone(tone)]||'default',size:safeSize(size)==='large'?'medium':safeSize(size)});
}
export const CgBadge=CgStatusChip;

export function CgMoney({value=0,currency='VES',locale='es-VE',minimumFractionDigits=2,maximumFractionDigits=2,...props}={}){
  const amount=Number(value);
  const text=Number.isFinite(amount)?new Intl.NumberFormat(locale,{style:'currency',currency,minimumFractionDigits,maximumFractionDigits}).format(amount):'—';
  return React.createElement(Mui.Typography,{component:'span',variant:'body2',...props},text);
}

function CgState({kind='empty',title,description='',action=null}={}){
  const tone=kind==='error'?'error.main':kind==='permission'?'warning.main':'text.secondary';
  return React.createElement(Mui.Stack,{role:kind==='error'?'alert':'status',spacing:1,alignItems:'center',justifyContent:'center',sx:{minHeight:160,textAlign:'center',p:3}},
    kind==='loading'?React.createElement(Mui.CircularProgress,{size:28,'aria-label':title||stateLabels.loading}):null,
    React.createElement(Mui.Typography,{fontWeight:700,color:tone},title||stateLabels[kind]||stateLabels.empty),
    description?React.createElement(Mui.Typography,{color:'text.secondary',sx:{maxWidth:'52ch'}},description):null,
    action);
}
export const CgLoadingState=(props)=>React.createElement(CgState,{...props,kind:'loading'});
export const CgEmptyState=(props)=>React.createElement(CgState,{...props,kind:'empty'});
export const CgErrorState=(props)=>React.createElement(CgState,{...props,kind:'error'});
export const CgPermissionState=(props)=>React.createElement(CgState,{...props,kind:'permission'});

export const CgStack=(props)=>React.createElement(Mui.Stack,props);
export const CgGrid=(props)=>React.createElement(Mui.Grid,props);
export const CgSurface=({children,...props}={})=>React.createElement(Mui.Paper,{elevation:0,...props},children);
export const CgCard=({children,...props}={})=>React.createElement(Mui.Card,{variant:'outlined',...props},children);

export const COMPONENT_LIBRARY_VERSION=1;
export const COMPONENT_LIBRARY_OWNER='frontend/src/components/vnext/index.js';
