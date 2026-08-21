import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';

const VERSION='1.3.0';
const DATA_DIR=path.resolve(process.cwd(),'data');
const PROFILE_DIR=path.join(DATA_DIR,'chrome-profile');
const SPOOL_DIR=path.join(DATA_DIR,'spool-history');
const SEEN_FILE=path.join(DATA_DIR,'seen-source-message-ids.json');
const REPORT_FILE=path.join(DATA_DIR,'history-sync-report.json');
const LOG_FILE=path.join(DATA_DIR,'bridge.log');

const INGEST_URL=required('HIPICO_INGEST_URL');
const TOKEN=required('HIPICO_GROUP_BRIDGE_TOKEN');
const SOURCE_GROUP_MATCH=requiredAny('HIPICO_SOURCE_GROUP_MATCH','HIPICO_SOURCE_GROUP_NAME','HIPICO_GROUP_NAME');
const SOURCE_CHANNEL_KEY=envText('HIPICO_SOURCE_CHANNEL_KEY','club-hipico-triple-crown-official');
const LAB_CHANNEL_KEY=envText('HIPICO_LAB_CHANNEL_KEY','control-hipico-lab');
const MAX_MESSAGES=numberEnv('HIPICO_HISTORY_MAX_MESSAGES',50000,100,250000);
const MAX_MINUTES=numberEnv('HIPICO_HISTORY_MAX_MINUTES',90,5,720);
const IDLE_LIMIT=numberEnv('HIPICO_HISTORY_IDLE_ROUNDS',8,3,30);
const WAIT_MS=numberEnv('HIPICO_HISTORY_PAGE_WAIT_MS',1200,500,5000);
const CONCURRENCY=numberEnv('HIPICO_HISTORY_UPLOAD_CONCURRENCY',4,1,8);
const BACKEND_TIMEOUT_MS=numberEnv('HIPICO_BACKEND_TIMEOUT_MS',15000,5000,60000);

await fs.mkdir(DATA_DIR,{recursive:true});
await fs.mkdir(PROFILE_DIR,{recursive:true});
await fs.mkdir(SPOOL_DIR,{recursive:true});

let context=null;
let page=null;
let stopping=false;
let activeTitle='';
const startedAt=Date.now();
const collected=new Map();
const deliveredIds=await loadSeen();
const stats={version:VERSION,sourceGroupMatch:SOURCE_GROUP_MATCH,sourceChannelKey:SOURCE_CHANNEL_KEY,startedAt:new Date().toISOString(),finishedAt:null,stopReason:null,uniqueFound:0,queued:0,delivered:0,duplicates:0,pending:0,earliestSourceTimestamp:null,latestSourceTimestamp:null,oldestRawMeta:null};

function required(name){const v=String(process.env[name]||'').trim();if(!v)throw new Error(`Falta variable ${name}`);return v;}
function requiredAny(...names){for(const n of names){const v=String(process.env[n]||'').trim();if(v)return v;}throw new Error(`Falta una de estas variables: ${names.join(', ')}`);}
function envText(name,fallback=''){return String(process.env[name]||'').trim()||fallback;}
function numberEnv(name,fallback,min,max){const n=Number(process.env[name]);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.trunc(n))):fallback;}
function normalize(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();}
function sha256(v){return crypto.createHash('sha256').update(String(v??'')).digest('hex');}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function elapsedMinutes(){return(Date.now()-startedAt)/60000;}
async function log(line){await fs.appendFile(LOG_FILE,`[${new Date().toISOString()}] HISTORY ${line}\n`,'utf8').catch(()=>{});}
async function loadSeen(){try{const d=JSON.parse(await fs.readFile(SEEN_FILE,'utf8'));return new Set(Array.isArray(d)?d.filter(Boolean).slice(-250000):[]);}catch{return new Set();}}
async function saveSeen(){await fs.writeFile(SEEN_FILE,JSON.stringify([...deliveredIds].slice(-250000)),'utf8');}

