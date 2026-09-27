import { test, expect } from '@playwright/test';

// #563 browser gate: no sleeps, no force, no skip/only. All async transitions use observable state.
const TENANT_A='00000000-0000-4000-8000-000000000563';
const TENANT_B='00000000-0000-4000-8000-000000000564';
const USER_A='user-a-v563';
const USER_B='user-b-v563';

async function cacheKeys(page){
  return page.evaluate(()=>caches.keys());
}

test('PWA isolates tenant caches/outbox across tenant switch and logout', async ({ page }) => {
  await page.route('http://localhost:3030/api/v1/auth/switch-tenant', async (route) => {
    const body=route.request().postDataJSON();
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ok:true,data:{
        tenantId:body.tenantId,
        tenant:{id:body.tenantId,name:'Tenant B'},
        user:{id:USER_B,email:'b@example.invalid',role:'admin'},
        sessionMode:'cookie',
        sessionExpiresAt:new Date(Date.now()+3_600_000).toISOString()
      }})
    });
  });
  await page.route('http://localhost:3030/api/v1/auth/logout', async (route) => {
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{loggedOut:true}})});
  });

  await page.goto('/');
  await expect.poll(()=>page.evaluate(async()=>Boolean((await navigator.serviceWorker.getRegistration('/'))?.active))).toBe(true);

  await page.evaluate(async ({tenantA,userA,tenantB,userB}) => {
    const session={tenantId:tenantA,user:{id:userA},sessionMode:'cookie',expiresAt:Date.now()+3_600_000};
    localStorage.setItem('contagest_auth_session',JSON.stringify(session));
    const policy=await import('/src/services/pwaOfflinePolicy.js');
    await policy.setPwaSessionContext(session);
    await policy.enqueueOfflineOperation(session,{operation:'tasks.note.update',payload:{note:'tenant-a-local'},idempotencyKey:'idem-v563-tenant-a'});
    await policy.enqueueOfflineOperation(session,{operation:'tasks.note.update',payload:{note:'tenant-a-retry'},idempotencyKey:'idem-v563-tenant-a'});
    await caches.open(policy.cacheNamespace(session)).then((cache)=>cache.put('/tenant-a-artifact',new Response('A')));
    await caches.open(policy.cacheNamespace({tenantId:tenantB,user:{id:userB}})).then((cache)=>cache.put('/tenant-b-artifact',new Response('B')));
  },{tenantA:TENANT_A,userA:USER_A,tenantB:TENANT_B,userB:USER_B});

  const outboxBefore=await page.evaluate(async ({tenantA,userA})=>{
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('contagest-offline-v563',1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result;
        const tx=db.transaction('outbox','readonly');
        const get=tx.objectStore('outbox').index('sessionKey').getAll(`${tenantA}:${userA}`);
        get.onsuccess=()=>{resolve(get.result);db.close();};
        get.onerror=()=>reject(get.error);
      };
    });
  },{tenantA:TENANT_A,userA:USER_A});
  expect(outboxBefore).toHaveLength(1);
  expect(outboxBefore[0].idempotencyKey).toBe('idem-v563-tenant-a');

  await page.evaluate(async (tenantB)=>{
    const {AuthService}=await import('/src/services/authService.js');
    await AuthService.switchTenant(tenantB);
  },TENANT_B);

  await expect.poll(()=>cacheKeys(page)).not.toContain(`contagest-ve-session-v563-${TENANT_A}-${USER_A}`);
  expect(await cacheKeys(page)).toContain(`contagest-ve-session-v563-${TENANT_B}-${USER_B}`);
  const remainingA=await page.evaluate(async ({tenantA,userA})=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('contagest-offline-v563',1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result;
      const tx=db.transaction('outbox','readonly');
      const count=tx.objectStore('outbox').index('sessionKey').count(`${tenantA}:${userA}`);
      count.onsuccess=()=>{resolve(count.result);db.close();};
      count.onerror=()=>reject(count.error);
    };
  }),{tenantA:TENANT_A,userA:USER_A});
  expect(remainingA).toBe(0);

  await page.evaluate(async()=>{
    const {AuthService}=await import('/src/services/authService.js');
    await AuthService.logout();
  });
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('contagest_auth_session'))).toBeNull();
  await expect.poll(()=>cacheKeys(page)).not.toContain(`contagest-ve-session-v563-${TENANT_B}-${USER_B}`);
});

test('PWA exposes stale state offline, recovers on reconnect, and repairs IndexedDB/cache schema', async ({ page, context }) => {
  await page.goto('/');
  await expect.poll(()=>page.evaluate(async()=>Boolean((await navigator.serviceWorker.getRegistration('/'))?.active))).toBe(true);

  await context.setOffline(true);
  await expect(page.locator('#cg-offline-status')).toBeVisible();
  await expect(page.locator('#cg-offline-status')).toContainText('desactualizados');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.offlineFreshness)).toBe('stale');

  await context.setOffline(false);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.offlineFreshness)).toBe('fresh');
  await expect(page.locator('#cg-offline-status')).toBeHidden();

  const recovery=await page.evaluate(async()=>{
    await new Promise((resolve,reject)=>{
      const request=indexedDB.deleteDatabase('contagest-offline-v563');
      request.onsuccess=request.onerror=()=>resolve();
      request.onblocked=()=>reject(new Error('unexpected blocked IndexedDB delete'));
    });
    await new Promise((resolve,reject)=>{
      const request=indexedDB.open('contagest-offline-v563',99);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{request.result.close();resolve();};
    });
    await caches.open('contagest-ve-shell-corrupt-v0').then((cache)=>cache.put('/corrupt',new Response('old')));
    const policy=await import('/src/services/pwaOfflinePolicy.js');
    const indexedDb=await policy.recoverServiceWorkerCaches();
    return indexedDb;
  });
  expect(recovery.recovered).toBe(true);

  await expect.poll(()=>cacheKeys(page)).not.toContain('contagest-ve-shell-corrupt-v0');
  await expect.poll(()=>cacheKeys(page)).toContain('contagest-ve-shell-v563');
});

test('PWA service worker preserves deep-link shell fallback and explicit update activation contract', async ({ page }) => {
  await page.goto('/?route=dashboard');
  const contract=await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.getRegistration('/');
    const policy=await import('/src/services/pwaOfflinePolicy.js');
    return {
      hasRegistration:Boolean(registration?.active),
      path:location.pathname,
      query:location.search,
      updateActivationType:typeof policy.activatePwaUpdate
    };
  });
  expect(contract.hasRegistration).toBe(true);
  expect(contract.path).toBe('/');
  expect(contract.query).toContain('route=dashboard');
  expect(contract.updateActivationType).toBe('function');
});
