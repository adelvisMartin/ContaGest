import React from 'react';
import * as Mui from '@mui/material';

export function CgFilterBar({children,actions=null,...props}={}){return React.createElement(Mui.Stack,{direction:'row',gap:1,alignItems:'center',flexWrap:'wrap',...props},children,actions?React.createElement(Mui.Box,{sx:{ml:'auto'}},actions):null);}
export function CgFilterChip({label,active=false,onClear,onClick,...props}={}){return React.createElement(Mui.Chip,{...props,label,color:active?'primary':'default',variant:active?'filled':'outlined',clickable:Boolean(onClick),onClick,onDelete:onClear||undefined,size:'small'});}