async function launch(){const opt={headless:false,viewport:null,locale:'es-VE',acceptDownloads:false};try{return{context:await chromium.launchPersistentContext(PROFILE_DIR,{...opt,channel:'chrome'}),channel:'chrome'};}catch(a){await log(`CHROME_FAIL ${a.message}`);try{return{context:await chromium.launchPersistentContext(PROFILE_DIR,{...opt,channel:'msedge'}),channel:'msedge'};}catch(b){throw new Error(`No pude abrir Chrome ni Edge. Chrome: ${a.message}. Edge: ${b.message}`);}}}
async function isLoggedIn(){return page.evaluate(()=>Boolean(document.querySelector('#pane-side')||document.querySelector('[data-testid="chat-list"]')||document.querySelector('[aria-label*="Lista de chats"]')||document.querySelector('[aria-label*="Chat list"]'))).catch(()=>false);}
async function waitLogin(){const deadline=Date.now()+600000;while(!stopping&&Date.now()<deadline){if(await isLoggedIn())return;console.log('Esperando inicio de sesión de WhatsApp Web...');await sleep(2000);}throw new Error('No se inició sesión en 10 minutos.');}
async function chatTitle(){return page.evaluate(()=>{for(const h of document.querySelectorAll('header')){const a=[...h.querySelectorAll('span[title], [data-testid="conversation-info-header-chat-title"][title]')].map(e=>String(e.getAttribute('title')||'').trim()).filter(x=>x.length>1);if(a.length)return a[0];}return'';}).catch(()=>'');}
async function chatMatches(match){const t=await chatTitle();return Boolean(t)&&normalize(t).includes(normalize(match));}
async function clickCandidate(match){const pane=page.locator('#pane-side');if(await pane.count()){const c=pane.getByText(match,{exact:false}).first();if(await c.count()&&await c.isVisible().catch(()=>false)){await c.click({timeout:4000});await sleep(900);return true;}}const t=page.locator('span[title]').filter({hasText:match}).first();if(await t.count()&&await t.isVisible().catch(()=>false)){await t.click({timeout:4000});await sleep(900);return true;}return false;}
async function openSearch(match){for(const s of [page.getByRole('textbox',{name:/buscar|search/i}).first(),page.locator('div[contenteditable="true"][data-tab="3"]').first(),page.locator('div[contenteditable="true"][role="textbox"]').first()]){try{if(!(await s.count())||!(await s.isVisible().catch(()=>false)))continue;await s.click({timeout:2000});await page.keyboard.press('Control+A').catch(()=>{});await page.keyboard.insertText(match);await sleep(1200);const ok=await clickCandidate(match);await page.keyboard.press('Escape').catch(()=>{});if(ok)return true;}catch{}}return false;}
async function openSource(){if(await chatMatches(SOURCE_GROUP_MATCH))return true;if(await clickCandidate(SOURCE_GROUP_MATCH)&&await chatMatches(SOURCE_GROUP_MATCH))return true;if(await openSearch(SOURCE_GROUP_MATCH)&&await chatMatches(SOURCE_GROUP_MATCH))return true;return false;}

function parseTimestamp(pre){const m=String(pre||'').trim().match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([^,]*),\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]/i);if(!m)return null;let h=Number(m[1]);const min=Number(m[2]),sec=Number(m[3]||0);const mark=String(m[4]||'').toLowerCase().replace(/\s|\./g,'');const d=Number(m[5]),mo=Number(m[6]);let y=Number(m[7]);if(y<100)y+=2000;if(mark.includes('pm')&&h<12)h+=12;if(mark.includes('am')&&h===12)h=0;if(![y,mo,d,h,min,sec].every(Number.isFinite))return null;const p=v=>String(v).padStart(2,'0');return`${y}-${p(mo)}-${p(d)}T${p(h)}:${p(min)}:${p(sec)}-04:00`;}

async function visibleRows(){return page.evaluate(()=>{const rows=[],used=new Set();for(const node of document.querySelectorAll('[data-id]')){const preNode=node.querySelector?.('[data-pre-plain-text]')||(node.matches?.('[data-pre-plain-text]')?node:null);if(!preNode)continue;const id=String(node.getAttribute('data-id')||'').trim();if(!id||used.has(id))continue;const pre=String(preNode.getAttribute('data-pre-plain-text')||'');const spans=[...preNode.querySelectorAll?.('span.selectable-text, span[dir="ltr"], span[dir="auto"]')||[]];let text=spans.map(e=>(e.innerText||'').trim()).filter(Boolean).join('\n').trim();if(!text)text=String(preNode.innerText||'').trim();const cls=String(node.className||''),pcls=String(node.parentElement?.className||'');const fromMe=cls.includes('message-out')||pcls.includes('message-out')||Boolean(node.closest?.('.message-out'));const hasImage=Boolean(node.querySelector?.('img, canvas'));const hasVideo=Boolean(node.querySelector?.('video'));const hasAudio=Boolean(node.querySelector?.('audio, [data-icon*="audio"], [data-icon*="ptt"]'));const hasDocument=Boolean(node.querySelector?.('[data-icon*="document"], [data-icon*="doc"], a[href$=".pdf"], [aria-label$=".pdf"]'));const mediaKind=hasDocument?'document':hasAudio?'audio':hasVideo?'video':hasImage?'image':'none';const mediaName=[...node.querySelectorAll?.('[title], [aria-label]')||[]].map(e=>String(e.getAttribute('title')||e.getAttribute('aria-label')||'').trim()).find(v=>/\.pdf$|\.docx?$|\.xlsx?$|\.csv$|\.txt$/i.test(v))||'';let senderLabel='';const sm=pre.match(/\]\s*([^:]+):\s*$/);if(sm)senderLabel=sm[1].trim();rows.push({id,pre,text,fromMe,hasMedia:mediaKind!=='none',mediaKind,mediaName,senderLabel});used.add(id);}return rows;});}

