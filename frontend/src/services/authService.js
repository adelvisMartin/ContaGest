import { installLoginEnhancer } from './loginEnhancer.js';
import { installSessionAccessGuard } from './sessionAccessGuard.js';
import { installMultiTenantEnhancer } from './multiTenantEnhancer.js';
import { installLegalAcceptanceEnhancer } from './legalAcceptanceEnhancer.js';
import { AuthSession } from './authSession.js';
import { BackendApi } from './backendApi.js';
import { LicenseService } from './licenseService.js';

installLoginEnhancer();
installSessionAccessGuard();
installMultiTenantEnhancer();
installLegalAcceptanceEnhancer();

const DEMO_USER={id:'demo-admin',name:'Administrador Local',fullName:'Administrador Local',email:'admin@erp.local',role:'admin',permissions:['*']};
const demoModeEnabled=()=>import.meta?.env?.DEV===true&&import.meta?.env?.VITE_ENABLE_DEMO_MODE==='true';
function normalizeSession(payload){
  const tenantId=payload?.tenantId||payload?.tenant?.id;
  if(!tenantId)throw new Error('El backend no devolvió una sesión con empresa activa.');
  const audience=payload?.license||payload?.user?.role==='client'?'client':'staff';
  return AuthSession.set({
    ...payload,
    tenantId,
    tenant:payload.tenant||null,
    user:payload.user||null,
    license:payload.license||null,
    experienceProfile:payload.experienceProfile||null,
    accessibleTenants:Array.isArray(payload.accessibleTenants)?payload.accessibleTenants:[],
    audience,
    sessionMode:payload.sessionMode||'cookie',
    mode:payload.sessionMode||'cookie'
  });
}
function captchaExpiryMillis(value){
  const numeric=Number(value);
  if(Number.isFinite(numeric)&&numeric>0)return numeric;
  return new Date(value).getTime();
}
export const AuthService={
  getSession(){return AuthSession.get();},isAuthenticated(){return AuthSession.isAuthenticated();},isDemoEnabled(){return demoModeEnabled();},
  async captcha(){
    const captcha=await BackendApi.request('/auth/captcha',{noAuth:true});
    const expiresAt=captchaExpiryMillis(captcha?.expiresAt);
    if(!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new Error('La verificación recibida ya expiró. Genera un nuevo reto.');
    if(typeof window!=='undefined'&&captcha?.token){
      window.dispatchEvent(new CustomEvent('cg:captcha-challenge',{detail:{expiresAt}}));
    }
    return captcha;
  },
  async login({email,password,tenantRif='00000000',captchaToken='',captchaAnswer='',licenseKey='',deviceId='',deviceLabel='',accessMode,mode='api'}){
    if(mode==='demo'){
      if(!demoModeEnabled())throw new Error('El modo demo local está deshabilitado en esta compilación.');
      if(!email||!password)throw new Error('Ingresa email y contraseña.');
      return AuthSession.set({sessionMode:'demo',user:{...DEMO_USER,email},tenantId:'demo-tenant',tenant:{id:'demo-tenant',name:'Demo local',rif:'00000000',plan:'development'},experienceProfile:{schemaVersion:1,mode:'admin',label:'Modo Administrador',description:'Experiencia local de desarrollo.',landingRoute:'dashboard',landingLabel:'Dashboard',quickRoutes:['dashboard','ventas','inventario','contabilidad','reportes']},audience:'staff',expiresAt:Date.now()+1000*60*60*8,mode:'demo'});
    }
    const payload=await BackendApi.request('/auth/login',{method:'POST',noAuth:true,body:{
      email,password,tenantRif,captchaToken,captchaAnswer,
      ...(accessMode?{accessMode}:{}),
      ...(licenseKey?{licenseKey}:{}),
      deviceId:deviceId||LicenseService.deviceId(),
      deviceLabel:deviceLabel||LicenseService.deviceLabel()
    }});
    if(payload?.mfaRequired)return payload;
    return normalizeSession(payload);
  },
  async completeCoordinateLogin(challengeId,answers){return normalizeSession(await BackendApi.request('/auth/login/coordinates',{method:'POST',noAuth:true,body:{challengeId,answers}}));},
  coordinateStatus(){return BackendApi.get('/auth/coordinates/status');},enrollCoordinateCard(){return BackendApi.post('/api/v1/auth/coordinates/enroll',{});},revokeCoordinateCard(){return BackendApi.post('/api/v1/auth/coordinates/revoke',{});},
  async register({tenantRif,tenantName,legalName,fullName,email,password,captchaToken='',captchaAnswer=''}){return normalizeSession(await BackendApi.request('/auth/register',{method:'POST',noAuth:true,body:{tenantRif,tenantName,legalName,fullName,email,password,captchaToken,captchaAnswer}}));},
  async me(){return normalizeSession(await BackendApi.request('/auth/me'));},
  async refresh(){return normalizeSession(await BackendApi.request('/auth/refresh',{method:'POST',skipRefresh:true}));},
  async tenants(){return BackendApi.request('/auth/tenants');},
  async switchTenant(tenantId){return normalizeSession(await BackendApi.request('/auth/switch-tenant',{method:'POST',body:{tenantId}}));},
  async logout(){
    AuthSession.clear();
    try{await BackendApi.request('/auth/logout',{method:'POST',body:{},skipRefresh:true});}catch{/* HttpOnly cookies expire server-side; local metadata is already cleared. */}
  },
  authHeaders(){return {};}
};
