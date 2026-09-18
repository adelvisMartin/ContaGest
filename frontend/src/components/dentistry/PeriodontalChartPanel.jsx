import React, { useMemo, useState } from 'react';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { CgButton, CgDataTable, CgEmptyState, CgSelect, CgState, CgStatusChip, CgTextField } from '../ui/cg/CgPrimitives.jsx';
import { PERMANENT_TEETH, PERIODONTAL_SITES, PRIMARY_TEETH } from './dentalCatalog.js';

const emptySites=()=>PERIODONTAL_SITES.map(({value})=>({
  site:value,
  probingDepthMm:0,
  gingivalMarginMm:0,
  bleeding:false,
  suppuration:false,
  plaque:false
}));

const summarize=(periodontogram={})=>{
  const sites=Array.isArray(periodontogram.sites)?periodontogram.sites:[];
  const probing=sites.map((site)=>Number(site.probingDepthMm||0));
  const attachment=sites.map((site)=>Number(site.probingDepthMm||0)+Number(site.gingivalMarginMm||0));
  return {
    maxProbingDepth:probing.length?Math.max(...probing):0,
    maxAttachmentLevel:attachment.length?Math.max(...attachment):0,
    bleedingSites:sites.filter((site)=>site.bleeding).length,
    plaqueSites:sites.filter((site)=>site.plaque).length
  };
};

const deltaLabel=(current,previous,key,unit='')=>{
  if(!previous)return 'Sin comparación previa';
  const delta=Number(current[key]||0)-Number(previous[key]||0);
  if(delta===0)return 'Sin cambio';
  return `${delta>0?'+':''}${delta}${unit}`;
};

