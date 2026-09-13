import fs from 'node:fs/promises';
import path from 'node:path';
import { assertRuntimeConfig, loadRuntimeConfig } from './runtime-config.mjs';
import { sourceTitleMatches, parseWhatsAppPre } from './runtime-utils.mjs';
import { extractGroupIds, selectUniqueGroupId } from './group-identity.mjs';
import { createDocumentSpool } from './document-spool.mjs';
import { downloadPdfForMessage, postBridgePdf, shouldAutoIngestPdf } from './document-media.mjs';

const INSTALLED=Symbol.for('contagest.hipico.document-runtime-hook.installed');
const SEEN_LIMIT=20000;

function safeError(error){return String(error?.code||error?.message||error||'UNKNOWN').replace(/[\r\n]+/g,' ').slice(0,180);}
async function loadSeen(file){try{const value=JSON.parse(await fs.readFile(file,'utf8'));return Array.isArray(value)?value.filter(Boolean).slice(-SEEN_LIMIT):[];}catch{return[];}}
async function saveSeen(file,seen){const values=[...seen].slice(-SEEN_LIMIT);const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(tmp,JSON.stringify(values),{encoding:'utf8',mode:0o600});await fs.rename(tmp,file);}
function remember(seen,id){if(!id)return;while(seen.size>=SEEN_LIMIT){const oldest=seen.values().next().value;if(!oldest)break;seen.delete(oldest);}seen.add(id);}

export function sourceSnapshotAuthorized(snapshot,config){
  if(!snapshot||!sourceTitleMatches(String(snapshot.currentTitle||''),config.sourceMatches||[]))return false;
  const expected=String(config.sourceGroupId||'').trim().toLowerCase();if(!expected)return false;
  const actual=selectUniqueGroupId(extractGroupIds(Array.isArray(snapshot.groupIds)?snapshot.groupIds:[]),expected);
  return actual===expected;
}

function eventForRow(row,config){
  const parsed=parseWhatsAppPre(String(row.pre||''),new Date());
  return{
    bridgeVersion:'official-web-document-hook-v1',
    externalMessageId:String(row.id||'').slice(0,300),
    groupId:String(config.sourceGroupId||''),
    groupName:String(config.sourceMatches?.[0]||'source'),
    channelKey:String(config.sourceChannelKey||''),
    labChannelKey:String(config.labChannelKey||''),
    channelRole:'source',
    shadowMode:true,
    historySync:false,
    senderId:String(row.fromMe?'self':(parsed.senderLabel||'unknown')).slice(0,220),
    senderLabel:String(parsed.senderLabel||'').slice(0,220),
    fromMe:Boolean(row.fromMe),
    timestamp:parsed.timestamp,
    type:'media',
    mediaKind:'document',
    mediaName:String(row.mediaName||'').slice(0,180),
    text:String(row.text||'').slice(0,4000),
    hasMedia:true,
    quotedExternalMessageId:null
  };
}

