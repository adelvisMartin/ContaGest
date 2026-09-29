import React from 'react';
import * as Mui from '@mui/material';

const STATE_META=Object.freeze({
  loading:{label:'Cargando',severity:'info',role:'status'},
  empty:{label:'Sin datos',severity:'info',role:'status'},
  'no-results':{label:'Sin resultados',severity:'info',role:'status'},
  success:{label:'Operación completada',severity:'success',role:'status'},
  warning:{label:'Requiere atención',severity:'warning',role:'status'},
  error:{label:'Ocurrió un error',severity:'error',role:'alert'},
  'permission-denied':{label:'Sin permisos',severity:'warning',role:'status'},
  'offline-stale':{label:'Información sin conexión',severity:'warning',role:'status'},
  'saving-submitting':{label:'Guardando',severity:'info',role:'status'},
  'retry-recovery':{label:'No se pudo completar',severity:'error',role:'alert'}
});

export function CgUiState({kind='empty',title='',description='',action=null,compact=false}={}){
  const meta=STATE_META[kind]||STATE_META.empty;
  return React.createElement(Mui.Stack,{
    role:meta.role,
    'data-cg-ui-state':kind,
    'aria-live':meta.role==='status'?'polite':undefined,
    spacing:compact?.75:1,
    alignItems:compact?'flex-start':'center',
    justifyContent:'center',
    sx:{minHeight:compact?'auto':160,textAlign:compact?'left':'center',p:compact?1.5:3}
  },
  kind==='loading'||kind==='saving-submitting'?React.createElement(Mui.CircularProgress,{size:26,'aria-label':title||meta.label}):null,
  React.createElement(Mui.Typography,{fontWeight:700,color:meta.severity==='error'?'error.main':meta.severity==='warning'?'warning.main':meta.severity==='success'?'success.main':'text.primary'},title||meta.label),
  description?React.createElement(Mui.Typography,{color:'text.secondary',sx:{maxWidth:'52ch'}},description):null,
  action);
}

const state=(kind)=>(props)=>React.createElement(CgUiState,{...props,kind});
export const CgLoadingState=state('loading');
export const CgEmptyState=state('empty');
export const CgNoResultsState=state('no-results');
export const CgSuccessState=state('success');
export const CgWarningState=state('warning');
export const CgErrorState=state('error');
export const CgPermissionState=state('permission-denied');
export const CgOfflineState=state('offline-stale');
export const CgSavingState=state('saving-submitting');
export function CgRetryState({onRetry,retryLabel='Reintentar',action=null,...props}={}){
  const retry=action??(onRetry?React.createElement(Mui.Button,{size:'small',variant:'outlined',onClick:onRetry},retryLabel):null);
  return React.createElement(CgUiState,{...props,kind:'retry-recovery',action:retry});
}