export function PeriodontalChartPanel({
  selectedPatientId,
  onPatientChange,
  patientOptions,
  professionalOptions,
  encounters,
  onCreate
}){
  const [professionalId,setProfessionalId]=useState('');
  const [dentition,setDentition]=useState('permanent');
  const [tooth,setTooth]=useState('');
  const [mobilityGrade,setMobilityGrade]=useState('0');
  const [furcationGrade,setFurcationGrade]=useState('0');
  const [notes,setNotes]=useState('');
  const [sites,setSites]=useState(emptySites);
  const [saving,setSaving]=useState(false);
  const teeth=dentition==='primary'?PRIMARY_TEETH:PERMANENT_TEETH;

  const charts=useMemo(()=>encounters
    .filter((item)=>item.type==='periodontal-chart'&&item.clinicalData?.periodontogram)
    .sort((left,right)=>new Date(right.createdAt||right.signedAt||0)-new Date(left.createdAt||left.signedAt||0)),[encounters]);

  const historyRows=useMemo(()=>charts.map((item,index)=>{
    const periodontogram=item.clinicalData.periodontogram;
    const summary=summarize(periodontogram);
    const previousSameTooth=charts.slice(index+1).find((candidate)=>{
      const candidateChart=candidate.clinicalData?.periodontogram;
      return candidateChart?.dentition===periodontogram.dentition&&candidateChart?.tooth===periodontogram.tooth;
    });
    const previousSummary=previousSameTooth?summarize(previousSameTooth.clinicalData.periodontogram):null;
    return {item,periodontogram,summary,previousSameTooth,previousSummary};
  }),[charts]);

  function updateSite(siteName,patch){
    setSites((current)=>current.map((site)=>site.site===siteName?{...site,...patch}:site));
  }

  function resetMeasurements(){
    setTooth('');
    setMobilityGrade('0');
    setFurcationGrade('0');
    setNotes('');
    setSites(emptySites());
  }

  async function submit(event){
    event.preventDefault();
    if(!selectedPatientId||!tooth)return;
    setSaving(true);
    try{
      const created=await onCreate?.({
        professionalId:professionalId||null,
        dentition,
        tooth,
        mobilityGrade:Number(mobilityGrade),
        furcationGrade:Number(furcationGrade),
        sites:sites.map((site)=>({
          ...site,
          probingDepthMm:Number(site.probingDepthMm),
          gingivalMarginMm:Number(site.gingivalMarginMm)
        })),
        notes:notes.trim()
      });
      if(created!==false)resetMeasurements();
    }finally{setSaving(false);}
  }

  const siteColumns=[
    {key:'site',label:'Sitio',render:(row)=>PERIODONTAL_SITES.find((site)=>site.value===row.site)?.label||row.site},
    {key:'probing',label:'Sondaje (mm)',render:(row)=><CgTextField size="small" type="number" value={row.probingDepthMm} inputProps={{min:0,max:15,step:1,'aria-label':`Sondaje ${row.site}`}} onChange={(e)=>updateSite(row.site,{probingDepthMm:e.target.value})} sx={{minWidth:105}}/>},
    {key:'margin',label:'Margen gingival (mm)',render:(row)=><CgTextField size="small" type="number" value={row.gingivalMarginMm} inputProps={{min:-10,max:20,step:1,'aria-label':`Margen gingival ${row.site}`}} onChange={(e)=>updateSite(row.site,{gingivalMarginMm:e.target.value})} sx={{minWidth:120}}/>},
    {key:'bleeding',label:'Sangrado',render:(row)=><CgButton type="button" size="small" variant={row.bleeding?'contained':'outlined'} aria-pressed={row.bleeding} onClick={()=>updateSite(row.site,{bleeding:!row.bleeding})} sx={{minHeight:44}}>BOP</CgButton>},
    {key:'suppuration',label:'Supuración',render:(row)=><CgButton type="button" size="small" variant={row.suppuration?'contained':'outlined'} aria-pressed={row.suppuration} onClick={()=>updateSite(row.site,{suppuration:!row.suppuration})} sx={{minHeight:44}}>SUP</CgButton>},
    {key:'plaque',label:'Placa',render:(row)=><CgButton type="button" size="small" variant={row.plaque?'contained':'outlined'} aria-pressed={row.plaque} onClick={()=>updateSite(row.site,{plaque:!row.plaque})} sx={{minHeight:44}}>PLQ</CgButton>}
  ];

  const historyColumns=[
    {key:'date',label:'Fecha',render:(row)=>new Date(row.item.createdAt||row.item.signedAt).toLocaleDateString('es-VE')},
    {key:'tooth',label:'Pieza',render:(row)=><Stack direction="row" gap={.5} alignItems="center"><Typography variant="body2" fontWeight={700}>{row.periodontogram.tooth}</Typography><CgStatusChip size="small" label={row.periodontogram.dentition==='primary'?'Temporal':'Permanente'} tone="default"/></Stack>},
    {key:'probing',label:'Máx. sondaje',render:(row)=><Box><Typography variant="body2">{row.summary.maxProbingDepth} mm</Typography><Typography variant="caption" color="text.secondary">{deltaLabel(row.summary,row.previousSummary,'maxProbingDepth',' mm')}</Typography></Box>},
    {key:'attachment',label:'Máx. nivel inserción',render:(row)=><Box><Typography variant="body2">{row.summary.maxAttachmentLevel} mm</Typography><Typography variant="caption" color="text.secondary">{deltaLabel(row.summary,row.previousSummary,'maxAttachmentLevel',' mm')}</Typography></Box>},
    {key:'bleeding',label:'BOP',render:(row)=><Box><Typography variant="body2">{row.summary.bleedingSites}/6</Typography><Typography variant="caption" color="text.secondary">{deltaLabel(row.summary,row.previousSummary,'bleedingSites')}</Typography></Box>},
    {key:'plaque',label:'Placa',render:(row)=><Box><Typography variant="body2">{row.summary.plaqueSites}/6</Typography><Typography variant="caption" color="text.secondary">{deltaLabel(row.summary,row.previousSummary,'plaqueSites')}</Typography></Box>},
    {key:'grades',label:'Movilidad / Furca',render:(row)=>`${row.periodontogram.mobilityGrade||0} / ${row.periodontogram.furcationGrade||0}`}
  ];

  return <Paper variant="outlined" sx={{p:1.5,minWidth:0}}>
    <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" gap={1}>
      <Box><Typography variant="h6">Periodontograma estructurado</Typography><Typography variant="caption" color="text.secondary">Seis sitios por pieza con evolución longitudinal; cada registro se conserva como encuentro firmado.</Typography></Box>
      <CgStatusChip label={tooth?`Pieza ${tooth}`:'Sin pieza'} tone={tooth?'primary':'default'}/>
    </Stack>
    <Divider sx={{my:1.2}}/>
    <CgState severity="info" title="Medición periodontal">Margen gingival positivo indica recesión; negativo indica margen coronal a la referencia. Los deltas muestran cambio frente al registro previo de la misma pieza.</CgState>

    <Box component="form" onSubmit={submit} sx={{mt:1.25}}>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(3,minmax(0,1fr))'},gap:1}}>
        <CgSelect label="Paciente" value={selectedPatientId} onChange={(e)=>onPatientChange?.(e.target.value)} options={patientOptions}/>
        <CgSelect label="Profesional" value={professionalId} onChange={(e)=>setProfessionalId(e.target.value)} options={professionalOptions}/>
        <CgSelect label="Dentición" value={dentition} onChange={(e)=>{setDentition(e.target.value);setTooth('');}} options={[{value:'permanent',label:'Permanente'},{value:'primary',label:'Temporal'}]}/>
        <CgSelect label="Pieza" value={tooth} onChange={(e)=>setTooth(e.target.value)} options={[{value:'',label:'Seleccionar pieza'},...teeth.map((value)=>({value,label:value}))]}/>
        <CgSelect label="Movilidad" value={mobilityGrade} onChange={(e)=>setMobilityGrade(e.target.value)} options={[0,1,2,3].map((value)=>({value:String(value),label:`Grado ${value}`}))}/>
        <CgSelect label="Furcación" value={furcationGrade} onChange={(e)=>setFurcationGrade(e.target.value)} options={[0,1,2,3].map((value)=>({value:String(value),label:`Grado ${value}`}))}/>
      </Box>

      <Box sx={{mt:1.2,maxWidth:'100%',overflowX:'auto'}}><CgDataTable columns={siteColumns} rows={sites} empty="Sin sitios periodontales"/></Box>
      <CgTextField fullWidth multiline minRows={2} label="Notas periodontales" value={notes} onChange={(e)=>setNotes(e.target.value)} sx={{mt:1}}/>
      <CgButton type="submit" disabled={!selectedPatientId||!tooth||saving} sx={{mt:1}}>{saving?'Guardando…':'Registrar periodontograma'}</CgButton>
    </Box>

    <Divider sx={{my:1.5}}/>
    <Typography variant="h6">Evolución periodontal</Typography>
    <Typography variant="caption" color="text.secondary">Comparación cuantitativa con el registro anterior de la misma pieza.</Typography>
    <Box sx={{mt:1,maxWidth:'100%',overflowX:'auto'}}>
      {historyRows.length?<CgDataTable columns={historyColumns} rows={historyRows.slice(0,40)} empty="Sin evolución periodontal"/>:<CgEmptyState title="Sin periodontogramas registrados" description="Registra la primera medición para iniciar la línea de evolución."/>}
    </Box>
  </Paper>;
}