export async function createDocumentAutomationController({
  config,
  spool,
  initialSeen=[],
  downloadPdf=downloadPdfForMessage,
  postPdf=postBridgePdf,
  saveSeen:saveSeenFn=async()=>{},
  log=async()=>{}
}){
  const seen=new Set(initialSeen.filter(Boolean).slice(-SEEN_LIMIT));
  let baselineComplete=seen.size>0;

  async function flush(){
    if(!config.pdfAutoIngestEnabled)return{delivered:0,retried:0,quarantined:0};
    return spool.flush(async(record,pdf)=>postPdf({url:config.documentIngestUrl,token:config.token,event:record.event,filename:record.filename,pdf,timeoutMs:config.documentBackendTimeoutMs}));
  }

  return{
    hasSeen:(id)=>seen.has(id),
    async processSnapshot(page,snapshot){
      const delivery=await flush().catch(async(error)=>{await log(`DOCUMENT_FLUSH_ERROR ${safeError(error)}`);return{delivered:0,retried:1,quarantined:0};});
      if(!config.pdfAutoIngestEnabled)return{authorized:false,disabled:true,delivery};
      if(!sourceSnapshotAuthorized(snapshot,config))return{authorized:false,delivery};
      const rows=Array.isArray(snapshot.rows)?snapshot.rows:[];
      if(!baselineComplete){
        let changed=false;
        for(const row of rows){if(shouldAutoIngestPdf(row,{enabled:true,historySync:false})&&!seen.has(row.id)){remember(seen,row.id);changed=true;}}
        baselineComplete=true;if(changed)await saveSeenFn(seen);
        return{authorized:true,baseline:true,delivery};
      }
      const capacity=await spool.snapshot();
      if(Number(capacity.pending||0)>=Number(capacity.maxPendingDocuments||50))return{authorized:true,spoolFull:true,queued:0,delivery};
      let queued=0;
      for(const row of rows){
        if(seen.has(row.id)||!shouldAutoIngestPdf(row,{enabled:true,historySync:false}))continue;
        const latest=await spool.snapshot();
        if(Number(latest.pending||0)>=Number(latest.maxPendingDocuments||50))return{authorized:true,spoolFull:true,queued,delivery};
        try{
          const {pdf,filename}=await downloadPdf(page,row);
          const event=eventForRow({...row,mediaName:filename},config);
          await spool.queue({externalMessageId:event.externalMessageId,filename,event},pdf);
          remember(seen,row.id);await saveSeenFn(seen);queued+=1;
          await log(`DOCUMENT_QUEUED ${event.externalMessageId}`);
        }catch(error){await log(`DOCUMENT_CAPTURE_RETRY ${String(row.id||'').slice(0,80)} ${safeError(error)}`);}
      }
      const after=await flush().catch(async(error)=>{await log(`DOCUMENT_FLUSH_ERROR ${safeError(error)}`);return{delivered:0,retried:1,quarantined:0};});
      return{authorized:true,queued,delivery:after};
    },
    async processPage(page){
      const snapshot=await scanDocumentPage(page,config);
      return this.processSnapshot(page,snapshot);
    }
  };
}

export async function scanDocumentPage(page,config){
  if(!page||page.isClosed?.())return{currentTitle:'',groupIds:[],rows:[]};
  return page.evaluate((aliases)=>{
    const norm=(value)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const header=document.querySelector('#main header')||Array.from(document.querySelectorAll('header')).at(-1)||null;
    const headerText=String(header?.innerText||header?.textContent||'').replace(/\s+/g,' ').trim();
    const currentTitle=aliases.find((alias)=>norm(headerText).includes(norm(alias)))||'';
    const root=document.querySelector('#main')||document.body;const groupIds=[];
    for(const node of root.querySelectorAll('[data-id], [id], [data-testid]')){
      for(const name of ['data-id','id','data-testid']){const value=node.getAttribute?.(name);if(value&&value.includes('@g.us'))groupIds.push(value);}
      if(groupIds.length>=400)break;
    }
    const rows=[];const used=new Set();
    for(const node of root.querySelectorAll('[data-id]')){
      const id=String(node.getAttribute('data-id')||'').trim();if(!id||used.has(id))continue;
      const preNode=node.querySelector?.('[data-pre-plain-text]')||(node.matches?.('[data-pre-plain-text]')?node:null);
      const messageContainer=node.closest?.('.message-in, .message-out')||(String(node.className||'').includes('message-')?node:null);
      if(!preNode&&!messageContainer)continue;
      const hasDocument=Boolean(node.querySelector?.('[data-icon*="document"], [data-icon*="doc"], a[href$=".pdf"], [aria-label$=".pdf" i], [title$=".pdf" i]'));
      if(!hasDocument)continue;
      const attrs=Array.from(node.querySelectorAll?.('[title], [aria-label]')||[]).map((el)=>String(el.getAttribute('title')||el.getAttribute('aria-label')||'').trim());
      const text=String((preNode||messageContainer||node).innerText||'').trim();
      const textPdf=(text.match(/[^\n\r]{1,180}\.pdf\b/i)||[])[0]||'';
      const mediaName=attrs.find((value)=>/\.pdf$/i.test(value))||textPdf;
      const pre=String(preNode?.getAttribute?.('data-pre-plain-text')||'');
      const fromMe=Boolean(node.closest?.('.message-out'))||Boolean(messageContainer?.classList?.contains?.('message-out'))||String(node.className||'').includes('message-out');
      rows.push({id,pre,text,fromMe,hasMedia:true,mediaKind:'document',mediaName});used.add(id);
    }
    return{currentTitle,groupIds,rows};
  },config.sourceMatches||[]).catch(()=>({currentTitle:'',groupIds:[],rows:[]}));
}

