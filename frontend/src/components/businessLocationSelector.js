import { Select } from './ui/index.js';
export function BusinessLocationSelector({locations=[],value='',name='businessLocationId',label='Sede',includeInactive=false,required=false}={}){
  const eligible=(locations||[]).filter((location)=>includeInactive||location.status==='active');
  return Select({labelKey:label,name,value,required,options:[{value:'',label:'Selecciona una sede'},...eligible.map((location)=>({value:location.id,label:`${location.code} · ${location.name}`}))]});
}
