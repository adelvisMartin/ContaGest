import React from 'react';
import * as Mui from '@mui/material';

export function CgDialog({open=false,onClose,title='',children,actions=null,disableEscapeKeyDown=false,maxWidth='sm',fullScreen=false,...props}={}){
  return React.createElement(Mui.Dialog,{...props,open,onClose,disableEscapeKeyDown,maxWidth,fullWidth:true,fullScreen},title?React.createElement(Mui.DialogTitle,null,title):null,React.createElement(Mui.DialogContent,{dividers:true},children),actions?React.createElement(Mui.DialogActions,null,actions):null);
}

export function CgConfirmDialog({open=false,onClose,onConfirm,title='Confirmar',description='',confirmLabel='Confirmar',cancelLabel='Cancelar',saving=false,danger=true,errorText=''}={}){
  const safeClose=saving?()=>{}:onClose;
  const actions=React.createElement(React.Fragment,null,React.createElement(Mui.Button,{variant:'text',disabled:saving,onClick:safeClose},cancelLabel),React.createElement(Mui.Button,{variant:'contained',color:danger?'error':'primary',disabled:saving,'aria-busy':saving||undefined,onClick:onConfirm},saving?'Guardando…':confirmLabel));
  return React.createElement(CgDialog,{open,onClose:safeClose,title,disableEscapeKeyDown:Boolean(saving),actions},React.createElement(Mui.Stack,{spacing:1.5},description?React.createElement(Mui.Typography,null,description):null,errorText?React.createElement(Mui.Alert,{severity:'error',role:'alert'},errorText):null));
}

export function CgDrawer({open=false,onClose,anchor='right',children,...props}={}){return React.createElement(Mui.Drawer,{...props,open,onClose,anchor,ModalProps:{keepMounted:true,...props.ModalProps}},children);}
export const CgPopover=(props)=>React.createElement(Mui.Popover,props);
export function CgMenu({open=false,anchorEl=null,onClose,items=[]}={}){return React.createElement(Mui.Menu,{open,anchorEl,onClose},items.map((item)=>React.createElement(Mui.MenuItem,{key:item.id??item.label,disabled:Boolean(item.disabled),onClick:(event)=>{item.onClick?.(event);onClose?.(event);}},item.label)));}
