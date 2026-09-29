import React from 'react';
import * as Mui from '@mui/material';
import { CgButton } from './index.js';

export function CgDialog({open=false,onClose,title='',children,actions=null,disableEscapeKeyDown=false,maxWidth='sm'}={}){return React.createElement(Mui.Dialog,{open,onClose,disableEscapeKeyDown,maxWidth,fullWidth:true},title?React.createElement(Mui.DialogTitle,null,title):null,React.createElement(Mui.DialogContent,{dividers:true},children),actions?React.createElement(Mui.DialogActions,null,actions):null);}
export function CgConfirmDialog({open=false,onClose,onConfirm,title='Confirmar',description='',confirmLabel='Confirmar',cancelLabel='Cancelar',saving=false,danger=true}={}){return React.createElement(CgDialog,{open,onClose,title,disableEscapeKeyDown:Boolean(saving),actions:React.createElement(React.Fragment,null,React.createElement(CgButton,{variant:'ghost',disabled:saving,onClick:onClose},cancelLabel),React.createElement(CgButton,{tone:danger?'danger':'brand',loading:saving,disabled:saving,onClick:onConfirm},confirmLabel))},React.createElement(Mui.Typography,null,description));}
export function CgDrawer({open=false,onClose,anchor='right',children,...props}={}){return React.createElement(Mui.Drawer,{...props,open,onClose,anchor,ModalProps:{keepMounted:true,...props.ModalProps}},children);}
export const CgPopover=(props)=>React.createElement(Mui.Popover,props);
export function CgMenu({open=false,anchorEl=null,onClose,items=[]}={}){return React.createElement(Mui.Menu,{open,anchorEl,onClose},items.map((item)=>React.createElement(Mui.MenuItem,{key:item.id??item.label,disabled:Boolean(item.disabled),onClick:(event)=>{item.onClick?.(event);onClose?.(event);}},item.label)));}
