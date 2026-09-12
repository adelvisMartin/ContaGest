import test from 'node:test';
import assert from 'node:assert/strict';
import { SAFE_GROUP_COLOR, assertSafeGroupColor, assertWorkspaceInputSafety } from '../frontend/public/hipico-control/assets/js/workspace-input-safety.js';

function workspace(color='#721522',legacy=false){
  const group={id:'group-1',name:'Grupo principal',companyName:'CONTROL HÍPICO',color};
  return{
    config:{
      groups:legacy?[]:[group],
      whatsappGroups:legacy?[group]:[],
      activeGroupId:'group-1',activeWhatsappGroupId:'group-1',activeRaceByGroup:{'group-1':null},captureGroupIds:['group-1']
    },
    participants:[],days:[],races:[],advancedBets:[],movements:[],exchangeRates:[],weekClosures:[],pollas:[],audit:[],syncQueue:[],activeRaceId:null
  };
}

test('group accents are restricted to six-digit hex before workspace data can render',()=>{
  assert.equal(SAFE_GROUP_COLOR.test('#721522'),true);
  assert.doesNotThrow(()=>assertSafeGroupColor('#7EA596'));
  for(const unsafe of [
    'red;background-image:url(https://evil.test/x)',
    '#fff" style="background:red',
    'var(--token)',
    'url(javascript:alert(1))',
    '#12345',
    '#12345678'
  ]){
    assert.throws(()=>assertSafeGroupColor(unsafe),error=>error?.code==='HIPICO_WORKSPACE_UNSAFE_GROUP_COLOR');
    assert.throws(()=>assertWorkspaceInputSafety(workspace(unsafe)),error=>error?.code==='HIPICO_WORKSPACE_UNSAFE_GROUP_COLOR');
  }
});

test('legacy whatsappGroups receive the same color boundary as canonical groups',()=>{
  assert.doesNotThrow(()=>assertWorkspaceInputSafety(workspace('#721522',true)));
  assert.throws(()=>assertWorkspaceInputSafety(workspace('red;position:fixed',true)),error=>
    error?.code==='HIPICO_WORKSPACE_UNSAFE_GROUP_COLOR' && String(error?.path).includes('config.whatsappGroups[0].color')
  );
});
