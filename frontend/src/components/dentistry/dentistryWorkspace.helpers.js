export const PROCEDURES=['Evaluación','Profilaxis / limpieza','Restauración','Endodoncia','Extracción','Periodoncia','Ortodoncia','Prótesis','Implante','Radiografía / estudio','Control postoperatorio'];

export const SPECIALTIES=[
  ['odontologia-general','Odontología general'],['ortodoncia','Ortodoncia'],['endodoncia','Endodoncia'],
  ['periodoncia','Periodoncia'],['cirugia-bucal','Cirugía bucal'],['protesis','Prótesis / rehabilitación']
];

export const rows=(value)=>Array.isArray(value)?value:value?.data||[];
export const patientName=(patient={})=>patient.displayName||patient.fullName||'Paciente';
