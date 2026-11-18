import React,{useEffect,useRef,useState} from 'react';
import {Box,Stack,Paper,Typography} from '@mui/material';
import {CgButton,CgEmptyState,CgSelect,CgState,CgStatusChip,CgTextField} from '../ui/cg/CgPrimitives.jsx';
import {GymVerticalService} from '../../services/verticalService.js';
import {BusinessLocationsService} from '../../services/businessLocationsService.js';
import {AuthSession} from '../../services/authSession.js';
import {rows} from './gymWorkspace.helpers.js';
import {RecordList,Section} from './GymWorkspacePrimitives.jsx';

const statuses={available:'Disponible',maintenance:'Mantenimiento',out_of_service:'Fuera de servicio',retired:'Retirado',
  open:'Abierta',in_progress:'En curso',resolved:'Resuelta',cancelled:'Cancelada'};
const kinds={preventive:'Preventivo',corrective:'Correctivo',incident:'Incidente'};
const sessionScope=()=>{
  const s=AuthSession.get();
  return s?.tenantId&&s?.user?.id?s.tenantId+':'+s.user.id:'';
};
const uniqueKey=()=>{
  if(typeof globalThis.crypto?.randomUUID!=='function')
    throw new Error('Se requiere HTTPS para registrar una operación identificable.');
  return globalThis.crypto.randomUUID();
};

