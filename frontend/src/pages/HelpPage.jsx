import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgDataTable, CgPageHeader, CgProvider, CgState, CgStatusChip, CgTextField } from '../components/ui/cg/CgPrimitives.jsx';

const SUPPORT_ROWS=Object.freeze([
  {id:'frontend',area:'Frontend',command:'npm run dev:frontend',note:'Vite local con runtime canónico'},
  {id:'backend',area:'Backend',command:'npm run dev:backend',note:'Express/TypeScript y persistencia configurada'},
  {id:'qa',area:'QA',command:'npm run qa:ui:58',note:'Auditoría y browser QA del catálogo vigente'},
  {id:'production',area:'Producción',command:'npm run qa:production:full',note:'Readiness no sustituye autorización de release'},
]);

function HelpWorkspace(){
  const [query,setQuery]=useState('');
  const [applied,setApplied]=useState('');
  const rows=useMemo(()=>{
    const term=applied.trim().toLowerCase();
    if(!term)return SUPPORT_ROWS;
    return SUPPORT_ROWS.filter((row)=>[row.area,row.command,row.note].some((value)=>value.toLowerCase().includes(term)));
  },[applied]);
  const submitSearch=(event)=>{event.preventDefault();setApplied(query);};
  const clearSearch=()=>{setQuery('');setApplied('');};

  return <Stack sx={{gap:2.5}} data-react-strangler-route="ayuda">
    <CgPageHeader eyebrow="Soporte" title="Ayuda y operación" description="Guía operativa sobre el runtime canónico, QA y soporte de ContaGest." />
    <Paper variant="outlined" sx={{p:2}}>
      <Stack sx={{gap:1.5}}>
        <CgState severity="info" title="Migración React/Cg activa">Esta ruta conserva URL, sesión y control de acceso del shell existente; sólo cambia su renderer.</CgState>
        <Stack component="form" role="search" onSubmit={submitSearch} direction={{xs:'column',sm:'row'}} sx={{gap:1,alignItems:{sm:'flex-start'}}}>
          <CgTextField label="Buscar ayuda" value={query} onChange={(event)=>setQuery(event.target.value)} helperText="Busca por área, comando o descripción." />
          <CgButton type="submit">Buscar</CgButton>
          {applied?<CgButton type="button" variant="outlined" onClick={clearSearch}>Limpiar</CgButton>:null}
        </Stack>
        <Box aria-live="polite"><CgStatusChip label={applied?`${rows.length} resultado(s)`:'Guía completa'} tone="success" /></Box>
      </Stack>
    </Paper>
    <Box component="section" aria-labelledby="help-operations-title">
      <Typography id="help-operations-title" component="h2" variant="h6" sx={{mb:1}}>Operación y soporte</Typography>
      <CgDataTable
        columns={[
          {key:'area',label:'Área'},
          {key:'command',label:'Comando',render:(row)=><Box component="code" sx={{fontFamily:'monospace'}}>{row.command}</Box>},
          {key:'note',label:'Nota'},
          {key:'status',label:'Estado',render:()=> <CgStatusChip label="OK" tone="success" size="small" />},
        ]}
        rows={rows}
        empty="Sin resultados"
      />
    </Box>
  </Stack>;
}

let activeRoot=null;
export const HelpPage={
  render(){return '<section class="cg-page-stack"><div id="helpReactRoot"></div></section>';},
  mount(state){
    const host=document.getElementById('helpReactRoot');
    if(!host)return;
    try{activeRoot?.unmount();}catch{}
    activeRoot=createRoot(host);
    activeRoot.render(<CgProvider state={state}><HelpWorkspace /></CgProvider>);
  }
};
