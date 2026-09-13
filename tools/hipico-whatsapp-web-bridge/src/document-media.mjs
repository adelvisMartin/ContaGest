import path from 'node:path';

export const MAX_DOCUMENT_BYTES=10*1024*1024;
const MAX_BACKEND_RESPONSE_BYTES=64*1024;
const CONTROL=/[\u0000-\u001F\u007F]/;

function coded(code,extra={}){return Object.assign(new Error(code),{code,...extra});}
export function normalizePdfFilename(value){
  const name=String(value||'').trim();
  if(!name||name.length>180||CONTROL.test(name)||path.basename(name)!==name||!name.toLowerCase().endsWith('.pdf'))return null;
  return name;
}

export function shouldAutoIngestPdf(row,{enabled=true,historySync=false}={}){
  return Boolean(enabled&&!historySync&&row?.hasMedia&&String(row?.mediaKind||'').toLowerCase()==='document'&&normalizePdfFilename(row?.mediaName));
}

export function assertPdfPayload(pdf){
  if(!Buffer.isBuffer(pdf)||pdf.length<5||pdf.subarray(0,5).toString('latin1')!=='%PDF-')throw coded('HIPICO_BRIDGE_MEDIA_NOT_PDF');
  if(pdf.length>MAX_DOCUMENT_BYTES)throw coded('HIPICO_BRIDGE_MEDIA_TOO_LARGE');
  return pdf;
}

export function buildBridgeDocumentHeaders(event,filename,token){
  const safeName=normalizePdfFilename(filename);if(!safeName)throw coded('HIPICO_BRIDGE_MEDIA_FILENAME_INVALID');
  return{
    'content-type':'application/pdf',
    'x-hipico-bridge-token':String(token||''),
    'x-hipico-group-id':String(event?.groupId||''),
    'x-hipico-channel-key':String(event?.channelKey||''),
    'x-hipico-lab-channel-key':String(event?.labChannelKey||''),
    'x-hipico-external-message-id':String(event?.externalMessageId||''),
    'x-hipico-sender':String(event?.senderId||''),
    'x-hipico-filename':safeName,
    'x-hipico-received-at':String(event?.timestamp||'')
  };
}

function safeDocumentUrl(value){
  try{const url=new URL(String(value||''));return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash?url.toString():null;}catch{return null;}
}
async function responseText(response){
  const length=Number(response.headers?.get?.('content-length')||0);
  if(Number.isFinite(length)&&length>MAX_BACKEND_RESPONSE_BYTES)throw coded('HIPICO_BRIDGE_DOCUMENT_RESPONSE_TOO_LARGE',{retryable:true,status:502});
  const raw=await response.text();
  if(Buffer.byteLength(raw,'utf8')>MAX_BACKEND_RESPONSE_BYTES)throw coded('HIPICO_BRIDGE_DOCUMENT_RESPONSE_TOO_LARGE',{retryable:true,status:502});
  return raw;
}

export async function postBridgePdf({url,token,event,filename,pdf,timeoutMs=15000,fetchImpl=fetch}){
  const target=safeDocumentUrl(url);if(!target)throw coded('HIPICO_BRIDGE_DOCUMENT_URL_INVALID',{retryable:false});
  assertPdfPayload(pdf);
  const response=await fetchImpl(target,{method:'POST',headers:buildBridgeDocumentHeaders(event,filename,token),body:pdf,signal:AbortSignal.timeout(timeoutMs)});
  const raw=await responseText(response);let body={};try{body=raw?JSON.parse(raw):{};}catch{}
  if(!response.ok){const status=Number(response.status||0);const retryable=body?.retryable!==false&&(status===408||status===409||status===425||status===429||status>=500);throw coded(String(body?.error||`HIPICO_BRIDGE_DOCUMENT_HTTP_${status}`),{status,retryable,retryAfterMs:0});}
  return body;
}

function cssQuoted(value){return String(value||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"');}
async function firstVisible(locators){for(const locator of locators){try{if(await locator.count()&&await locator.first().isVisible().catch(()=>false))return locator.first();}catch{}}return null;}

export async function downloadPdfForMessage(page,row,{timeoutMs=10000}={}){
  if(!shouldAutoIngestPdf(row,{enabled:true,historySync:false}))throw coded('HIPICO_BRIDGE_MEDIA_NOT_ELIGIBLE');
  const id=String(row.id||'');if(!id||CONTROL.test(id))throw coded('HIPICO_BRIDGE_MEDIA_MESSAGE_ID_INVALID');
  const container=page.locator(`[data-id="${cssQuoted(id)}"]`).first();
  if(!(await container.count())||!(await container.isVisible().catch(()=>false)))throw coded('HIPICO_BRIDGE_MEDIA_MESSAGE_NOT_VISIBLE');
  const trigger=await firstVisible([
    container.locator('button[aria-label*="Descargar" i]'),
    container.locator('button[aria-label*="Download" i]'),
    container.locator('[role="button"][aria-label*="Descargar" i]'),
    container.locator('[role="button"][aria-label*="Download" i]'),
    container.locator('[data-icon*="download" i]')
  ]);
  if(!trigger)throw coded('HIPICO_BRIDGE_MEDIA_DOWNLOAD_TRIGGER_NOT_FOUND');
  let download;
  try{[download]=await Promise.all([page.waitForEvent('download',{timeout:timeoutMs}),trigger.click({timeout:Math.min(timeoutMs,5000)})]);}
  catch(error){throw coded('HIPICO_BRIDGE_MEDIA_DOWNLOAD_FAILED',{cause:error});}
  const failure=await download.failure();if(failure)throw coded('HIPICO_BRIDGE_MEDIA_DOWNLOAD_FAILED');
  const suggested=normalizePdfFilename(download.suggestedFilename?.())||normalizePdfFilename(row.mediaName);
  if(!suggested)throw coded('HIPICO_BRIDGE_MEDIA_FILENAME_INVALID');
  const stream=await download.createReadStream();if(!stream)throw coded('HIPICO_BRIDGE_MEDIA_DOWNLOAD_FAILED');
  const chunks=[];let size=0;
  try{
    for await(const chunk of stream){const buffer=Buffer.from(chunk);size+=buffer.length;if(size>MAX_DOCUMENT_BYTES){stream.destroy?.();throw coded('HIPICO_BRIDGE_MEDIA_TOO_LARGE');}chunks.push(buffer);}
  }finally{await download.delete().catch(()=>{});}
  const pdf=Buffer.concat(chunks,size);assertPdfPayload(pdf);return{pdf,filename:suggested};
}