async function scrollUp(){return page.evaluate(()=>{const first=document.querySelector('#main [data-id]')||document.querySelector('[data-id]');if(!first)return{ok:false,reason:'no-message'};let n=first.parentElement,s=null;while(n&&n!==document.body){const st=getComputedStyle(n);if(n.scrollHeight>n.clientHeight+150&&/(auto|scroll)/i.test(st.overflowY||'')){s=n;break;}n=n.parentElement;}if(!s){s=[...document.querySelectorAll('#main div, main div')].find(e=>e.scrollHeight>e.clientHeight+300)||null;}if(!s)return{ok:false,reason:'no-scroller'};s.scrollTop=0;s.dispatchEvent(new Event('scroll',{bubbles:true}));return{ok:true};});}

function addRows(rows){let added=0;for(const r of rows){if(!r?.id||collected.has(r.id))continue;r.sourceTimestamp=parseTimestamp(r.pre);collected.set(r.id,r);added++;}return added;}
function updateTimeStats(){const ts=[...collected.values()].map(r=>r.sourceTimestamp).filter(Boolean).sort();stats.earliestSourceTimestamp=ts[0]||null;stats.latestSourceTimestamp=ts.at(-1)||null;const oldest=[...collected.values()].find(r=>r.sourceTimestamp===stats.earliestSourceTimestamp);stats.oldestRawMeta=oldest?.pre||stats.oldestRawMeta;}
async function crawl(){let idle=0,round=0;while(!stopping){round++;const rows=await visibleRows();const added=addRows(rows);stats.uniqueFound=collected.size;idle=added===0?idle+1:0;updateTimeStats();console.log(`[HISTORICO] ronda ${round} · únicos ${collected.size} · nuevos ${added} · sin nuevos ${idle}/${IDLE_LIMIT}`);await log(`CRAWL round=${round} unique=${collected.size} added=${added} idle=${idle}`);if(collected.size>=MAX_MESSAGES){stats.stopReason='max_messages';break;}if(elapsedMinutes()>=MAX_MINUTES){stats.stopReason='max_minutes';break;}if(idle>=IDLE_LIMIT){stats.stopReason='stable_oldest_available';break;}const moved=await scrollUp();if(!moved.ok){idle++;await log(`SCROLL_WARN ${moved.reason}`);}await sleep(WAIT_MS);}if(!stats.stopReason)stats.stopReason=stopping?'interrupted':'completed';}

