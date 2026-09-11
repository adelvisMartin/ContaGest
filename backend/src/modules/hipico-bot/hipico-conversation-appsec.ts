import crypto from 'node:crypto';
import { classify, type IntentResult } from './hipico-operational-classifier.js';

export const MAX_ANALYSIS_TEXT = 2400;
export const MAX_QUOTE_DEPTH = 3;
export const MAX_MESSAGES_PER_MINUTE = 30;
export const MAX_IDENTICAL_PER_MINUTE = 5;
export const DEFAULT_RATE_BUCKET_LIMIT = 5_000;
const RATE_WINDOW_MS = 60_000;
const RATE_SWEEP_INTERVAL_MS = 30_000;

const ZERO_WIDTH_AND_BIDI=/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
const HTML_TAG=/<\/?[a-z][^>]*>/gi;
const MARKDOWN_CONTROL=/[`*_~]{2,}/g;
const SCRIPTISH=/\b(?:javascript|data|vbscript)\s*:/gi;
const PRIVILEGE_CLAIM=/\b(?:admin|administrator|operador|operator|root|system)\b[\s:,-]*(?:pausa|pause|resume|reanuda|confirma|confirm|ignora|ignore|registra|acepta|accept)/i;
const INJECTION=/\b(?:ignora|ignore|olvida|forget|revela|reveal|muestra|show)\b.{0,80}\b(?:reglas|rules|instrucciones|instructions|prompt|system|secret|token|contexto|context)\b/i;
const CROSS_PARTICIPANT=/\b(?:saldo|balance|historial|history|apuesta|bet)\b.{0,60}\b(?:de|of)\s+(?:otro|another|tester-|participante\s+\w+)/i;

export type ConversationAbuseAssessment={
  sanitizedText:string;
  digest:string;
  flags:string[];
  blocked:boolean;
  forceReview:boolean;
  unsupportedMedia:boolean;
  originalLength:number;
};

export type RateCheck={allowed:boolean;reason:string|null;count:number;identicalCount:number;retryAfterMs:number};
type RateBucket={events:Array<{at:number;digest:string}>};

function safeClock(value:number){
  return Number.isFinite(value) ? value : Date.now();
}

export class ParticipantRateLimiter {
  private buckets=new Map<string,RateBucket>();
  private lastSweepAt=0;

  constructor(
    private maxPerMinute=MAX_MESSAGES_PER_MINUTE,
    private maxIdentical=MAX_IDENTICAL_PER_MINUTE,
    private maxBuckets=DEFAULT_RATE_BUCKET_LIMIT
  ){}

  private trimToMax(){
    if(this.buckets.size<=this.maxBuckets)return;
    const oldest=[...this.buckets.entries()]
      .map(([key,bucket])=>({key,at:bucket.events.at(-1)?.at??0}))
      .sort((left,right)=>left.at-right.at);
    for(const row of oldest.slice(0,this.buckets.size-this.maxBuckets))this.buckets.delete(row.key);
  }

  private sweep(at:number){
    const now=safeClock(at);
    if(now-this.lastSweepAt<RATE_SWEEP_INTERVAL_MS&&this.buckets.size<=this.maxBuckets)return;
    const cutoff=now-RATE_WINDOW_MS;
    for(const[key,bucket]of this.buckets){
      bucket.events=bucket.events.filter((event)=>event.at>cutoff);
      if(!bucket.events.length)this.buckets.delete(key);
    }
    this.trimToMax();
    this.lastSweepAt=now;
  }

  check(actorKey:string,digest:string,at=Date.now()):RateCheck{
    const now=safeClock(at);
    this.sweep(now);
    const key=String(actorKey||'unknown').trim().toLowerCase().slice(0,512);
    const cutoff=now-RATE_WINDOW_MS;
    const bucket=this.buckets.get(key)||{events:[]};
    bucket.events=bucket.events.filter((event)=>event.at>cutoff);
    const count=bucket.events.length;
    const identicalCount=bucket.events.filter((event)=>event.digest===digest).length;
    if(count>=this.maxPerMinute){
      const retryAfterMs=Math.max(1,(bucket.events[0]?.at||now)+RATE_WINDOW_MS-now);
      this.buckets.set(key,bucket);
      this.trimToMax();
      return{allowed:false,reason:'PARTICIPANT_RATE_LIMIT',count,identicalCount,retryAfterMs};
    }
    if(identicalCount>=this.maxIdentical){
      const first=bucket.events.find((event)=>event.digest===digest)?.at||now;
      const retryAfterMs=Math.max(1,first+RATE_WINDOW_MS-now);
      this.buckets.set(key,bucket);
      this.trimToMax();
      return{allowed:false,reason:'REPETITION_RATE_LIMIT',count,identicalCount,retryAfterMs};
    }
    bucket.events.push({at:now,digest});
    this.buckets.set(key,bucket);
    this.trimToMax();
    return{allowed:true,reason:null,count:count+1,identicalCount:identicalCount+1,retryAfterMs:0};
  }

  reset(){this.buckets.clear();this.lastSweepAt=0;}
  size(){return this.buckets.size;}
}

export const bridgeParticipantRateLimiter=new ParticipantRateLimiter();

export function sanitizeUntrustedConversationText(value:string){
  return String(value||'')
    .normalize('NFKC')
    .replace(ZERO_WIDTH_AND_BIDI,'')
    .replace(HTML_TAG,' ')
    .replace(SCRIPTISH,'blocked-scheme:')
    .replace(MARKDOWN_CONTROL,' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,' ')
    .replace(/[ \t]{2,}/g,' ')
    .trim()
    .slice(0,MAX_ANALYSIS_TEXT);
}

export function assessConversationInput(input:{text:string;mediaKind?:string|null;quoteDepth?:number;participantId?:string|null}):ConversationAbuseAssessment{
  const original=String(input.text||'');
  const sanitizedText=sanitizeUntrustedConversationText(original);
  const flags:string[]=[];
  if(original.length>MAX_ANALYSIS_TEXT)flags.push('TEXT_TRUNCATED_FOR_ANALYSIS');
  if(ZERO_WIDTH_AND_BIDI.test(original)){flags.push('UNICODE_CONTROL_REMOVED');ZERO_WIDTH_AND_BIDI.lastIndex=0;}
  if(HTML_TAG.test(original)){flags.push('HTML_REMOVED');HTML_TAG.lastIndex=0;}
  if(PRIVILEGE_CLAIM.test(sanitizedText))flags.push('PRIVILEGE_CLAIM_IN_TEXT');
  if(INJECTION.test(sanitizedText))flags.push('PROMPT_OR_SOCIAL_INJECTION');
  if(CROSS_PARTICIPANT.test(sanitizedText))flags.push('CROSS_PARTICIPANT_DATA_REQUEST');
  if(Number(input.quoteDepth||0)>MAX_QUOTE_DEPTH)flags.push('QUOTE_DEPTH_EXCEEDED');
  const media=String(input.mediaKind||'none');
  const unsupportedMedia=!['none','image','video','audio','document','unknown'].includes(media)||(!sanitizedText&&media!=='none');
  if(unsupportedMedia)flags.push('UNSUPPORTED_MEDIA_REQUIRES_REVIEW');
  const blocked=flags.includes('QUOTE_DEPTH_EXCEEDED');
  const forceReview=blocked||unsupportedMedia||flags.some((flag)=>['PRIVILEGE_CLAIM_IN_TEXT','PROMPT_OR_SOCIAL_INJECTION','CROSS_PARTICIPANT_DATA_REQUEST'].includes(flag));
  return{
    sanitizedText,
    digest:crypto.createHash('sha256').update(sanitizedText).digest('hex'),
    flags,
    blocked,
    forceReview,
    unsupportedMedia,
    originalLength:original.length
  };
}

export function classifyUntrustedConversation(input:{text:string;mediaKind?:string|null;quoteDepth?:number;participantId?:string|null}):{assessment:ConversationAbuseAssessment;result:IntentResult}{
  const assessment=assessConversationInput(input);
  if(assessment.forceReview){
    return{
      assessment,
      result:{intent:'conversational_security_review',risk:'review',confidence:1,suggestion:'El mensaje requiere revisión segura del operador. No se aplicó ninguna operación.',autoEligible:false,reason:`APPSEC:${assessment.flags.join(',')||'UNTRUSTED_INPUT'}`,entities:{}}
    };
  }
  return{assessment,result:classify(assessment.sanitizedText)};
}

export function safePublicAbuseMetadata(assessment:ConversationAbuseAssessment,rate?:RateCheck|null){
  return{flags:assessment.flags,blocked:assessment.blocked,forceReview:assessment.forceReview,unsupportedMedia:assessment.unsupportedMedia,originalLength:assessment.originalLength,analysisLength:assessment.sanitizedText.length,digest:assessment.digest,rateLimited:rate? !rate.allowed:false,rateReason:rate?.reason||null};
}
