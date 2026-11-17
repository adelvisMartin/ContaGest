import { AuthSession } from './authSession.js';
import { BackendApi } from './backendApi.js';
import {
  enqueueOfflineOperation,flushOfflineOutbox,listOfflineWorkoutQueue,
  discardReviewedWorkoutEvent
} from './pwaOfflineService.js';

// The canonical #797 queue lives only in pwaOfflineService. This adapter
// neither persists credentials nor invents a second workout authority.
function currentSession(){
  const session=AuthSession.get();
  if(!session?.tenantId||!session?.user?.id)
    throw new Error('Inicia una sesión autorizada para guardar entrenamientos offline.');
  return session;
}

export const GymWorkoutOfflineService={
  async queueSet(payload){
    const session=currentSession();
    if(typeof globalThis.crypto?.randomUUID!=='function')
      throw new Error('Se requiere un origen seguro para generar la clave de la serie.');
    return enqueueOfflineOperation({
      session,operation:'gym.workout.set',payload,
      idempotencyKey:globalThis.crypto.randomUUID()
    });
  },
  async pending(){
    return listOfflineWorkoutQueue(currentSession());
  },
  async sync({force=false}={}){
    const session=currentSession();
    return flushOfflineOutbox(session,async({operation,path,method,payload,idempotencyKey})=>{
      if(operation!=='gym.workout.set')throw new Error('Operación offline no autorizada.');
      // Method and URL are resolved inside the source-controlled allowlist.
      const {sessionId: _pathParameter,...set}=payload;
      await BackendApi.request(path,{
        method,body:{...set,eventKey:idempotencyKey}
      });
      // BackendApi.request rejects non-2xx and ok:false; only then is the
      // transport explicitly acknowledged for durable IndexedDB deletion.
      return {ok:true};
    },{operations:['gym.workout.set'],force});
  },
  async discardAfterReview(id){
    return discardReviewedWorkoutEvent(currentSession(),id);
  }
};
