export const FITNESS_WEEK_DAYS=Object.freeze([
  {value:1,label:'Lunes',short:'Lun'},
  {value:2,label:'Martes',short:'Mar'},
  {value:3,label:'Miércoles',short:'Mié'},
  {value:4,label:'Jueves',short:'Jue'},
  {value:5,label:'Viernes',short:'Vie'},
  {value:6,label:'Sábado',short:'Sáb'},
  {value:7,label:'Domingo',short:'Dom'}
]);

export const fitnessDayLabel=(value)=>FITNESS_WEEK_DAYS.find((day)=>day.value===Number(value))?.label||('Día '+value);
