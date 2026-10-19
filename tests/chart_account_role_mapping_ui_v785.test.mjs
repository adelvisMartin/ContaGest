import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ChartAccountsPage } from '../frontend/src/pages/ChartAccountsPage.js';
import { ChartAccountsService } from '../frontend/src/services/chartAccountsService.js';
import { BackendApi } from '../frontend/src/services/backendApi.js';

const service = readFileSync(new URL('../frontend/src/services/chartAccountsService.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../frontend/src/pages/ChartAccountsPage.js', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../backend/src/modules/chart-accounts/chart-accounts.routes.ts', import.meta.url), 'utf8');

test('#785 only offers truly persisted tenant accounts, never GET fallback template rows', async () => {
  const get=BackendApi.get;
  const paths=[];
  try{
    BackendApi.get=async (path)=>{paths.push(path);return [];};
    await ChartAccountsService.list();
    assert.deepEqual(paths,['/chart-accounts?persistedOnly=true']);
    assert.match(routes,/persistedOnly.*'true'/);
  }finally{BackendApi.get=get;}
});

test('#785 shows server-confirmed tenant role bindings and an editable mapping form', () => {
  const markup = ChartAccountsPage.render({ accounting: {
    chartAccountsLoaded: true,
    chartAccounts: [{ code:'1.01', name:'Cuentas por cobrar', nature:'debit', active:true, allowPosting:true }],
    roleMappingsLoaded: true,
    roleMappings: [{ role:'ar', accountCode:'1.01', nature:'debit' }]
  } });
  assert.match(markup, /id="semanticRoleForm"/);
  assert.match(markup, /name="role"/);
  assert.match(markup, /name="accountCode"/);
  assert.match(markup, /Cuentas por cobrar/);
  assert.match(markup, /1\.01/);
  assert.match(markup, /Rol contable/);
});

test('#785 renders empty/loading/error mapping states, never a template as a persisted account', () => {
  const pending = ChartAccountsPage.render({ accounting: { chartAccountsLoaded:false } });
  assert.match(pending, /Cargando vinculaciones/);
  const empty = ChartAccountsPage.render({ accounting: { chartAccountsLoaded:true, chartAccounts:[], roleMappingsLoaded:true, roleMappings:[] } });
  assert.match(empty, /Sin roles vinculados/);
  assert.doesNotMatch(empty, /value="1\.1\.01\.001"/);
  const broken = ChartAccountsPage.render({ accounting: { chartAccountsLoaded:true, chartAccounts:[], roleMappingsError:'SIN_AUTORIZACIÓN' } });
  assert.match(broken, /SIN_AUTORIZACIÓN/);
});

test('#785 role configuration is backed by the existing authorized API, without optimistic persistence', () => {
  assert.match(service, /listRoleMappings\(\).*\/chart-accounts\/role-mappings/);
  assert.match(service, /bindRoleMapping\(.*\/chart-accounts\/role-mappings/);
  assert.match(page, /ChartAccountsService\.listRoleMappings\(/);
  assert.match(page, /ChartAccountsService\.bindRoleMapping\(/);
  assert.match(page, /semanticRoleForm.*addEventListener\('submit'/s);
  assert.match(page, /setAttribute\('disabled'/);
  assert.match(page, /Toast\.show\('Vinculación contable guardada/);
});

test('#785 POST submission persists only after a confirmed response and blocks duplicate submit', async () => {
  const originalDocument=globalThis.document;
  const originalFormData=globalThis.FormData;
  const originalBind=ChartAccountsService.bindRoleMapping;
  const handlers=new Map();
  const attrs=new Set();
  const form={querySelector:()=>({
    setAttribute:(name)=>attrs.add(name),removeAttribute:(name)=>attrs.delete(name)
  })};
  const state={accounting:{
    chartAccountsLoaded:true,roleMappingsLoaded:true,roleMappings:[],
    chartAccounts:[{code:'1.01',name:'Clientes',active:true,allowPosting:true}]
  }};
  const toasts=[];
  let resolvePost;
  try{
    globalThis.document={getElementById:(id)=>id==='semanticRoleForm'
      ?{addEventListener:(type,handler)=>handlers.set(type,handler)}:null};
    globalThis.FormData=class{entries(){return [['role','ar'],['accountCode','1.01']][Symbol.iterator]();}};
    ChartAccountsService.bindRoleMapping=()=>new Promise((resolve)=>{resolvePost=resolve;});
    const Store={get:()=>state,update:(fn)=>fn(state)};
    ChartAccountsPage.mount(state,{Store,Toast:{show:(...args)=>toasts.push(args)}});
    const submitted=handlers.get('submit')({preventDefault(){},currentTarget:form});
    assert.ok(attrs.has('disabled'));
    assert.deepEqual(state.accounting.roleMappings,[],'no optimistic binding before server acknowledgment');
    assert.equal(toasts.length,0);
    resolvePost({role:'ar',accountCode:'1.01',nature:'debit'});
    await submitted;
    assert.equal(state.accounting.roleMappings[0].role,'ar');
    assert.equal(attrs.has('disabled'),false);
    assert.match(toasts[0][0],/Vinculación contable guardada/);
  }finally{
    globalThis.document=originalDocument;
    globalThis.FormData=originalFormData;
    ChartAccountsService.bindRoleMapping=originalBind;
  }
});

test('#785 rejected POST never persists a mapping or reports success', async () => {
  const originalDocument=globalThis.document;
  const originalFormData=globalThis.FormData;
  const originalBind=ChartAccountsService.bindRoleMapping;
  let submit;
  const state={accounting:{chartAccountsLoaded:true,roleMappingsLoaded:true,roleMappings:[],chartAccounts:[{code:'1.01',active:true,allowPosting:true}]}};
  const toasts=[];
  try{
    globalThis.document={getElementById:(id)=>id==='semanticRoleForm'?{addEventListener:(_type,handler)=>{submit=handler;}}:null};
    globalThis.FormData=class{entries(){return [['role','ar'],['accountCode','1.01']][Symbol.iterator]();}};
    ChartAccountsService.bindRoleMapping=async()=>{throw new Error('403: rol no autorizado');};
    ChartAccountsPage.mount(state,{Store:{get:()=>state,update:(fn)=>fn(state)},Toast:{show:(...args)=>toasts.push(args)}});
    await submit({preventDefault(){},currentTarget:{querySelector:()=>({setAttribute(){},removeAttribute(){}})}});
    assert.deepEqual(state.accounting.roleMappings,[]);
    assert.equal(toasts.length,1);
    assert.equal(toasts[0][1],'error');
    assert.match(toasts[0][0],/403/);
  }finally{
    globalThis.document=originalDocument;
    globalThis.FormData=originalFormData;
    ChartAccountsService.bindRoleMapping=originalBind;
  }
});