export function GymEquipmentPanel(){
  const [locations,setLocations]=useState([]);
  const [equipment,setEquipment]=useState([]);
  const [selectedId,setSelectedId]=useState('');
  const [orders,setOrders]=useState([]);
  const [form,setForm]=useState({locationId:'',code:'',name:'',area:''});
  const [work,setWork]=useState({kind:'preventive',title:'',description:'',scheduledAt:''});
  const [reason,setReason]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const version=useRef(0),orderVersion=useRef(0);
  const inFlight=useRef(false),pendingOrder=useRef(null),pendingTransition=useRef(null);
  const selected=equipment.find((item)=>item.id===selectedId)||null;

  async function refresh(){
    const generation=++version.current,scope=sessionScope();
    setLoading(true);setError('');
    if(!scope){
      setLocations([]);setEquipment([]);setOrders([]);setSelectedId('');setLoading(false);
      return;
    }
    try{
      const [locs,assets]=await Promise.all([
        BusinessLocationsService.list({status:'active'}),GymVerticalService.equipment()
      ]);
      if(generation!==version.current||sessionScope()!==scope)return;
      const nextLocations=rows(locs),nextEquipment=rows(assets);
      setLocations(nextLocations);setEquipment(nextEquipment);
      setForm((current)=>({...current,locationId:nextLocations.some((x)=>x.id===current.locationId)
        ?current.locationId:nextLocations[0]?.id||''}));
      setSelectedId((old)=>nextEquipment.some((x)=>x.id===old)?old:nextEquipment[0]?.id||'');
    }catch(cause){
      if(generation===version.current&&sessionScope()===scope){
        setLocations([]);setEquipment([]);setOrders([]);
        setError(cause?.message||'No se pudo verificar la disponibilidad.');
      }
    }finally{if(generation===version.current)setLoading(false);}
  }

  async function loadOrders(id){
    const generation=++orderVersion.current,scope=sessionScope();
    setOrders([]);
    if(!id||!scope)return;
    try{
      const response=await GymVerticalService.equipmentWorkOrders(id);
      if(generation===orderVersion.current&&sessionScope()===scope)setOrders(rows(response));
    }catch(cause){
      if(generation===orderVersion.current&&sessionScope()===scope)
        setError(cause?.message||'No se pudo leer el historial de mantenimiento.');
    }
  }

  useEffect(()=>{
    void refresh();
    const switchSession=()=>{
      version.current+=1;orderVersion.current+=1;
      pendingOrder.current=null;pendingTransition.current=null;
      setLocations([]);setEquipment([]);setOrders([]);setSelectedId('');
      void refresh();
    };
    window.addEventListener('cg:pwa-session-changed',switchSession);
    return()=>{
      version.current+=1;orderVersion.current+=1;
      window.removeEventListener('cg:pwa-session-changed',switchSession);
    };
  },[]);
  useEffect(()=>{void loadOrders(selectedId);return()=>{orderVersion.current+=1;};},[selectedId]);

  async function addEquipment(event){
    event.preventDefault();
    if(inFlight.current||!form.locationId)return;
    inFlight.current=true;setBusy(true);setError('');setSuccess('');
    try{
      await GymVerticalService.createEquipment(form);
      setForm((current)=>({...current,code:'',name:'',area:''}));
      await refresh();setSuccess('Equipo registrado en su sede.');
    }catch(cause){setError(cause?.message||'No se pudo crear el equipo.');}
    finally{inFlight.current=false;setBusy(false);}
  }

  async function addOrder(event){
    event.preventDefault();
    if(inFlight.current||!selected)return;
    inFlight.current=true;setBusy(true);setError('');setSuccess('');
    try{
      const data={kind:work.kind,title:work.title.trim(),description:work.description.trim()||null,
        scheduledAt:work.scheduledAt?new Date(work.scheduledAt).toISOString():null};
      const signature=JSON.stringify({equipmentId:selected.id,...data});
      if(pendingOrder.current?.signature!==signature)
        pendingOrder.current={signature,requestKey:uniqueKey()};
      await GymVerticalService.createEquipmentWorkOrder(selected.id,{
        ...data,requestKey:pendingOrder.current.requestKey
      });
      pendingOrder.current=null;
      setWork({kind:'preventive',title:'',description:'',scheduledAt:''});
      setSuccess('Orden registrada con evidencia de creación.');
      await Promise.all([refresh(),loadOrders(selected.id)]);
    }catch(cause){setError(cause?.message||'No se pudo guardar; reintenta la misma orden.');}
    finally{inFlight.current=false;setBusy(false);}
  }

  async function transition(order,toStatus){
    if(inFlight.current)return;
    const explanation=toStatus==='in_progress'?null:reason.trim();
    if(toStatus!=='in_progress'&&!explanation){setError('Indica la razón del cierre.');return;}
    inFlight.current=true;setBusy(true);setError('');setSuccess('');
    try{
      const signature=JSON.stringify({id:order.id,toStatus,explanation});
      if(pendingTransition.current?.signature!==signature)
        pendingTransition.current={signature,eventKey:uniqueKey()};
      await GymVerticalService.transitionEquipmentWorkOrder(order.id,{
        toStatus,reason:explanation,eventKey:pendingTransition.current.eventKey
      });
      pendingTransition.current=null;setReason('');
      setSuccess('La transición quedó registrada en el historial.');
      await Promise.all([refresh(),loadOrders(selectedId)]);
    }catch(cause){setError(cause?.message||'No se pudo cambiar el estado.');}
    finally{inFlight.current=false;setBusy(false);}
  }

  return <Stack gap={1.25}>
    {loading?<CgState severity="info" title="Consultando equipos">Verificando sedes y disponibilidad.</CgState>:null}
    {error?<CgState severity="error" title="No se pudo completar">{error}</CgState>:null}
    {success?<CgState severity="success" title="Operación guardada">{success}</CgState>:null}
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(2,minmax(0,1fr))'},gap:1.25}}>
      <Section title="Nuevo equipo" description="Registro operativo, independiente de activos contables e inventario.">
        {!locations.length?<CgState severity="warning" title="Falta sede activa">Configura una sede en el módulo Sedes.</CgState>:null}
        <Box component="form" onSubmit={(event)=>void addEquipment(event)}><Stack gap={.8}>
          <CgSelect label="Sede" value={form.locationId} disabled={busy||loading}
            onChange={(event)=>setForm((current)=>({...current,locationId:event.target.value}))}
            options={[{value:'',label:'Seleccionar sede'},...locations.map((x)=>({value:x.id,label:x.name}))]}/>
          <CgTextField required label="Código estable" value={form.code} disabled={busy}
            onChange={(event)=>setForm((current)=>({...current,code:event.target.value}))}/>
          <CgTextField required label="Nombre" value={form.name} disabled={busy}
            onChange={(event)=>setForm((current)=>({...current,name:event.target.value}))}/>
          <CgTextField label="Área" value={form.area} disabled={busy}
            onChange={(event)=>setForm((current)=>({...current,area:event.target.value}))}/>
          <CgButton type="submit" disabled={busy||loading||!form.locationId||!form.code.trim()||!form.name.trim()}>Registrar equipo</CgButton>
        </Stack></Box>
      </Section>
      <Section title="Disponibilidad por sede" description="Los incidentes y mantenimientos activos marcan equipos no disponibles.">
        <RecordList items={equipment} empty="No hay equipos registrados." render={(item)=>
          <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={.8} alignItems={{sm:'center'}}>
            <Box><Typography variant="body2" fontWeight={700}>{item.name}</Typography>
              <Typography variant="caption" color="text.secondary">{item.code+' · '+item.locationName+' · '+(item.area||'Sin área')}</Typography></Box>
            <Stack direction="row" alignItems="center" gap={.6}>
              <CgStatusChip label={statuses[item.availability]||item.availability}
                tone={item.availability==='available'?'success':'warning'}/>
              <Typography variant="caption">{Number(item.openOrders||0)+' órdenes'}</Typography>
            </Stack>
          </Stack>}/>
      </Section>
    </Box>
    <Section title="Órdenes de mantenimiento" description="Historial de apertura, inicio, resolución y cancelación con actor y fecha.">
      <Stack gap={.8}>
        <CgSelect label="Equipo" value={selectedId} disabled={busy||loading}
          onChange={(event)=>{pendingOrder.current=null;pendingTransition.current=null;setSelectedId(event.target.value);}}
          options={[{value:'',label:'Seleccionar equipo'},...equipment.map((item)=>({value:item.id,label:item.name+' · '+item.locationName}))]}/>
        {selected?<Box component="form" onSubmit={(event)=>void addOrder(event)}><Stack gap={.8}>
          <CgSelect label="Tipo" value={work.kind} disabled={busy}
            onChange={(event)=>setWork((current)=>({...current,kind:event.target.value}))}
            options={Object.entries(kinds).map(([value,label])=>({value,label}))}/>
          <CgTextField required label="Motivo" value={work.title} disabled={busy}
            onChange={(event)=>setWork((current)=>({...current,title:event.target.value}))}/>
          <CgTextField label="Descripción" multiline minRows={2} value={work.description} disabled={busy}
            onChange={(event)=>setWork((current)=>({...current,description:event.target.value}))}/>
          <CgTextField label="Programado para (opcional)" type="datetime-local" slotProps={{inputLabel:{shrink:true}}}
            value={work.scheduledAt} disabled={busy}
            onChange={(event)=>setWork((current)=>({...current,scheduledAt:event.target.value}))}/>
          <CgButton type="submit" disabled={busy||!work.title.trim()}>Crear orden</CgButton>
        </Stack></Box>:<CgEmptyState title="Selecciona equipo" description="Consulta y registra órdenes aquí."/>}
        {orders.some((o)=>o.status==='open'||o.status==='in_progress')?
          <CgTextField label="Razón del cierre o cancelación" multiline minRows={2} fullWidth
            value={reason} disabled={busy} onChange={(event)=>setReason(event.target.value)}/>:null}
        <RecordList items={orders} empty="No hay órdenes registradas." render={(item)=>
          <Paper variant="outlined" sx={{p:1}}>
            <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" gap={1}>
              <Box><Typography variant="body2" fontWeight={700}>{item.title}</Typography>
                <Typography variant="caption" color="text.secondary">{(kinds[item.kind]||item.kind)+' · '+new Date(item.openedAt).toLocaleString('es-VE')}</Typography></Box>
              <CgStatusChip label={statuses[item.status]||item.status} tone={item.status==='resolved'?'success':'info'}/>
            </Stack>
            <Stack direction="row" flexWrap="wrap" gap={.7} mt={1}>
              {item.status==='open'?<CgButton size="small" variant="outlined" disabled={busy} onClick={()=>void transition(item,'in_progress')}>Iniciar</CgButton>:null}
              {item.status==='in_progress'?<CgButton size="small" disabled={busy||!reason.trim()} onClick={()=>void transition(item,'resolved')}>Resolver</CgButton>:null}
              {['open','in_progress'].includes(item.status)?<CgButton size="small" variant="outlined" color="warning" disabled={busy||!reason.trim()} onClick={()=>void transition(item,'cancelled')}>Cancelar</CgButton>:null}
            </Stack>
            <Typography component="p" variant="caption" color="text.secondary" mt={1}>Historial de eventos</Typography>
            {(Array.isArray(item.events)?item.events:[]).map((entry)=>
              <Typography key={entry.id} component="p" variant="caption" color="text.secondary">
                {new Date(entry.createdAt).toLocaleString('es-VE')+' · '+(statuses[entry.toStatus]||entry.toStatus)+(entry.reason?' · '+entry.reason:'')}
              </Typography>)}
          </Paper>}/>
      </Stack>
    </Section>
  </Stack>;
}