function eventOf(r){const sender=r.fromMe?'self':(r.senderLabel||'unknown');return{bridgeVersion:`official-web-history-${VERSION}`,externalMessageId:String(r.id||'').slice(0,320),groupId:`official-web:${sha256(SOURCE_CHANNEL_KEY).slice(0,32)}`,groupName:activeTitle||SOURCE_GROUP_MATCH,channelKey:SOURCE_CHANNEL_KEY,labChannelKey:LAB_CHANNEL_KEY,channelRole:'source',shadowMode:true,historySync:true,senderId:String(sender).slice(0,220),senderLabel:String(r.senderLabel||'').slice(0,220),fromMe:Boolean(r.fromMe),timestamp:r.sourceTimestamp||new Date().toISOString(),type:r.hasMedia?'media':'chat',mediaKind:r.mediaKind||'none',mediaName:String(r.mediaName||'').slice(0,240),text:String(r.text||'').slice(0,4000),hasMedia:Boolean(r.hasMedia),quotedExternalMessageId:null,rawMeta:String(r.pre||'').slice(0,500)};}
async function queue(event){const f=path.join(SPOOL_DIR,`${sha256(`${event.channelKey}|${event.externalMessageId}`)}.json`);try{await fs.access(f);}catch{await fs.writeFile(f,JSON.stringify(event),'utf8');stats.queued++;}return f;}
async function post(event){const r=await fetch(INGEST_URL,{method:'POST',headers:{'content-type':'application/json','x-hipico-bridge-token':TOKEN},body:JSON.stringify(event),signal:AbortSignal.timeout(BACKEND_TIMEOUT_MS)});const raw=await r.text();let body={};try{body=raw?JSON.parse(raw):{};}catch{}if(!r.ok)throw new Error(`Backend ${r.status}: ${body?.error||raw.slice(0,240)||r.statusText}`);return body;}
async function deliver(file){let e;try{e=JSON.parse(await fs.readFile(file,'utf8'));}catch{await fs.unlink(file).catch(()=>{});return;}try{const result=await post(e);result?.duplicate?stats.duplicates++:stats.delivered++;deliveredIds.add(e.externalMessageId);await fs.unlink(file).catch(()=>{});}catch(err){await log(`UPLOAD_PENDING ${e?.externalMessageId||'unknown'} ${err.message}`);}}
async function upload(){const rows=[...collected.values()].sort((a,b)=>(a.sourceTimestamp?Date.parse(a.sourceTimestamp):Number.MAX_SAFE_INTEGER)-(b.sourceTimestamp?Date.parse(b.sourceTimestamp):Number.MAX_SAFE_INTEGER));for(const r of rows)await queue(eventOf(r));const files=(await fs.readdir(SPOOL_DIR)).filter(n=>n.endsWith('.json')).sort();let cursor=0;const workers=Array.from({length:Math.min(CONCURRENCY,Math.max(1,files.length))},async()=>{while(!stopping){const i=cursor++;if(i>=files.length)break;await deliver(path.join(SPOOL_DIR,files[i]));if((i+1)%100===0)console.log(`[SUBIDA] ${i+1}/${files.length}`);}});await Promise.all(workers);await saveSeen();}

async function report(){stats.finishedAt=new Date().toISOString();stats.pending=(await fs.readdir(SPOOL_DIR).catch(()=>[])).filter(n=>n.endsWith('.json')).length;await fs.writeFile(REPORT_FILE,JSON.stringify(stats,null,2),'utf8');console.log('\n================ HISTORICO ================');console.log(`Grupo: ${activeTitle||SOURCE_GROUP_MATCH}`);console.log(`Mensajes únicos recuperados: ${stats.uniqueFound}`);console.log(`Entregados nuevos: ${stats.delivered}`);console.log(`Ya existentes/deduplicados: ${stats.duplicates}`);console.log(`Pendientes locales: ${stats.pending}`);console.log(`Más antiguo recuperado: ${stats.earliestSourceTimestamp||'sin fecha extraíble'}`);console.log(`Más reciente recuperado: ${stats.latestSourceTimestamp||'sin fecha extraíble'}`);console.log(`Fin: ${stats.stopReason}`);console.log(`Reporte: ${REPORT_FILE}`);console.log('============================================\n');}

async function main(){console.log('\n========================================================');console.log(' Control Hípico - Histórico oficial v1.3.0');console.log(' CLUB HIPICO TRIPLE CROWN · SOLO LECTURA');console.log('========================================================\n');console.log('Se recorrerá hacia atrás todo lo que WhatsApp Web permita cargar. No se envía nada durante el backfill.\n');const launched=await launch();context=launched.context;page=context.pages()[0]||await context.newPage();await page.goto('https://web.whatsapp.com/',{waitUntil:'domcontentloaded',timeout:60000});await waitLogin();if(!(await openSource()))throw new Error(`No pude abrir el grupo fuente que contiene: ${SOURCE_GROUP_MATCH}`);activeTitle=await chatTitle();if(!normalize(activeTitle).includes(normalize(SOURCE_GROUP_MATCH)))throw new Error('El header activo no coincide con el grupo oficial configurado.');console.log(`Fuente histórica activa: ${activeTitle}`);await log(`START v=${VERSION} title=${activeTitle}`);await crawl();console.log('\nCrawl terminado. Subiendo evidencia shadow idempotente...');await upload();await report();}

process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
main().catch(async err=>{stats.stopReason=`error:${err.message}`;console.error(`FALLO HISTORICO: ${err.message}`);await log(`FAIL ${err.stack||err.message}`);await report().catch(()=>{});process.exitCode=1;}).finally(async()=>{try{await saveSeen();}catch{}try{await context?.close();}catch{}});
