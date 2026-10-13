import crypto from 'node:crypto';

// Volatile bounded retry throttle, never an ACK or a delivery authority.
// Pending LAB query remains unseen until the canonical read can be verified.
export function createLabQueryBackoff({now=Date.now,baseMs=15_000,maxMs=60_000,maxEntries=500}={}){
  if(!Number.isInteger(baseMs)||baseMs<1000||!Number.isInteger(maxMs)||maxMs<baseMs
    ||!Number.isInteger(maxEntries)||maxEntries<1)throw new Error('LAB_QUERY_BACKOFF_LIMITS_INVALID');
  const pending=new Map();
  const keyOf=id=>crypto.createHash('sha256').update(String(id||'')).digest('hex');
  return{
    allowed(id){
      if(!id)return false;
      const row=pending.get(keyOf(id));
      return !row || now()>=row.retryAt;
    },
    fail(id){
      if(!id)return 0;
      const key=keyOf(id);
      const previous=pending.get(key);
      const count=Math.min(16,(previous?.count||0)+1);
      const delay=Math.min(maxMs,baseMs*2**Math.min(count-1,10));
      pending.delete(key);
      pending.set(key,{count,retryAt:now()+delay});
      while(pending.size>maxEntries)pending.delete(pending.keys().next().value);
      return delay;
    },
    clear(id){if(id)pending.delete(keyOf(id));},
    get size(){return pending.size;}
  };
}
