import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3030;
const dataDir = path.resolve('data');
const collections = ['clients','inventory','history','taxes','ledger','banking','payroll','suppliers','purchases','sales','tasks','profile','admin','brand','analytics','foodOrders','notificationLog','demoAccess','licenses'];
const moduleRegistry = JSON.parse(await readFile(new URL('./data/module_registry.json', import.meta.url), 'utf8').catch(() => '[]'));
const moduleSlugs = new Set(moduleRegistry.map((v)=>v.slug));
async function ensure(name){ await mkdir(dataDir,{recursive:true}); const file=path.join(dataDir,`${name}.json`); if(!existsSync(file)) await writeFile(file,'[]'); return file; }
async function read(name){ const file=await ensure(name); return JSON.parse(await readFile(file,'utf8')||'[]'); }
async function write(name,data){ const file=await ensure(name); await writeFile(file,JSON.stringify(data,null,2)); }
function send(res,status,data){ res.writeHead(status,{ 'content-type':'application/json', 'access-control-allow-origin':'*', 'access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers':'content-type,x-tenant-id,authorization' }); res.end(JSON.stringify(data)); }
http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS') return send(res,200,{});
  const url=new URL(req.url,`http://localhost:${PORT}`);
  if(url.pathname==='/api/v1/health') return send(res,200,{ok:true,mode:'mock'});
  if(url.pathname==='/api/v1/currency/bcv') return send(res,200,{ok:true,data:{rate:Number(process.env.MOCK_BCV_RATE||36.25),source:'Mock BCV · contingencia local',updatedAt:new Date().toISOString(),provider:'mock',stale:false}});
  if(url.pathname==='/api/v1/currency/bcv/providers') return send(res,200,{ok:true,data:[{source:'Mock BCV',url:'local'}]});


  if(url.pathname==='/api/v1/exports/xlsx' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      const payload=body?JSON.parse(body):{};
      const content='ContaGest-VE MOCK XLSX\n'+JSON.stringify(payload,null,2);
      res.writeHead(200,{ 'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition':`attachment; filename="${payload.filename||'export'}.xlsx"`, 'access-control-allow-origin':'*' });
      res.end(content);
    });
    return;
  }
  if(url.pathname==='/api/v1/exports/fiscal-pdf' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      const payload=body?JSON.parse(body):{}; const hash=crypto.createHash('sha256').update(body).digest('hex');
      const content=`ContaGest-VE MOCK PDF\nHash: ${hash}\n${JSON.stringify(payload,null,2)}`;
      res.writeHead(200,{ 'content-type':'application/pdf', 'content-disposition':`attachment; filename="${payload.filename||'documento'}.pdf"`, 'x-contagest-document-hash':hash, 'access-control-allow-origin':'*' });
      res.end(content);
    });
    return;
  }


  if(url.pathname==='/api/v1/analytics/events' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',async()=>{
      const payload=body?JSON.parse(body):{}; const arr=await read('analytics');
      const events=(payload.events||[]).map(e=>({id:crypto.randomUUID(),createdAt:new Date().toISOString(),...e}));
      await write('analytics',[...events,...arr].slice(0,2000));
      return send(res,200,{ok:true,data:{inserted:events.length}});
    });
    return;
  }
  if(url.pathname==='/api/v1/analytics/summary'){
    const arr=await read('analytics');
    const byRoute=Object.entries(arr.reduce((m,e)=>{m[e.route||'unknown']=(m[e.route||'unknown']||0)+1;return m;},{})).map(([route,count])=>({route,_count:count}));
    return send(res,200,{ok:true,data:{total:arr.length,sessions:new Set(arr.map(e=>e.sessionId)).size,byRoute}});
  }


  if(url.pathname==='/api/v1/licenses' && req.method==='GET'){
    const arr=await read('licenses'); return send(res,200,{ok:true,data:arr});
  }
  if(url.pathname==='/api/v1/licenses' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',async()=>{ const payload=body?JSON.parse(body):{}; const arr=await read('licenses'); const lic={id:payload.id||crypto.randomUUID(),createdAt:new Date().toISOString(),status:'active',...payload}; await write('licenses',[lic,...arr]); return send(res,201,{ok:true,data:lic}); }); return;
  }
  if(url.pathname==='/api/v1/licenses/heartbeat' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ const payload=body?JSON.parse(body):{}; return send(res,200,{ok:true,data:{accepted:true,at:new Date().toISOString(),route:payload.route}}); }); return;
  }
  if(url.pathname==='/api/v1/imports/preview' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ const payload=body?JSON.parse(body):{}; const rows=(payload.rows||[]).map((row,i)=>({index:i+1,ok:Object.keys(row).length>0,row})); return send(res,200,{ok:true,data:{type:payload.type,rows,accepted:rows.filter(r=>r.ok).length,rejected:0}}); }); return;
  }
  if(url.pathname==='/api/v1/regulatory/feeds'){
    return send(res,200,{ok:true,data:[{key:'ifrs-taxonomy-2025',name:'IFRS Accounting Taxonomy 2025',kind:'NIIF/XBRL',status:'reference',url:'https://www.ifrs.org/issued-standards/ifrs-taxonomy/ifrs-accounting-taxonomy-2025/'},{key:'fccpv-biblioteca',name:'Biblioteca FCCPV',kind:'Venezuela',status:'watch',url:'https://biblioteca.fccpv.org/'}]});
  }
  if(url.pathname==='/api/v1/regulatory/ifrs-taxonomy/import' && req.method==='POST'){
    return send(res,200,{ok:true,data:{queued:true,message:'Importación NIIF/XBRL simulada'}});
  }
  if(url.pathname==='/api/v1/rules'){
    return send(res,200,{ok:true,data:{orders:{reserveOn:'accepted'},inventory:{kardex:'immutable'},accounting:{doubleEntry:true},payroll:{parameterVersioning:true}}});
  }

  if(url.pathname==='/api/v1/food/orders' && req.method==='GET'){
    const arr=await read('foodOrders');
    return send(res,200,{ok:true,data:arr});
  }

  if(url.pathname==='/api/v1/licenses' && req.method==='GET'){
    const arr=await read('licenses'); return send(res,200,{ok:true,data:arr});
  }
  if(url.pathname==='/api/v1/licenses' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',async()=>{ const payload=body?JSON.parse(body):{}; const arr=await read('licenses'); const lic={id:payload.id||crypto.randomUUID(),createdAt:new Date().toISOString(),status:'active',...payload}; await write('licenses',[lic,...arr]); return send(res,201,{ok:true,data:lic}); }); return;
  }
  if(url.pathname==='/api/v1/licenses/heartbeat' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ const payload=body?JSON.parse(body):{}; return send(res,200,{ok:true,data:{accepted:true,at:new Date().toISOString(),route:payload.route}}); }); return;
  }
  if(url.pathname==='/api/v1/imports/preview' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ const payload=body?JSON.parse(body):{}; const rows=(payload.rows||[]).map((row,i)=>({index:i+1,ok:Object.keys(row).length>0,row})); return send(res,200,{ok:true,data:{type:payload.type,rows,accepted:rows.filter(r=>r.ok).length,rejected:0}}); }); return;
  }
  if(url.pathname==='/api/v1/regulatory/feeds'){
    return send(res,200,{ok:true,data:[{key:'ifrs-taxonomy-2025',name:'IFRS Accounting Taxonomy 2025',kind:'NIIF/XBRL',status:'reference',url:'https://www.ifrs.org/issued-standards/ifrs-taxonomy/ifrs-accounting-taxonomy-2025/'},{key:'fccpv-biblioteca',name:'Biblioteca FCCPV',kind:'Venezuela',status:'watch',url:'https://biblioteca.fccpv.org/'}]});
  }
  if(url.pathname==='/api/v1/regulatory/ifrs-taxonomy/import' && req.method==='POST'){
    return send(res,200,{ok:true,data:{queued:true,message:'Importación NIIF/XBRL simulada'}});
  }
  if(url.pathname==='/api/v1/rules'){
    return send(res,200,{ok:true,data:{orders:{reserveOn:'accepted'},inventory:{kardex:'immutable'},accounting:{doubleEntry:true},payroll:{parameterVersioning:true}}});
  }

  if(url.pathname==='/api/v1/food/orders' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',async()=>{
      const payload=body?JSON.parse(body):{};
      const subtotal=(payload.items||[]).reduce((s,i)=>s+Number(i.qty||0)*Number(i.price||0),0);
      const order={id:payload.id||crypto.randomUUID(),number:payload.number||`PED-${Date.now().toString().slice(-6)}`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:payload.status||'new',subtotal,iva:subtotal*.16,total:subtotal*1.16,...payload};
      const arr=await read('foodOrders'); await write('foodOrders',[order,...arr].slice(0,500));
      return send(res,201,{ok:true,data:order});
    }); return;
  }
  if(url.pathname.startsWith('/api/v1/food/orders/') && url.pathname.endsWith('/status') && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',async()=>{
      const id=url.pathname.split('/')[4]; const payload=body?JSON.parse(body):{}; const arr=await read('foodOrders');
      const next=arr.map(o=>o.id===id||o.number===id?{...o,status:payload.status||o.status,updatedAt:new Date().toISOString(),events:[{at:new Date().toISOString(),type:'status',status:payload.status,message:payload.message||'Estado actualizado'},...(o.events||[])]}:o);
      await write('foodOrders',next); return send(res,200,{ok:true,data:next.find(o=>o.id===id||o.number===id)});
    }); return;
  }
  if(url.pathname==='/api/v1/notifications/whatsapp/order' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',async()=>{
      const payload=body?JSON.parse(body):{}; const arr=await read('notificationLog');
      const log={id:crypto.randomUUID(),createdAt:new Date().toISOString(),channel:'whatsapp',status:'mock-sent',payload};
      await write('notificationLog',[log,...arr].slice(0,1000));
      return send(res,200,{ok:true,data:{provider:'mock-whatsapp',status:'accepted',log}});
    }); return;
  }
  if(url.pathname==='/api/v1/maps/geocode' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      const payload=body?JSON.parse(body):{}; const address=payload.address||'';
      return send(res,200,{ok:true,data:{provider:'mock-map',address,formattedAddress:address,location:null,mapUrl:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,directionsUrl:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}});
    }); return;
  }
  if(url.pathname==='/api/v1/ai/chat' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      const payload=body?JSON.parse(body):{};
      return send(res,200,{ok:true,data:{answer:`Mock IA: Para "${payload.message}", revisa pedidos activos, inventario crítico, caja y notificaciones pendientes.`,suggestions:['Pedidos','Inventario','Caja']}});
    }); return;
  }

  if(url.pathname==='/api/v1/pretesting/summary' && req.method==='GET'){
    return send(res,200,{ok:true,data:{generatedAt:new Date().toISOString(),status:'mock-pretesting-ready',integrations:[
      {key:'bcv',status:'ready',fallback:true},
      {key:'whatsapp',status:'mock',fallback:true},
      {key:'maps',status:'mock',fallback:true},
      {key:'openai',status:'local_fallback',fallback:true},
      {key:'supabase',status:'pending_env',fallback:false}
    ]}});
  }

  if(url.pathname==='/api/v1/demos/access' && req.method==='GET'){
    const arr=await read('demoAccess','licenses'); return send(res,200,{ok:true,data:arr});
  }
  if(url.pathname==='/api/v1/demos/access' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',async()=>{ const payload=body?JSON.parse(body):{}; const arr=await read('demoAccess','licenses'); const demo={id:payload.id||crypto.randomUUID(),createdAt:new Date().toISOString(),...payload}; await write('demoAccess','licenses',[demo,...arr]); return send(res,201,{ok:true,data:demo}); }); return;
  }

  if(url.pathname==='/api/v1/qr/generate' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      const payload=body?JSON.parse(body):{}; const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="100%" height="100%" fill="white"/><rect x="24" y="24" width="64" height="64" fill="#00236f"/><rect x="232" y="24" width="64" height="64" fill="#00236f"/><rect x="24" y="232" width="64" height="64" fill="#00236f"/><text x="24" y="164" font-family="monospace" font-size="12" fill="#00236f">${String(payload.payload||'ContaGest-VE').slice(0,32)}</text></svg>`;
      res.writeHead(200,{ 'content-type':'image/svg+xml', 'access-control-allow-origin':'*' }); res.end(svg);
    });
    return;
  }
  if(url.pathname==='/api/v1/qr/barcode' && req.method==='POST'){
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      const payload=body?JSON.parse(body):{}; const text=String(payload.text||'CGVE-0001');
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120"><rect width="100%" height="100%" fill="white"/><g fill="#111827">${text.split('').map((_,i)=>`<rect x="${20+i*9}" y="15" width="${i%3+2}" height="70"/>`).join('')}</g><text x="20" y="105" font-family="monospace" font-size="16" fill="#111827">${text}</text></svg>`;
      res.writeHead(200,{ 'content-type':'image/svg+xml', 'access-control-allow-origin':'*' }); res.end(svg);
    });
    return;
  }

  if(url.pathname==='/api/v1/modules') return send(res,200,{ok:true,data:moduleRegistry});
  const mod=url.pathname.match(/^\/api\/v1\/modules\/([^\/]+)\/records(?:\/([^\/]+))?$/);
  if(mod){
    const slug=decodeURIComponent(mod[1]); const id=mod[2];
    if(!moduleSlugs.has(slug)) return send(res,404,{ok:false,message:'module not found'});
    const name=`modules/${slug}`; let body=''; req.on('data',c=>body+=c); req.on('end',async()=>{
      const arr=await read(name); const payload=body?JSON.parse(body):{};
      if(req.method==='GET') return send(res,200,{ok:true,data:id?arr.find(x=>x.id===id):arr});
      if(req.method==='POST'){ const item={id:crypto.randomUUID(),moduleSlug:slug,createdAt:new Date().toISOString(),...payload}; arr.push(item); await write(name,arr); return send(res,200,{ok:true,data:item}); }
      if(req.method==='PUT'){ const idx=arr.findIndex(x=>x.id===id); if(idx<0) return send(res,404,{ok:false}); arr[idx]={...arr[idx],...payload,updatedAt:new Date().toISOString()}; await write(name,arr); return send(res,200,{ok:true,data:arr[idx]}); }
      if(req.method==='DELETE'){ await write(name,arr.filter(x=>x.id!==id)); return send(res,200,{ok:true,data:{id}}); }
      send(res,405,{ok:false});
    });
    return;
  }
  const m=url.pathname.match(/^\/api\/v1\/([^\/]+)(?:\/(.+))?$/);
  if(!m) return send(res,404,{ok:false,message:'not found'});
  const name=m[1].replace('products','inventory').replace('bank-accounts','banking').replace('tax-periods','taxes');
  if(!collections.includes(name)) return send(res,404,{ok:false,message:'collection not found'});
  const id=m[2]; let body=''; req.on('data',c=>body+=c); req.on('end',async()=>{
    const arr=await read(name); const payload=body?JSON.parse(body):{};
    if(req.method==='GET') return send(res,200,{ok:true,data:id?arr.find(x=>x.id===id):arr});
    if(req.method==='POST'){ const item={id:crypto.randomUUID(),createdAt:new Date().toISOString(),...payload}; arr.push(item); await write(name,arr); return send(res,200,{ok:true,data:item}); }
    if(req.method==='PUT'){ const idx=arr.findIndex(x=>x.id===id); if(idx<0) return send(res,404,{ok:false}); arr[idx]={...arr[idx],...payload,updatedAt:new Date().toISOString()}; await write(name,arr); return send(res,200,{ok:true,data:arr[idx]}); }
    if(req.method==='DELETE'){ await write(name,arr.filter(x=>x.id!==id)); return send(res,200,{ok:true,data:{id}}); }
    send(res,405,{ok:false});
  });
}).listen(PORT,()=>console.log(`Mock API on http://localhost:${PORT}`));