async function defaultController(config){
  const seenFile=path.join(config.dataDir,'seen-source-document-message-ids.json');
  const initialSeen=await loadSeen(seenFile);
  const spool=createDocumentSpool({
    rootDir:path.join(config.dataDir,'spool-documents'),
    baseBackoffMs:config.backoffBaseMs,
    maxBackoffMs:config.backoffMaxMs,
    maxPendingDocuments:config.pdfSpoolMaxDocuments||50
  });
  const healthFile=path.join(config.dataDir,'document-health.json');
  const logFile=path.join(config.dataDir,'bridge.log');
  const logger=async(line)=>fs.appendFile(logFile,`[${new Date().toISOString()}] ${line}\n`,'utf8').catch(()=>{});
  const controller=await createDocumentAutomationController({config,spool,initialSeen,saveSeen:(seen)=>saveSeen(seenFile,seen),log:logger});
  const processPage=controller.processPage.bind(controller);
  controller.processPage=async(page)=>{
    const result=await processPage(page);const snapshot=await spool.snapshot();
    await fs.writeFile(healthFile,JSON.stringify({at:new Date().toISOString(),enabled:config.pdfAutoIngestEnabled,pending:snapshot.pending,quarantined:snapshot.quarantined,maxPendingDocuments:snapshot.maxPendingDocuments,lastResult:result},null,2),{encoding:'utf8',mode:0o600}).catch(()=>{});
    return result;
  };
  return controller;
}

export function installDocumentRuntimeHook(chromium,{
  config=assertRuntimeConfig(loadRuntimeConfig()),
  createController=defaultController,
  setIntervalFn=setInterval,
  clearIntervalFn=clearInterval
}={}){
  if(!config.pdfAutoIngestEnabled)return false;
  if(!chromium||typeof chromium.launchPersistentContext!=='function')throw new Error('HIPICO_DOCUMENT_HOOK_BROWSER_INVALID');
  if(chromium[INSTALLED])return true;
  const original=chromium.launchPersistentContext.bind(chromium);
  const patched=async(profile,options={})=>{
    const context=await original(profile,{...options,acceptDownloads:true});
    const controller=await createController(config);let running=false;
    const tick=async()=>{
      if(running)return;running=true;
      try{
        const pages=context.pages?.()||[];
        const page=pages.find((candidate)=>String(candidate.url?.()||'').startsWith('https://web.whatsapp.com'))||pages[0];
        if(page)await controller.processPage(page);
      }finally{running=false;}
    };
    const timer=setIntervalFn(()=>{void tick();},Math.max(1000,Number(config.pollMs||1000)));timer?.unref?.();
    context.on?.('close',()=>clearIntervalFn(timer));void tick();return context;
  };
  try{chromium.launchPersistentContext=patched;}catch{Object.defineProperty(chromium,'launchPersistentContext',{configurable:true,writable:true,value:patched});}
  try{Object.defineProperty(chromium,INSTALLED,{configurable:false,writable:false,value:true});}catch{chromium[INSTALLED]=true;}
  return true;
}
