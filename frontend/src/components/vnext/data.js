import React from 'react';
import * as Mui from '@mui/material';
import { normalizePageQuery } from './dataContracts.js';
import { CgNoResultsState, CgRetryState as CanonicalRetryState } from './states.js';

const cellValue=(row,column)=>typeof column?.render==='function'?column.render(row):row?.[column?.field??column?.key];
const alignFor=(column)=>column?.numeric||column?.align==='right'?'right':column?.align||'left';

export function CgSkeleton({rows=5,columns=4,ariaLabel='Cargando datos'}={}){
  return React.createElement(Mui.Stack,{spacing:1,'aria-label':ariaLabel,role:'status','aria-busy':true},Array.from({length:rows},(_,row)=>React.createElement(Mui.Stack,{key:row,direction:'row',spacing:1},Array.from({length:columns},(_,column)=>React.createElement(Mui.Skeleton,{key:column,variant:'rounded',height:32,sx:{flex:1}})))));
}

export function CgInlineError({message='No se pudieron cargar los datos.',correlationId='',action=null}={}){
  return React.createElement(Mui.Alert,{severity:'error',role:'alert',action},React.createElement(Mui.Stack,{spacing:.25},React.createElement('span',null,message),correlationId?React.createElement(Mui.Typography,{variant:'caption',component:'span'},`Referencia: ${correlationId}`):null));
}

export function CgRetryState({message='No se pudieron cargar los datos.',onRetry,retryLabel='Reintentar',correlationId=''}={}){
  const description=correlationId?`${message} · Referencia: ${correlationId}`:message;
  return React.createElement(CanonicalRetryState,{title:'No se pudo completar',description,onRetry,retryLabel,compact:true});
}

export function CgNoResults({title='Sin resultados',description='Prueba con otros filtros o términos de búsqueda.',action=null}={}){
  return React.createElement(CgNoResultsState,{title,description,action});
}

export function CgPagination({page=1,pageSize=25,total=0,onChange,disabled=false,pageSizeOptions=[10,25,50,100]}={}){
  const normalized=normalizePageQuery({page,pageSize});
  return React.createElement(Mui.TablePagination,{component:'div',count:Number.isFinite(Number(total))?Number(total):0,page:normalized.page-1,rowsPerPage:normalized.pageSize,rowsPerPageOptions:pageSizeOptions,disabled,onPageChange:(_event,nextPage)=>onChange?.({mode:'page',page:nextPage+1,pageSize:normalized.pageSize}),onRowsPerPageChange:(event)=>onChange?.({mode:'page',page:1,pageSize:Number(event.target.value)}),labelRowsPerPage:'Filas por página',labelDisplayedRows:({from,to,count})=>`${from}–${to} de ${count===-1?`más de ${to}`:count}`});
}

