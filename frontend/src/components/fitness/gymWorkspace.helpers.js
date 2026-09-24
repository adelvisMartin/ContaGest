export const rows=(value)=>Array.isArray(value)?value:value?.data||[];
export const object=(value)=>value?.data||value||{};
export const localDate=(days=0)=>{const date=new Date(Date.now()+days*86400000-new Date().getTimezoneOffset()*60000);return date.toISOString().slice(0,10);};
export const localDateTime=(minutes=0)=>{const date=new Date(Date.now()+minutes*60000-new Date().getTimezoneOffset()*60000);return date.toISOString().slice(0,16);};
export const amount=(value,currency='USD')=>`${currency} ${Number(value||0).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const memberOptions=(members,empty='Seleccionar cliente')=>[{value:'',label:empty},...members.map((item)=>({value:item.id,label:item.fullName||item.memberCode||'Cliente'}))];
export const trainerOptions=(trainers)=>[{value:'',label:'Sin asignar'},...trainers.map((item)=>({value:item.id,label:item.fullName||'Instructor'}))];
export const planOptions=(plans)=>[{value:'',label:'Seleccionar plan'},...plans.map((item)=>({value:item.id,label:`${item.name} · ${amount(item.price,item.currency)}`}))];

export const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
