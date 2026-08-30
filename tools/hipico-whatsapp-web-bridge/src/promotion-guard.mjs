import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_KILL_SWITCH_FILE='.hipico-kill-switch';

export function killSwitchPath(env=process.env,cwd=process.cwd()){
  const configured=String(env.HIPICO_KILL_SWITCH_FILE||'').trim();
  return configured?path.resolve(configured):path.resolve(cwd,DEFAULT_KILL_SWITCH_FILE);
}

export function localKillSwitchState(env=process.env,cwd=process.cwd()){
  const file=killSwitchPath(env,cwd);
  const active=fs.existsSync(file);
  return {active,file,forcedMode:active?'shadow':null};
}

export function assertLocalPromotionSafe(env=process.env,cwd=process.cwd()){
  const state=localKillSwitchState(env,cwd);
  const requested=String(env.HIPICO_OPERATION_MODE||'shadow').trim().toLowerCase();
  if(state.active && requested!=='shadow'){
    const error=new Error(`HIPICO_LOCAL_KILL_SWITCH_ACTIVE:${state.file}`);
    error.code='HIPICO_LOCAL_KILL_SWITCH_ACTIVE';
    throw error;
  }
  return {...state,requestedMode:requested==='production'||requested==='assisted'?requested:'shadow'};
}
