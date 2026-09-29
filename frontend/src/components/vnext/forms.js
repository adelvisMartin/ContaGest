import React from 'react';
import * as Mui from '@mui/material';
import { CgTextField } from './index.js';
import { normalizeDateValue, normalizeTimeValue, serializeDateRange } from './formContracts.js';

const optionValue=(option)=>String(option?.value??option??'');
const optionLabel=(option)=>String(option?.label??option?.value??option??'');
const fieldIds=(id='cg-field')=>({helperId:`${id}-helper`,errorId:`${id}-error`});

export function CgFormField({id='cg-field',label,helperText='',errorText='',required=false,children}={}){
  const {helperId,errorId}=fieldIds(id);
  const describedBy=[helperText&&helperId,errorText&&errorId].filter(Boolean).join(' ')||undefined;
  return React.createElement(Mui.FormControl,{fullWidth:true,error:Boolean(errorText),required},label?React.createElement(Mui.FormLabel,{htmlFor:id},label):null,typeof children==='function'?children({'aria-describedby':describedBy,id}):children,helperText?React.createElement(Mui.FormHelperText,{id:helperId},helperText):null,errorText?React.createElement(Mui.FormHelperText,{id:errorId},errorText):null);
}

export function CgSelect({id='cg-select',label='',value='',onChange,options=[],loading=false,disabled=false,readOnly=false,helperText='',errorText='',required=false,emptyLabel='Sin opciones',...props}={}){
  const {helperId,errorId}=fieldIds(id);
  const describedBy=[helperText&&helperId,errorText&&errorId].filter(Boolean).join(' ')||undefined;
  return React.createElement(Mui.FormControl,{fullWidth:true,size:'small',error:Boolean(errorText),disabled:disabled||loading,required},label?React.createElement(Mui.InputLabel,{id:`${id}-label`},label):null,React.createElement(Mui.Select,{...props,id,labelId:label?`${id}-label`:undefined,label:label||undefined,value:String(value??''),onChange:(event)=>onChange?.(String(event.target.value),event),inputProps:{'aria-label':label||props['aria-label']||'Seleccione','aria-describedby':describedBy,readOnly:Boolean(readOnly)},MenuProps:{PaperProps:{sx:{mt:.5,maxHeight:340,borderRadius:2}}}},loading?React.createElement(Mui.MenuItem,{disabled:true,value:''},'Cargando…'):options.length?options.map((option)=>React.createElement(Mui.MenuItem,{key:optionValue(option),value:optionValue(option)},optionLabel(option))):React.createElement(Mui.MenuItem,{disabled:true,value:''},emptyLabel)),helperText?React.createElement(Mui.FormHelperText,{id:helperId},helperText):null,errorText?React.createElement(Mui.FormHelperText,{id:errorId},errorText):null);
}

export function CgAutocomplete({id='cg-autocomplete',label='',value=null,onChange,options=[],loading=false,disabled=false,helperText='',errorText='',freeSolo=false,...props}={}){
  const selected=options.find((option)=>optionValue(option)===String(value??''))??(freeSolo&&value!=null?String(value):null);
  return React.createElement(Mui.Autocomplete,{...props,id,options,loading,disabled,freeSolo,value:selected,getOptionLabel:optionLabel,isOptionEqualToValue:(a,b)=>optionValue(a)===optionValue(b),onChange:(event,next)=>onChange?.(next==null?'':optionValue(next),event),renderInput:(params)=>React.createElement(CgTextField,{...params,label,error:Boolean(errorText),helperText:errorText||helperText,'aria-describedby':`${id}-helper`})});
}

export function CgCombobox(props={}){return React.createElement(CgAutocomplete,{...props,freeSolo:true});}
export function CgCheckbox({label,checked=false,onChange,...props}={}){return React.createElement(Mui.FormControlLabel,{label,control:React.createElement(Mui.Checkbox,{...props,checked:Boolean(checked),onChange:(event)=>onChange?.(event.target.checked,event)})});}
export function CgSwitch({label,checked=false,onChange,...props}={}){return React.createElement(Mui.FormControlLabel,{label,control:React.createElement(Mui.Switch,{...props,checked:Boolean(checked),onChange:(event)=>onChange?.(event.target.checked,event)})});}
export function CgRadioGroup({label='',value='',onChange,options=[],name,...props}={}){return React.createElement(Mui.FormControl,null,label?React.createElement(Mui.FormLabel,null,label):null,React.createElement(Mui.RadioGroup,{...props,name,value:String(value??''),onChange:(event)=>onChange?.(String(event.target.value),event)},options.map((option)=>React.createElement(Mui.FormControlLabel,{key:optionValue(option),value:optionValue(option),label:optionLabel(option),control:React.createElement(Mui.Radio)}))));}

export function CgDatePicker({value='',onChange,...props}={}){return React.createElement(CgTextField,{...props,type:'date',value:normalizeDateValue(value),slotProps:{inputLabel:{shrink:true},...(props.slotProps||{})},onChange:(event)=>onChange?.(normalizeDateValue(event.target.value),event)});}
export function CgTimeField({value='',onChange,...props}={}){return React.createElement(CgTextField,{...props,type:'time',value:normalizeTimeValue(value),slotProps:{inputLabel:{shrink:true},...(props.slotProps||{})},onChange:(event)=>onChange?.(normalizeTimeValue(event.target.value),event)});}
export function CgDateRange({value={from:'',to:''},onChange,fromLabel='Desde',toLabel='Hasta',...props}={}){const current=serializeDateRange(value);return React.createElement(Mui.Stack,{direction:{xs:'column',sm:'row'},spacing:1,...props},React.createElement(CgDatePicker,{label:fromLabel,value:current.from,onChange:(from)=>onChange?.({...current,from})}),React.createElement(CgDatePicker,{label:toLabel,value:current.to,onChange:(to)=>onChange?.({...current,to})}));}
