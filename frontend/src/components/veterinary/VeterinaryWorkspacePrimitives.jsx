import React from 'react';
import { Avatar, Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';

export const TABS = [
  ['resumen', 'Resumen', 'fa-chart-pie'], ['pacientes', 'Mascotas', 'fa-paw'], ['agenda', 'Agenda', 'fa-calendar-days'],
  ['historia', 'Historia clínica', 'fa-file-waveform'], ['laboratorio', 'Laboratorio', 'fa-flask-vial'], ['estudios', 'Estudios', 'fa-x-ray'],
  ['hospitalizacion', 'Hospitalización', 'fa-house-medical'], ['boarding', 'Estancia', 'fa-door-open'], ['procedimientos', 'Procedimientos', 'fa-stethoscope'], ['finanzas', 'Finanzas', 'fa-file-invoice-dollar'], ['tutor', 'Portal tutor', 'fa-user-shield'], ['comunicaciones', 'Comunicaciones', 'fa-message']
];

const STATUS_TONE = { scheduled:'info', confirmed:'success', checked_in:'warning', in_progress:'warning', completed:'success', cancelled:'default', no_show:'error', ordered:'info', processing:'warning', admitted:'error', observed:'warning', discharged:'success', critical:'error', high:'warning', low:'warning', abnormal:'warning', normal:'success', active:'success', pending:'warning', signed:'success', sent:'success', delivered:'success', failed:'error' };

export const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const Icon = ({ name, size = 14 }) => <i className={`fa-solid ${name}`} style={{ fontSize:size }} aria-hidden="true" />;
export const compactDate = (value) => value ? new Date(value).toLocaleString('es-VE', { dateStyle:'short', timeStyle:'short' }) : '—';
export const onlyDate = (value) => value ? new Date(value).toLocaleDateString('es-VE') : '—';
export const phoneDigits = (value) => String(value || '').replace(/\D/g, '');
export const displayError = (error) => error?.message || 'No se pudo completar la operación.';
export const reportVeterinaryError = (scope,error) => {
  console.error('[veterinary]', {
    scope,
    name:error?.name || 'Error',
    message:displayError(error),
    status:error?.status || error?.statusCode || null
  });
};
export const arrayData = (value) => Array.isArray(value) ? value : value?.data || [];
export const objectData = (value) => value?.data || value || {};
export const shortCode = (value) => String(value || '').replaceAll('-', '').slice(0, 8).toUpperCase();
export const localDateTime = (minutes = 0) => {
  const date = new Date(Date.now() + minutes * 60000 - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
};
export const localDateTimeFromIso = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function Metric({ icon,label,value,hint,tone='primary' }) {
  return <Card sx={{minHeight:78}}><CardContent sx={{p:'11px!important',display:'grid',gridTemplateColumns:'30px minmax(0,1fr)',gap:1,alignItems:'start'}}><Avatar variant="rounded" sx={{width:30,height:30,borderRadius:'8px',bgcolor:'action.hover',color:`${tone}.main`,border:'1px solid',borderColor:'divider',fontSize:13}}><Icon name={icon}/></Avatar><Box sx={{minWidth:0}}><Typography variant="caption" color="text.secondary" sx={{fontWeight:600}}>{label}</Typography><Typography sx={{fontWeight:700,fontSize:'1rem',lineHeight:1.12,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',overflow:'visible'}}>{value??0}</Typography>{hint&&<Typography variant="caption" color="text.secondary" noWrap>{hint}</Typography>}</Box></CardContent></Card>;
}
export function StatusChip({value}) { return <Chip label={String(value||'pendiente').replaceAll('_',' ')} color={STATUS_TONE[value]||'default'} variant={value==='normal'?'outlined':'filled'}/>; }
export function EmptyState({icon='fa-folder-open',title='Sin registros',text='Crea el primer registro para comenzar.'}) { return <Box sx={{py:2.5,px:2,textAlign:'left',color:'text.secondary'}}><Avatar variant="rounded" sx={{width:32,height:32,mb:1,borderRadius:'8px',bgcolor:'action.hover',color:'primary.main',border:'1px solid',borderColor:'divider'}}><Icon name={icon} size={14}/></Avatar><Typography variant="subtitle2" color="text.primary">{title}</Typography><Typography variant="caption">{text}</Typography></Box>; }
export function SectionCard({title,subtitle,action,children,sx={}}) { return <Card sx={sx}><CardContent sx={{p:'13px!important'}}><Stack direction="row" gap={1} sx={{justifyContent:'space-between',alignItems:'flex-start',mb:1.2,flexWrap:'wrap'}}><Box sx={{minWidth:0}}><Typography variant="h6">{title}</Typography>{subtitle&&<Typography variant="caption" color="text.secondary">{subtitle}</Typography>}</Box>{action}</Stack>{children}</CardContent></Card>; }
export function EntityLabel({primary,secondary,id}) { return <Box sx={{minWidth:0,py:.15}}><Typography component="span" sx={{display:'block',fontSize:'.8125rem',fontWeight:600,lineHeight:1.25,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{primary||'Sin nombre'}</Typography><Typography component="span" variant="caption" color="text.secondary" sx={{display:'block',letterSpacing:'.025em'}}>#{shortCode(id)}{secondary?` · ${secondary}`:''}</Typography></Box>; }
