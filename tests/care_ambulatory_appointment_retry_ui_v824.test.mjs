import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../frontend/src/pages/HealthcarePage.js',import.meta.url),'utf8');
const begin=page.indexOf('    const handle = (id,service,transform=');
const end=page.indexOf("    handle('carePatientForm'",begin);
assert.ok(begin>=0&&end>begin,'HealthcarePage generic submit handler must exist');
const handlerSource=page.slice(begin,end);

test('#824 appointment UI retains request key after network loss, rotates after edit, clears on success',async()=>{
  const posted=[];
  const notices=[];
  let failures=true,next=0,reloads=0,submitHandler;
  const button={setAttribute(){},removeAttribute(){}};
  const form={
    values:{patientId:'patient',room:'Exam 1',startsAt:'2026-12-12T10:00'},
    dataset:{},
    reportValidity(){return true;},
    querySelector(){return button;},
    addEventListener(event,callback){assert.equal(event,'submit');submitHandler=callback;},
    reset(){this.values={};}
  };
  class FormEntries {
    constructor(target){this.target=target;}
    [Symbol.iterator](){return Object.entries(this.target.values)[Symbol.iterator]();}
  }
  const crypto={randomUUID(){return 'req-'+(++next);}};
  const doc={getElementById(id){return id==='careAppointmentForm'?form:null;}};
  const toast={show(message,type){notices.push({message,type});}};
  const load=async()=>{reloads++;};
  const register=new Function('document','crypto','FormData','Toast','load',
    handlerSource+'\nreturn handle;')(doc,crypto,FormEntries,toast,load);
  const service=async payload=>{
    posted.push({...payload});
    if(failures)throw new Error('network unavailable');
  };
  register('careAppointmentForm',service,
    (data,target)=>({...data,status:'scheduled',channel:'onsite',requestKey:target.dataset.careRequestKey}),
    'Cita agendada.',{idempotent:true});

  const submit=()=>submitHandler({currentTarget:form,preventDefault(){}});
  await submit();
  assert.equal(notices.at(-1).type,'error');
  assert.equal(reloads,0);
  assert.equal(posted[0].requestKey,'req-1');
  assert.equal(form.dataset.careRequestKey,'req-1');

  await submit();
  assert.equal(posted[1].requestKey,posted[0].requestKey,'identical retry must keep same request key');
  form.values.room='Exam 2';
  await submit();
  assert.equal(posted[2].requestKey,'req-2','changed payload must start a new operation');
  assert.equal(form.dataset.careRequestSignature,JSON.stringify(form.values));

  failures=false;
  await submit();
  assert.equal(posted[3].requestKey,posted[2].requestKey);
  assert.equal(form.dataset.careRequestKey,undefined);
  assert.equal(form.dataset.careRequestSignature,undefined);
  assert.equal(notices.at(-1).type,'success');
  assert.equal(reloads,1);
  assert.deepEqual(form.values,{});
});

test('#824 care appointment uses the idempotent submit option; other Care forms remain unchanged',()=>{
  assert.match(page,/handle\('careAppointmentForm',HealthVerticalService\.createAppointment,\(data,form\)=>\(\{\.\.\.data,status:'scheduled',channel:'onsite',requestKey:form\.dataset\.careRequestKey\}\),'Cita agendada\.',\{idempotent:true\}\)/);
  assert.match(page,/handle\('carePatientForm',HealthVerticalService\.createPatient,/);
  assert.match(page,/handle\('careProfessionalForm',HealthVerticalService\.createProfessional,/);
  assert.match(page,/handle\('careMeasurementForm',HealthVerticalService\.createMeasurement,/);
});
