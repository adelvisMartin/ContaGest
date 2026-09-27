const SW_VERSION='v563';
const SHELL_CACHE=`contagest-ve-shell-${SW_VERSION}`;
const SESSION_CACHE_PREFIX='contagest-ve-session-';
const CURRENT_SESSION_CACHE_PREFIX=`${SESSION_CACHE_PREFIX}${SW_VERSION}-`;
const CACHE_FAMILY_PREFIX='contagest-ve-';
const APP_SHELL=[
  '/', '/index.html', '/manifest.webmanifest',
  '/icons/contagest-app.svg', '/icons/contagest-app-192.svg', '/icons/contagest-app-512.svg',
  '/vendor/fontawesome/css/all.min.css',
  '/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  '/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  '/vendor/fontawesome/webfonts/fa-brands-400.woff2',
  '/vendor/fontawesome/webfonts/fa-v4compatibility.woff2',
  '/vendor/fonts/fonts.css',
  '/vendor/fonts/inter/Inter-Variable.ttf',
  '/vendor/fonts/jetbrains-mono/JetBrainsMono-Variable.ttf',
  '/vertical-assets/veterinary.svg',
  '/vertical-assets/dentistry.svg',
  '/vertical-assets/psychology.svg',
  '/vertical-assets/gym.svg',
  '/vertical-assets/nutrition.svg',
  '/vertical-assets/login-security.svg'
];

let sessionContext=null;
const safePart=(value)=>String(value||'').replace(/[^A-Za-z0-9._-]/g,'_').slice(0,96);
const sessionCacheName=(ctx=sessionContext)=>ctx?.tenantId
  ? `${CURRENT_SESSION_CACHE_PREFIX}${safePart(ctx.tenantId)}-${safePart(ctx.userId||'anonymous')}`
  : null;

self.addEventListener('install',(event)=>{
  event.waitUntil(caches.open(SHELL_CACHE).then((cache)=>Promise.allSettled(
    APP_SHELL.map((url)=>cache.add(new Request(url,{cache:'reload'})))
  )));
});

self.addEventListener('activate',(event)=>{
  event.waitUntil(
    caches.keys()
      .then((keys)=>Promise.all(keys.filter((key)=>{
        if(!key.startsWith(CACHE_FAMILY_PREFIX))return false;
        if(key===SHELL_CACHE)return false;
        if(key.startsWith(SESSION_CACHE_PREFIX))return !key.startsWith(CURRENT_SESSION_CACHE_PREFIX);
        return true;
      }).map((key)=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

function isSensitiveRequest(url){
  return url.pathname.startsWith('/api/')
    || url.pathname.includes('/auth/')
    || url.pathname.includes('/licenses')
    || url.pathname.includes('/media')
    || url.pathname.includes('/admin');
}

function isPublicStaticAsset(url){
  return url.pathname==='/manifest.webmanifest'
    || url.pathname==='/pwa-install.js'
    || url.pathname.startsWith('/icons/')
    || url.pathname.startsWith('/vendor/')
    || url.pathname.startsWith('/vertical-assets/')
    || url.pathname.startsWith('/assets/');
}

function networkFirstShell(request){
  return fetch(request,{cache:'no-store'})
    .then((response)=>{
      if(response.ok&&(response.type==='basic'||response.type==='cors')){
        caches.open(SHELL_CACHE).then((cache)=>cache.put(request,response.clone())).catch(()=>undefined);
      }
      return response;
    })
    .catch(()=>caches.open(SHELL_CACHE).then((cache)=>cache.match(request)).then((cached)=>cached||new Response('Recurso no disponible sin conexión.',{status:503})));
}

self.addEventListener('fetch',(event)=>{
  const {request}=event;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||isSensitiveRequest(url))return;

  if(url.pathname==='/build-info.json'){
    event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>new Response(JSON.stringify({schemaVersion:1,product:'contagest-erp',candidateSha:'unavailable-offline',bound:false,error:'BUILD_IDENTITY_OFFLINE'}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})));
    return;
  }

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request,{cache:'no-store'})
        .then((response)=>{
          if(response.ok)caches.open(SHELL_CACHE).then((cache)=>cache.put('/index.html',response.clone())).catch(()=>undefined);
          return response;
        })
        .catch(()=>caches.open(SHELL_CACHE).then((cache)=>cache.match('/index.html')).then((cached)=>cached||new Response('ContaGest no está disponible sin conexión.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})))
    );
    return;
  }

  if(request.destination==='script'||request.destination==='style'){
    event.respondWith(networkFirstShell(request));
    return;
  }

  if(!isPublicStaticAsset(url))return;
  event.respondWith(
    caches.open(SHELL_CACHE).then((cache)=>cache.match(request).then((cached)=>{
      const refresh=fetch(request,{cache:'no-store'}).then((response)=>{
        if(response.ok&&(response.type==='basic'||response.type==='cors'))cache.put(request,response.clone()).catch(()=>undefined);
        return response;
      }).catch(()=>cached);
      return cached||refresh;
    }))
  );
});

async function deleteSessionCaches({tenantId,userId}={}){
  if(!tenantId)return;
  const marker=`-${safePart(tenantId)}-${safePart(userId||'anonymous')}`;
  const keys=await caches.keys();
  await Promise.all(keys.filter((key)=>key.startsWith(CURRENT_SESSION_CACHE_PREFIX)&&key.includes(marker)).map((key)=>caches.delete(key)));
}

async function recoverCaches(){
  const keys=await caches.keys();
  await Promise.all(keys.filter((key)=>key.startsWith(CACHE_FAMILY_PREFIX)).map((key)=>caches.delete(key)));
  const shell=await caches.open(SHELL_CACHE);
  await Promise.allSettled(APP_SHELL.map((url)=>shell.add(new Request(url,{cache:'reload'}))));
}

self.addEventListener('message',(event)=>{
  const data=event.data||{};
  if(data.type==='SKIP_WAITING'||data.type==='CG_ACTIVATE_UPDATE'){
    self.skipWaiting();
    return;
  }
  if(data.type==='CG_SESSION_CONTEXT'){
    sessionContext=data.tenantId?{version:data.version||SW_VERSION,tenantId:safePart(data.tenantId),userId:safePart(data.userId||'anonymous')}:null;
    const name=sessionCacheName();
    if(name)caches.open(name).catch(()=>undefined);
    return;
  }
  if(data.type==='CG_CLEAR_SESSION'){
    event.waitUntil(deleteSessionCaches(data).then(()=>{sessionContext=null;}));
    return;
  }
  if(data.type==='CLEAR_APP_CACHE'||data.type==='CG_RECOVER_CACHE'){
    event.waitUntil(recoverCaches());
  }
});
