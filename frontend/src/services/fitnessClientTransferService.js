const escapeCell=(value)=>`"${String(value??'').replaceAll('"','""')}"`;
const headers=['memberCode','fullName','email','phone','birthDate','sex','goals','medicalNotes'];
export const FitnessClientTransferService={
  template(){return '\uFEFF'+[headers.join(','),'GYM-001,Cliente Ejemplo,cliente@correo.com,+584120000000,1990-08-15,Masculino,"Pérdida de grasa;masa muscular",'].join('\n');},
  export(members=[]){return '\uFEFF'+[headers.join(','),...members.map((member)=>[member.memberCode,member.fullName,member.email,member.phone,member.birthDate,member.sex,(member.goals||[]).join(';'),member.medicalNotes].map(escapeCell).join(','))].join('\n');},
  parse(text=''){
    const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).filter((line)=>line.trim());if(lines.length<2)return[];
    const parseLine=(line)=>{const out=[];let value='',quoted=false;for(let index=0;index<line.length;index+=1){const char=line[index];if(char==='"'){if(quoted&&line[index+1]==='"'){value+='"';index+=1;}else quoted=!quoted;}else if(char===','&&!quoted){out.push(value);value='';}else value+=char;}out.push(value);return out;};
    const columns=parseLine(lines[0]).map((value)=>value.trim());return lines.slice(1).map((line)=>{const values=parseLine(line),row=Object.fromEntries(columns.map((key,index)=>[key,String(values[index]??'').trim()]));return{memberCode:row.memberCode,fullName:row.fullName,email:row.email||'',phone:row.phone||'',birthDate:row.birthDate||null,sex:row.sex||'',goals:String(row.goals||'').split(';').map((value)=>value.trim()).filter(Boolean),medicalNotes:row.medicalNotes||''};}).filter((row)=>row.memberCode&&row.fullName);
  },
  download(filename,content){const blob=new Blob([content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
};
