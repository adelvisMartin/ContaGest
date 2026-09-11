import { createSportradarRacingProvider } from './sportradar-provider.adapter.js';
import type { RacingDataProvider } from './racing-provider.js';

export class RacingProviderRegistry {
  private readonly providers=new Map<string,RacingDataProvider>();
  constructor(initial:RacingDataProvider[]=[]){for(const provider of initial)this.register(provider);}
  register(provider:RacingDataProvider){
    const id=String(provider?.id||'').trim();
    if(!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id))throw new Error('RACING_PROVIDER_ID_INVALID');
    if(this.providers.has(id))throw new Error('RACING_PROVIDER_DUPLICATE');
    this.providers.set(id,provider);return this;
  }
  get(id:string){return this.providers.get(String(id||'').trim())||null;}
  list(){return [...this.providers.values()];}
  async status(){return Promise.all(this.list().map((provider)=>provider.health()));}
}

export function createDefaultRacingProviderRegistry(){
  return new RacingProviderRegistry([createSportradarRacingProvider()]);
}
