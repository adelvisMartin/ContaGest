const VERSION='1.0.0';
const CACHE=`control-hipico-shell-v${VERSION}`;
const RUNTIME=`control-hipico-runtime-v${VERSION}`;
const SHELL=[
  '/hipico-control/',
  '/hipico-control/index.html',
  '/hipico-control/manifest.webmanifest',
  '/hipico-control/assets/css/precision-hipica.css',
  '/hipico-control/assets/js/app-shell.js',
  '/hipico-control/assets/js/operations.js',
  '/hipico-control/assets/js/whatsapp.js',
  '/hipico-control/assets/js/agent-router.js',
  '/hipico-control/assets/brand/control-hipico-mark.svg',
  '/hipico-control/assets/brand/icon-192.svg',
  '/hipico-control/assets/brand/icon-512.svg',
  '/hipico-control/assets/brand/maskable-192.svg',
  '/hipico-control/assets/brand/maskable-512.svg'
];

self.addEventListener('install',(event)=>{
  event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',(event)=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter((key)=>key.startsWith('control-hipico-')&&![CACHE,RUNTIME].includes(key)).map((key)=>caches.delete(key)));
    await self.clients.claim();
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    clients.forEach((client)=>client.postMessage({type:'CONTROL_HIPICO_UPDATED',version:VERSION}));
  })());
});

const isNavigation=(request)=>request.mode==='navigate';
const isAsset=(url)=>/\.(?:css|js|svg|png|jpg|jpeg|webp|woff2?)$/i.test(url.pathname);
const isSensitive=(url)=>/\/(?:api|auth|session|license|webhook)(?:\/|$)/i.test(url.pathname);

async function networkFirst(request){
  const cache=await caches.open(RUNTIME);
  try{const response=await fetch(request);if(response.ok&&!isSensitive(new URL(request.url)))cache.put(request,response.clone());return response;}
  catch(error){const cached=await cache.match(request);if(cached)return cached;if(isNavigation(request))return caches.match('/hipico-control/index.html');throw error;}
}
async function staleWhileRevalidate(request){
  const cache=await caches.open(RUNTIME);const cached=await cache.match(request);
  const network=fetch(request).then((response)=>{if(response.ok)cache.put(request,response.clone());return response;}).catch(()=>null);
  return cached||network||new Response('',{status:504,statusText:'Offline'});
}

self.addEventListener('fetch',(event)=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  if(isSensitive(url)){event.respondWith(fetch(request));return;}
  if(isNavigation(request)){event.respondWith(networkFirst(request));return;}
  if(isAsset(url)){event.respondWith(staleWhileRevalidate(request));return;}
  event.respondWith(networkFirst(request));
});

self.addEventListener('message',(event)=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
  if(event.data?.type==='GET_VERSION')event.source?.postMessage?.({type:'CONTROL_HIPICO_VERSION',version:VERSION});
});
