const DB_NAME='control-hipico-db';
const DB_VERSION=2;

function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function requestValue(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
const uid=(prefix)=>`${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`;

async function finalizeReviewedRace(){
  const db=await openDb();
  const read=db.transaction(['settings','races','groups','operations','participants','outbox'],'readonly');
  const activeSetting=await requestValue(read.objectStore('settings').get('activeGroupId'));
  const groupId=activeSetting?.value||'';
  const [races,groups,operations,participants,outbox]=await Promise.all([
    requestValue(read.objectStore('races').getAll()),requestValue(read.objectStore('groups').getAll()),requestValue(read.objectStore('operations').getAll()),requestValue(read.objectStore('participants').getAll()),requestValue(read.objectStore('outbox').getAll())
  ]);
  const race=races.filter((item)=>(!item.groupId||item.groupId===groupId)&&item.status==='result').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
  if(!race||!Array.isArray(race.board)||race.board.length<2)throw new Error('Primero registra y revisa una llegada oficial.');
  const now=new Date().toISOString();
  const snapshot={id:uid('SNAP'),schemaVersion:2,groupId:groupId||race.groupId||null,raceId:race.id,createdAt:now,reason:'before_reviewed_finalization',groups,races,operations,participants,outbox};
  const updated={...race,status:'settled',settledAt:now,updatedAt:now,settlementMode:'operator_reviewed_no_auto_balance_mutation'};
  const queue={id:uid('OUT'),entity:'race',entityId:race.id,action:'settle_reviewed',payload:{raceId:race.id,board:race.board,reviewedAt:now},status:'pending',attempts:0,createdAt:now,updatedAt:now,idempotencyKey:`race:${race.id}:settle_reviewed`};
  await new Promise((resolve,reject)=>{const tx=db.transaction(['races','snapshots','outbox'],'readwrite');tx.objectStore('snapshots').put(snapshot);tx.objectStore('races').put(updated);tx.objectStore('outbox').put(queue);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  db.close();
  return updated;
}

document.addEventListener('click',async(event)=>{
  const button=event.target instanceof Element?event.target.closest('[data-settle-race]'):null;
  if(!button)return;
  event.preventDefault();button.disabled=true;const old=button.textContent;button.textContent='Finalizando…';
  try{await finalizeReviewedRace();location.hash='resumen';location.reload();}
  catch(error){button.disabled=false;button.textContent=old;window.dispatchEvent(new CustomEvent('hipico:notice',{detail:{message:error.message}}));}
});
