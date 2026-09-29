import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const read=(file)=>fs.readFileSync(file,'utf8');
const root=process.cwd();

async function loadContract(){
  const file=path.join(root,'frontend/src/design-system/uxContract.v1.js');
  return import(`${pathToFileURL(file).href}?v=${Date.now()}`);
}

test('#645 canonical contract owns theme resolution and the complete UI state catalog',async()=>{
  const contract=await loadContract();
  assert.deepEqual(contract.UX_CONTRACT_V1.theme.preferences,['light','dark','system']);
  assert.equal(contract.normalizeThemePreference('DARK'),'dark');
  assert.equal(contract.normalizeThemePreference('sepia'),'light');
  assert.equal(contract.resolveThemeMode('light',true),'light');
  assert.equal(contract.resolveThemeMode('dark',false),'dark');
  assert.equal(contract.resolveThemeMode('system',false),'light');
  assert.equal(contract.resolveThemeMode('system',true),'dark');
  const states=new Set(contract.UX_CONTRACT_V1.states.catalog);
  for(const state of ['idle','loading','empty','no-results','success','warning','error','disabled','readOnly','permission-denied','offline-stale','saving-submitting','retry-recovery']) assert.equal(states.has(state),true,`missing ${state}`);
  assert.equal(contract.UX_CONTRACT_V1.notApplicable.requiresReason,true);
});

test('#645 failure taxonomy and component applicability are machine-readable',async()=>{
  const {UX_CONTRACT_V1,requiredUiStates}=await loadContract();
  for(const code of ['THEME_AUTHORITY_DUPLICATE','MISSING_UI_STATE','FOCUS_NOT_VISIBLE','FOCUS_TRAP_BROKEN','KEYBOARD_PATH_BLOCKED','ACCESSIBLE_NAME_MISSING','CONTRAST_BELOW_CONTRACT','ZOOM_REFLOW_FAILURE','REDUCED_MOTION_IGNORED','ERROR_NOT_ASSOCIATED','TOUCH_TARGET_BELOW_CONTRACT','STATE_ONLY_BY_COLOR']) assert.equal(UX_CONTRACT_V1.failureCodes.includes(code),true,`missing ${code}`);
  assert.equal(requiredUiStates('async-surface').includes('retry-recovery'),true);
  assert.equal(requiredUiStates('form').includes('saving-submitting'),true);
  assert.equal(requiredUiStates('overlay').includes('permission-denied'),false);
});

test('#645 app, Store and MUI runtime delegate to one theme resolver',()=>{
  const app=read('frontend/src/app.js');
  const store=read('frontend/src/state/store.js');
  const mui=read('frontend/src/components/muiRuntime.js');
  const cg=read('frontend/src/components/ui/cg/CgPrimitives.jsx');
  assert.match(app,/resolveThemeMode/);
  assert.match(app,/SYSTEM_THEME_QUERY/);
  assert.doesNotMatch(app,/const THEME_VALUES=/);
  assert.match(store,/normalizeThemePreference/);
  assert.doesNotMatch(store,/OFFICIAL_THEMES/);
  assert.match(mui,/resolveThemeMode/);
  assert.doesNotMatch(mui,/function systemPrefersDark\(\)/);
  assert.match(cg,/useMuiMode/);
});

test('#645 canonical vNext states and accessibility semantics are explicit',()=>{
  const states=read('frontend/src/components/vnext/states.js');
  const index=read('frontend/src/components/vnext/index.js');
  const forms=read('frontend/src/components/vnext/forms.js');
  const overlays=read('frontend/src/components/vnext/overlays.js');
  assert.match(states,/export function CgUiState/);
  for(const name of ['CgLoadingState','CgEmptyState','CgNoResultsState','CgSuccessState','CgWarningState','CgErrorState','CgPermissionState','CgOfflineState','CgSavingState','CgRetryState']) assert.match(states,new RegExp(`export const ${name}|export function ${name}`));
  assert.match(index,/from '\.\/states\.js'/);
  assert.match(forms,/describedByFor/);
  assert.doesNotMatch(forms,/aria-describedby':`\$\{id\}-helper`/);
  assert.match(overlays,/aria-labelledby/);
});

test('#645 focus-visible and reduced-motion are loaded runtime contracts',()=>{
  const theme=read('frontend/src/components/muiThemeAdapter.js');
  const css=read('frontend/public/design-system/contagest-ux-contract-v1.css');
  const html=read('frontend/index.html');
  assert.match(theme,/Mui-focusVisible/);
  assert.match(theme,/prefers-reduced-motion:\s*reduce/);
  assert.match(theme,/color\.focus/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/var\(--cg-v-focus\)/);
  assert.match(html,/contagest-ux-contract-v1\.css/);
});

test('#645 local Chromium pilot and verification integrations are present',()=>{
  const pilot=read('frontend/public/ux-contract-v645.html');
  const browser=read('scripts/ux-contract-browser-v645.mjs');
  const runner=read('scripts/run-authoritative-contracts.mjs');
  const local=read('scripts/local-verification-runner-v630.mjs');
  assert.match(pilot,/data-ux-contract-pilot="645"/);
  assert.match(pilot,/contrastRatio/);
  assert.match(pilot,/zoomProbe/);
  assert.match(browser,/chromium/);
  assert.match(browser,/BLOCKED_BROWSER_RUNTIME/);
  assert.doesNotMatch(browser,/waitForTimeout|force:\s*true|\.skip\(/);
  assert.match(runner,/tests\/theme_state_accessibility_issue_645\.test\.mjs/);
  assert.match(local,/ui-theme-state-a11y-contract/);
  assert.match(local,/ui-theme-state-a11y-browser/);
});