export function CgTable({columns=[],rows=[],caption='',loading=false,error=null,noResults=false,emptyTitle='Sin datos',emptyDescription='',rowKey='id',onRowClick=null,stickyHeader=true,size='small'}={}){
  if(loading)return React.createElement(CgSkeleton,{rows:Math.min(6,Math.max(3,rows.length||5)),columns:Math.max(1,columns.length)});
  if(error)return React.createElement(CgInlineError,{message:error.message||String(error),correlationId:error.correlationId||''});
  if(!rows.length)return noResults?React.createElement(CgNoResults,null):React.createElement(CgNoResultsState,{title:emptyTitle,description:emptyDescription});
  return React.createElement(Mui.TableContainer,{component:Mui.Paper,variant:'outlined',sx:{maxWidth:'100%',overflowX:'auto'}},
    React.createElement(Mui.Table,{stickyHeader,size,'aria-label':caption||'Tabla de datos'},
      caption?React.createElement('caption',{style:{position:'absolute',width:1,height:1,padding:0,margin:-1,overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap',border:0}},caption):null,
      React.createElement(Mui.TableHead,null,React.createElement(Mui.TableRow,null,columns.map((column)=>React.createElement(Mui.TableCell,{key:column.field??column.key,scope:'col',align:alignFor(column),sortDirection:column.sortDirection||false},column.label??column.field??column.key)))),
      React.createElement(Mui.TableBody,null,rows.map((row,index)=>React.createElement(Mui.TableRow,{hover:Boolean(onRowClick),tabIndex:onRowClick?0:undefined,key:String(row?.[rowKey]??index),onClick:onRowClick?()=>onRowClick(row):undefined,onKeyDown:onRowClick?(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onRowClick(row);}}:undefined,sx:onRowClick?{cursor:'pointer'}:undefined},columns.map((column)=>React.createElement(Mui.TableCell,{key:column.field??column.key,align:alignFor(column)},cellValue(row,column))))))));
}

export function CgDataGrid({columns=[],rows=[],queryState={},onQueryChange,total=0,loading=false,error=null,noResults=false,rowKey='id'}={}){
  const pagination=queryState.pagination?.mode==='page'?normalizePageQuery(queryState.pagination):normalizePageQuery();
  return React.createElement(Mui.Stack,{spacing:1.5,className:'cg-data-grid'},React.createElement(CgTable,{columns,rows,loading,error,noResults,rowKey}),React.createElement(CgPagination,{page:pagination.page,pageSize:pagination.pageSize,total,onChange:(next)=>onQueryChange?.({...queryState,pagination:next}),disabled:loading}));
}

export function CgKpi({label,value='—',hint='',tone='neutral'}={}){
  const color={success:'success.main',warning:'warning.main',danger:'error.main',brand:'primary.main'}[tone]||'text.primary';
  return React.createElement(Mui.Paper,{variant:'outlined',sx:{p:2,minWidth:0}},React.createElement(Mui.Typography,{variant:'caption',color:'text.secondary'},label),React.createElement(Mui.Typography,{variant:'h5',fontWeight:800,color},value),hint?React.createElement(Mui.Typography,{variant:'caption',color:'text.secondary'},hint):null);
}
export function CgMetricGrid({items=[]}={}){return React.createElement(Mui.Box,{sx:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:1.5}},items.map((item,index)=>React.createElement(CgKpi,{key:item.key??item.label??index,...item})));}
export function CgStatusSummary({items=[]}={}){return React.createElement(Mui.Stack,{direction:'row',spacing:1,flexWrap:'wrap',useFlexGap:true},items.map((item,index)=>React.createElement(Mui.Chip,{key:item.key??item.label??index,label:`${item.label}: ${item.value}`,color:item.color||'default',size:'small'})));}

export function CgSearchField({value='',onChange,placeholder='Buscar…',label='Buscar',debounceMs=0,disabled=false}={}){
  const [draft,setDraft]=React.useState(String(value??''));
  React.useEffect(()=>setDraft(String(value??'')),[value]);
  React.useEffect(()=>{if(!debounceMs)return undefined;const id=setTimeout(()=>onChange?.(draft),debounceMs);return()=>clearTimeout(id);},[draft,debounceMs,onChange]);
  return React.createElement(Mui.TextField,{size:'small',value:draft,disabled,placeholder,label,onChange:(event)=>{const next=event.target.value;setDraft(next);if(!debounceMs)onChange?.(next);},inputProps:{type:'search'}});
}

export function CgToolbar({title='',search=null,actions=null,children=null}={}){
  return React.createElement(Mui.Stack,{direction:{xs:'column',sm:'row'},spacing:1,alignItems:{xs:'stretch',sm:'center'},justifyContent:'space-between',sx:{minWidth:0}},React.createElement(Mui.Stack,{direction:{xs:'column',sm:'row'},spacing:1,alignItems:{xs:'stretch',sm:'center'},sx:{minWidth:0}},title?React.createElement(Mui.Typography,{fontWeight:700},title):null,search),React.createElement(Mui.Stack,{direction:'row',spacing:1,flexWrap:'wrap',useFlexGap:true},actions,children));
}
export const CgCommandBar=CgToolbar;

export function CgDetailList({items=[]}={}){return React.createElement(Mui.Box,{component:'dl',sx:{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'minmax(140px,220px) 1fr'},gap:1,m:0}},items.flatMap((item,index)=>[React.createElement(Mui.Typography,{component:'dt',key:`k-${item.key??index}`,color:'text.secondary'},item.label),React.createElement(Mui.Typography,{component:'dd',key:`v-${item.key??index}`,sx:{m:0,overflowWrap:'anywhere'}},item.value??'—')]));}
