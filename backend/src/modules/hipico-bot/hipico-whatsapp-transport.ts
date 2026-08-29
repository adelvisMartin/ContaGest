export type WhatsAppOutboundMessage={
  destinationKey:string;
  text:string;
  sourceMessageId:string;
  responseIdempotencyKey:string;
  mode:'lab'|'assisted'|'production';
};

export type WhatsAppTransportResult={
  accepted:boolean;
  transport:string;
  providerMessageId:string|null;
  reason:string;
};

export interface WhatsAppTransport{
  readonly name:string;
  readonly capability:'lab-only'|'authorized-production';
  send(message:WhatsAppOutboundMessage):Promise<WhatsAppTransportResult>;
}

export class LabMemoryTransport implements WhatsAppTransport{
  readonly name='lab-memory';
  readonly capability='lab-only' as const;
  readonly sent:WhatsAppOutboundMessage[]=[];
  async send(message:WhatsAppOutboundMessage):Promise<WhatsAppTransportResult>{
    if(message.mode!=='lab')return{accepted:false,transport:this.name,providerMessageId:null,reason:'LAB_TRANSPORT_REJECTS_NON_LAB'};
    this.sent.push(structuredClone(message));
    return{accepted:true,transport:this.name,providerMessageId:`lab:${message.responseIdempotencyKey}`,reason:'LAB_ONLY'};
  }
}

export class DisabledProductionTransport implements WhatsAppTransport{
  readonly name='production-disabled';
  readonly capability='lab-only' as const;
  async send(_message:WhatsAppOutboundMessage):Promise<WhatsAppTransportResult>{
    return{accepted:false,transport:this.name,providerMessageId:null,reason:'PRODUCTION_TRANSPORT_NO_GO'};
  }
}

export function assertProductionTransportAuthorized(transport:WhatsAppTransport){
  if(transport.capability!=='authorized-production'){
    throw Object.assign(new Error('No existe transporte WhatsApp productivo autorizado.'),{code:'HIPICO_WHATSAPP_PRODUCTION_TRANSPORT_NOT_AUTHORIZED'});
  }
  return true;
}
