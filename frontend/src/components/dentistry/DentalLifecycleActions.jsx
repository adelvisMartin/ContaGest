import React, { useState } from 'react';
import { Stack, Typography } from '@mui/material';
import { CgButton, CgDialog, CgState, CgStatusChip } from '../ui/cg/CgPrimitives.jsx';

const statusMeta=(status)=>({
  draft:{label:'Borrador',tone:'warning'},
  review:{label:'En revisión',tone:'primary'},
  signed:{label:'Firmado',tone:'success'},
  amended:{label:'Enmendado',tone:'default'},
  cancelled:{label:'Cancelado',tone:'error'}
}[status]||{label:status||'Borrador',tone:'warning'});

export function DentalLifecycleActions({encounter,onTransition,onAmend}){
  const [pendingAction,setPendingAction]=useState(null);
  const [busy,setBusy]=useState(false);
  const status=String(encounter?.status||'draft');
  const meta=statusMeta(status);

  const requestReview=()=>setPendingAction('submit-review');
  const requestSign=()=>setPendingAction('sign');

  async function confirm(){
    if(!pendingAction||busy)return;
    setBusy(true);
    try{
      const result=await onTransition?.(encounter.id,{action:pendingAction});
      if(result!==false)setPendingAction(null);
    }finally{setBusy(false);}
  }

  return <Stack direction="row" gap={.6} alignItems="center" flexWrap="wrap">
    <CgStatusChip label={meta.label} tone={meta.tone}/>
    {status==='draft'?<CgButton size="small" variant="outlined" onClick={requestReview}>Enviar a revisión</CgButton>:null}
    {status==='review'?<CgButton size="small" onClick={requestSign}>Firmar versión</CgButton>:null}
    {status==='signed'?<CgButton size="small" variant="outlined" onClick={()=>onAmend?.(encounter)}>Enmendar</CgButton>:null}

    <CgDialog
      open={Boolean(pendingAction)}
      title={pendingAction==='sign'?'Firmar versión clínica':'Enviar a revisión'}
      onClose={()=>{if(!busy)setPendingAction(null);}}
      confirmLabel={busy?'Procesando…':pendingAction==='sign'?'Firmar versión':'Enviar a revisión'}
      onConfirm={()=>void confirm()}
    >
      <Stack gap={1} pt={1}>
        {pendingAction==='sign'
          ? <CgState severity="warning" title="Firma clínica inmutable">Al firmar, esta versión queda como autoridad clínica. Las correcciones posteriores deberán realizarse mediante una enmienda versionada.</CgState>
          : <CgState severity="info" title="Revisión clínica">El borrador pasará a En revisión. Sólo una versión en revisión puede firmarse.</CgState>}
        <Typography variant="caption" color="text.secondary">El actor y las fechas se registran en el servidor.</Typography>
      </Stack>
    </CgDialog>
  </Stack>;
}
