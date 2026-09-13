import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { hipicoRuntimeSecretConfigured } from '../hipico-bot/hipico-secret-security.js';
import type { PdfTextExtractor } from './document-engine.js';

export const HIPICO_ANYDOC_VERSION='0.2.4';
const MAX_ANYDOC_OUTPUT_BYTES=2*1024*1024;
const execFileAsync=promisify(execFile);
type RuntimeEnv=Record<string,string|undefined>|NodeJS.ProcessEnv;
type Runner=(command:string,args:string[],options:any)=>Promise<{stdout:string;stderr:string}>;
type Probe=()=>{available:boolean;version:string|null};
type Exists=(candidate:string)=>boolean;

function codedError(code:string){return Object.assign(new Error(code),{code});}
export function resolveAnyDocBin(env:RuntimeEnv=process.env,cwd=process.cwd(),exists:Exists=existsSync){
  const explicit=String(env.HIPICO_ANYDOC_BIN||'').trim();if(explicit)return explicit;
  const executable=process.platform==='win32'?'anydoc.cmd':'anydoc';
  const candidates=[
    path.resolve(cwd,'.tools','hipico-anydoc','node_modules','.bin',executable),
    path.resolve(cwd,'..','.tools','hipico-anydoc','node_modules','.bin',executable)
  ];
  return candidates.find((candidate)=>exists(candidate))||'anydoc';
}
function hostedOcrEnabled(env:RuntimeEnv){return String(env.HIPICO_DOCUMENT_ANYDOC_HOSTED_OCR_ENABLED||'').trim().toLowerCase()==='true'&&hipicoRuntimeSecretConfigured(env.FIRECRAWL_API_KEY);}

export function probeAnyDoc(env:RuntimeEnv=process.env){
  const bin=resolveAnyDocBin(env);
  if(!bin)return{available:false,version:null};
  try{
    const result=spawnSync(bin,['--version'],{encoding:'utf8',shell:false,timeout:2500,windowsHide:true});
    if(result.error||result.status!==0)return{available:false,version:null};
    const version=String(result.stdout||'').trim();
    return{available:version===HIPICO_ANYDOC_VERSION,version:version||null};
  }catch{return{available:false,version:null};}
}

async function defaultRunner(command:string,args:string[],options:any){
  const result=await execFileAsync(command,args,options);
  return{stdout:String(result.stdout||''),stderr:String(result.stderr||'')};
}

function exitCode(error:any){const raw=error?.exitCode??error?.code;const value=Number(raw);return Number.isFinite(value)?value:null;}
function mapAnyDocError(error:any){
  if(error?.name==='AbortError'||error?.code==='ABORT_ERR')return codedError('HIPICO_DOCUMENT_EXTRACTION_TIMEOUT');
  if(exitCode(error)===3)return codedError('HIPICO_DOCUMENT_OCR_NOT_CONFIGURED');
  return codedError('HIPICO_DOCUMENT_ANYDOC_CONVERSION_FAILED');
}

export function createAnyDocDocumentExtractor(env:RuntimeEnv=process.env,runner:Runner=defaultRunner,probe:Probe=()=>probeAnyDoc(env)):PdfTextExtractor|null{
  const binary=resolveAnyDocBin(env);const detected=probe();
  if(!binary||!detected.available||detected.version!==HIPICO_ANYDOC_VERSION)return null;
  const hosted=hostedOcrEnabled(env);
  return{
    capability:()=>({configured:true,nativeText:true,ocr:hosted,parserVersion:`anydoc@${HIPICO_ANYDOC_VERSION}`}),
    async extract(pdf:Buffer,signal:AbortSignal){
      if(signal.aborted)throw Object.assign(new Error('Aborted'),{name:'AbortError',code:'ABORT_ERR'});
      const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-anydoc-'));
      const input=path.join(dir,'document.pdf');
      try{
        await fs.writeFile(input,pdf,{mode:0o600});
        const args=[input,'--format','pdf'];
        if(hosted)args.push('--ocr','hosted');
        let output:{stdout:string;stderr:string};
        try{
          output=await runner(binary,args,{
            encoding:'utf8',shell:false,windowsHide:true,timeout:7500,maxBuffer:MAX_ANYDOC_OUTPUT_BYTES,signal,
            env:{...process.env,...env,FIRECRAWL_API_KEY:hosted?String(env.FIRECRAWL_API_KEY||''):undefined}
          });
        }catch(error){throw mapAnyDocError(error);}
        const text=String(output.stdout||'').trim();
        if(!text)throw codedError('HIPICO_DOCUMENT_ANYDOC_CONVERSION_FAILED');
        return{text,method:hosted?'ocr' as const:'native_text' as const,parserVersion:`anydoc@${HIPICO_ANYDOC_VERSION}`};
      }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
    }
  };
}

export function createPreferredDocumentExtractor(fallback:PdfTextExtractor|null,env:RuntimeEnv=process.env,runner:Runner=defaultRunner,probe:Probe=()=>probeAnyDoc(env)):PdfTextExtractor{
  const anydoc=createAnyDocDocumentExtractor(env,runner,probe);
  if(!anydoc){
    if(fallback)return fallback;
    return{capability:()=>({configured:false,nativeText:false,ocr:false,parserVersion:'none',reason:'ANYDOC_AND_FALLBACK_NOT_CONFIGURED'}),async extract(){throw codedError('HIPICO_DOCUMENT_EXTRACTOR_NOT_CONFIGURED');}};
  }
  if(!fallback)return anydoc;
  return{
    capability:()=>{const primary=anydoc.capability(),secondary=fallback.capability();return{configured:primary.configured||secondary.configured,nativeText:primary.nativeText||secondary.nativeText,ocr:primary.ocr||secondary.ocr,parserVersion:`${primary.parserVersion}+fallback:${secondary.parserVersion}`};},
    async extract(pdf,signal){
      try{return await anydoc.extract(pdf,signal);}catch(error:any){
        if(error?.code==='HIPICO_DOCUMENT_OCR_NOT_CONFIGURED'&&fallback.capability().ocr)return fallback.extract(pdf,signal);
        throw error;
      }
    }
  };
}

export function anyDocCapability(env:RuntimeEnv=process.env){
  const probe=probeAnyDoc(env);const hosted=hostedOcrEnabled(env);
  return{configured:probe.available&&probe.version===HIPICO_ANYDOC_VERSION,nativeText:probe.available&&probe.version===HIPICO_ANYDOC_VERSION,ocr:probe.available&&probe.version===HIPICO_ANYDOC_VERSION&&hosted,parserVersion:probe.available?`anydoc@${probe.version}`:null,requiredVersion:HIPICO_ANYDOC_VERSION,hostedOcrEnabled:hosted,binary:resolveAnyDocBin(env)};
}
