import assert from 'node:assert/strict';
import test from 'node:test';
import { generateParticipantStatementText, shortDate, __test__ } from '../frontend/public/hipico-control/assets/js/format.js';

function workspace(){
  return{
    config:{
      activeGroupId:'g1',
      groups:[{id:'g1',currency:'Bs.',exchangeRate:160,footerMessage:''}]
    },
    participants:[],
    races:[]
  };
}

test('date-only formatter rejects impossible and malformed calendar values instead of normalizing them',()=>{
  assert.equal(__test__.dateOnly('2026-02-29'),null,'2026 is not leap year');
  assert.equal(__test__.dateOnly('2026-02-31'),null,'February 31 must never normalize into March');
  assert.equal(__test__.dateOnly('2026-13-01'),null);
  assert.equal(__test__.dateOnly('not-a-date'),null);
  assert.equal(__test__.dateOnly(''),null);
  assert.ok(__test__.dateOnly('2024-02-29') instanceof Date,'valid leap day must remain valid');
  assert.equal(shortDate('2026-02-31'),'Sin fecha');
  assert.equal(__test__.whatsappDate('2026-02-31'),'fecha no disponible');
});

test('missing persisted timestamps never become the current date',()=>{
  assert.equal(__test__.registeredDate(''),'sin fecha');
  assert.equal(__test__.registeredDate(null),'sin fecha');
  assert.equal(__test__.registeredDate('invalid'),'sin fecha');
});

test('participant statement with missing date makes missing evidence explicit instead of inventing today',()=>{
  const text=generateParticipantStatementText(workspace(),{
    groupId:'g1',
    participant:{code:'P1',groupId:'g1'},
    dailyRows:[],tracks:[],aval:0,pozo:0,weekTotal:0,dayTotal:0
  });
  assert.match(text,/saldo del día fecha no disponible/);
});

test('product fallback identity is Control Hípico while configured group identity remains data-driven',()=>{
  const fallback=__test__.groupProfile({config:{activeGroupId:'g1',groups:[]}}, {groupId:'g1'});
  assert.equal(fallback.companyName,'CONTROL HÍPICO');

  const configured=__test__.groupProfile({
    config:{activeGroupId:'g1',groups:[{id:'g1',companyName:'Grupo Fuente',currency:'Bs.'}]}
  }, {groupId:'g1'});
  assert.equal(configured.companyName,'Grupo Fuente');
});