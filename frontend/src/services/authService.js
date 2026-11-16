import { installLoginEnhancer } from './loginEnhancer.js';
import { installSessionAccessGuard } from './sessionAccessGuard.js';
import { installMultiTenantEnhancer } from './multiTenantEnhancer.js';
import { installLegalAcceptanceEnhancer } from './legalAcceptanceEnhancer.js';
import { AuthSession } from './authSession.js';
import { BackendApi } from './backendApi.js';
import { LicenseService } from './licenseService.js';
import { Store } from '../state/store.js';
import { purgeOfflineSession, setServiceWorkerSession } from './pwaOfflineService.js';

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
  const session=AuthSession.set({
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
  Store.switchSessionScope(session);
  setServiceWorkerSession(session);
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('cg:pwa-session-changed'));
  return session;
}
function captchaExpiryMillis(value){const numeric=Number(value);if(Number.isFinite(numeric)&&numeric>0)return numeric;return new Date(value).getTime();}
export const AuthService={
  getSession(){return AuthSession.get();},isAuthenticated(){return AuthSession.isAuthenticated();},isDemoEnabled(){return demoModeEnabled();},
  async captcha(){
    const captcha=await BackendApi.request('/auth/captcha',{noAuth:true});
    const expiresAt=captchaExpiryMillis(captcha?.expiresAt);
    if(!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new Error('La verificación recibida ya expiró. Genera un nuevo reto.');
    if(typeof window!=='undefined'&&captcha?.token)window.dispatchEvent(new CustomEvent('cg:captcha-challenge',{detail:{expiresAt}}));
    return captcha;
  },
  async login({email,password,tenantRif='00000000',captchaToken='',captchaAnswer='',licenseKey='',deviceId='',deviceLabel='',accessMode,mode='api'}){
    if(mode==='demo'){
      if(!demoModeEnabled())throw new Error('El modo demo local está deshabilitado en esta compilación.');
      if(!email||!password)throw new Error('Ingresa email y contraseña.');
      return normalizeSession({sessionMode:'demo',user:{...DEMO_USER,email},tenantId:'demo-tenant',tenant:{id:'demo-tenant',name:'Demo local',rif:'00000000',plan:'development'},experienceProfile:{schemaVersion:1,mode:'admin',label:'Modo Administrador',description:'Experiencia local de desarrollo.',landingRoute:'dashboard',landingLabel:'Dashboard',quickRoutes:['dashboard','ventas','inventario','contabilidad','reportes']},audience:'staff',expiresAt:Date.now()+1000*60*60*8,mode:'demo'});
    }
    const payload=await BackendApi.request('/auth/login',{method:'POST',noAuth:true,body:{email,password,tenantRif,captchaToken,captchaAnswer,...(accessMode?{accessMode}:{}),...(licenseKey?{licenseKey}:{}),deviceId:deviceId||LicenseService.deviceId(),deviceLabel:deviceLabel||LicenseService.deviceLabel()}});
    if(payload?.mfaRequired)return payload;
    return normalizeSession(payload);
  },
  async completeCoordinateLogin(challengeId,answers){return normalizeSession(await BackendApi.request('/auth/login/coordinates',{method:'POST',noAuth:true,body:{challengeId,answers}}));},
  coordinateStatus(){return BackendApi.get('/auth/coordinates/status');},enrollCoordinateCard(){return BackendApi.post('/api/v1/auth/coordinates/enroll',{});},revokeCoordinateCard(){return BackendApi.post('/api/v1/auth/coordinates/revoke',{});},
  async register({tenantRif,tenantName,legalName,fullName,email,password,captchaToken='',captchaAnswer=''}){return normalizeSession(await BackendApi.request('/auth/register',{method:'POST',noAuth:true,body:{tenantRif,tenantName,legalName,fullName,email,password,captchaToken,captchaAnswer}}));},
  async me(){return normalizeSession(await BackendApi.request('/auth/me'));},
  async refresh(){return normalizeSession(await BackendApi.request('/auth/refresh',{method:'POST',skipRefresh:true}));},
  async tenants(){return BackendApi.request('/auth/tenants');},
  async switchTenant(tenantId){
    const previous=AuthSession.get();
    const payload=await BackendApi.request('/auth/switch-tenant',{method:'POST',body:{tenantId}});
    const nextTenantId=payload?.tenantId||payload?.tenant?.id;
    if(!nextTenantId)throw new Error('El backend no devolvió una sesión con empresa activa.');
    if(previous&&previous.tenantId!==nextTenantId){
      // Purge the old synchronous storage before the new tenant is hydrated.
      // Await only the asynchronous cache/IndexedDB cleanup after installing B.
      Store.purgeSessionScope(previous);
      const purge=purgeOfflineSession(previous).then(()=>null,error=>error);
      const next=normalizeSession(payload);
      const purgeError=await purge;
      if(purgeError)throw purgeError;
      return next;
    }
    return normalizeSession(payload);
  },
  async logout(){
    const previous=AuthSession.get();
    AuthSession.clear();
    if(previous)Store.purgeSessionScope(previous);else Store.reset();
    // Start local purge immediately, without producing an unhandled rejection
    // while the remote revoke is in flight.
    const purge=previous?purgeOfflineSession(previous).then(()=>null,error=>error):Promise.resolve(null);
    let remoteRevoked=true;
    try{await BackendApi.request('/auth/logout',{method:'POST',body:{},skipRefresh:true});}
    catch{remoteRevoked=false;}
    const purgeError=await purge;
    if(purgeError)throw purgeError;
    if(!remoteRevoked){
      const error=new Error('La sesión local se cerró, pero no se confirmó la revocación en el servidor.');
      error.code='AUTH_REMOTE_LOGOUT_UNCONFIRMED';
      throw error;
    }
  },
  authHeaders(){return {};}
};
