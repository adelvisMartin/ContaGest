import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { PdfTextExtractor } from './document-engine.js';

async function loadSubject(){
  return import('./document-anydoc-extractor.js').catch(()=>null);
}

const pinnedProbe=()=>({available:true,version:'0.2.4'});
const hostedKey='fc-test-key-0123456789abcdef0123456789abcdef';
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n');

test('AnyDoc resolves explicit binary first, then the repo-local pinned toolchain',async()=>{
  const subject=await loadSubject();assert.ok(subject);
  assert.equal(subject.resolveAnyDocBin({HIPICO_ANYDOC_BIN:'/opt/hipico/anydoc'},'/repo',()=>false),'/opt/hipico/anydoc');
  const expected=path.resolve('/repo','.tools','hipico-anydoc','node_modules','.bin',process.platform==='win32'?'anydoc.cmd':'anydoc');
  assert.equal(subject.resolveAnyDocBin({},'/repo',(candidate:string)=>candidate===expected),expected);
  const backendExpected=path.resolve('/repo/backend','..','.tools','hipico-anydoc','node_modules','.bin',process.platform==='win32'?'anydoc.cmd':'anydoc');
  assert.equal(subject.resolveAnyDocBin({},'/repo/backend',(candidate:string)=>candidate===backendExpected),backendExpected);
});

test('AnyDoc extractor exists and stays local by default',async()=>{
  const subject=await loadSubject();
  assert.ok(subject,'document-anydoc-extractor must exist');
  const calls:any[]=[];
  const runner=async(command:string,args:string[],options:any)=>{calls.push({command,args,options});return{stdout:'# PROGRAMA DE CARRERAS\nHIPODROMO: La Rinconada\nCARRERA 1',stderr:''};};
  const extractor=subject.createAnyDocDocumentExtractor({HIPICO_ANYDOC_BIN:'/opt/hipico/anydoc'},runner,pinnedProbe);
  assert.ok(extractor);
  assert.equal(extractor.capability().configured,true);
  const result=await extractor.extract(pdf,new AbortController().signal);
  assert.equal(result.method,'native_text');
  assert.equal(result.parserVersion,'anydoc@0.2.4');
  assert.equal(calls.length,1);
  assert.ok(!calls[0].args.includes('hosted'),'hosted OCR must never be implicit');
  assert.equal(calls[0].options.shell,false);
});

test('AnyDoc needs-OCR exit maps to local OCR requirement without cloud egress',async()=>{
  const subject=await loadSubject();
  assert.ok(subject);
  const runner=async()=>{const error:any=new Error('Command failed');error.code=3;error.exitCode=3;error.stderr='anydoc: pages 1 need OCR';throw error;};
  const extractor=subject.createAnyDocDocumentExtractor({HIPICO_ANYDOC_BIN:'anydoc'},runner,pinnedProbe);
  await assert.rejects(extractor.extract(pdf,new AbortController().signal),(error:any)=>error?.code==='HIPICO_DOCUMENT_OCR_NOT_CONFIGURED');
});

test('preferred AnyDoc extractor falls back to configured local OCR only on needsOcr',async()=>{
  const subject=await loadSubject();
  assert.ok(subject);
  let fallbackCalls=0;
  const fallback:PdfTextExtractor={capability:()=>({configured:true,nativeText:true,ocr:true,parserVersion:'poppler+tesseract'}),async extract(){fallbackCalls+=1;return{text:'PIZARRA\nLLEGADA: 2-1-4',method:'ocr',parserVersion:'poppler+tesseract',pageCount:1};}};
  const runner=async()=>{const error:any=new Error('Command failed');error.code=3;throw error;};
  const extractor=subject.createPreferredDocumentExtractor(fallback,{HIPICO_ANYDOC_BIN:'anydoc'},runner,pinnedProbe);
  const result=await extractor.extract(pdf,new AbortController().signal);
  assert.equal(result.method,'ocr');
  assert.equal(fallbackCalls,1);
});

test('AnyDoc hosted OCR requires two explicit switches and never leaks API key in argv',async()=>{
  const subject=await loadSubject();
  assert.ok(subject);
  const calls:any[]=[];
  const runner=async(command:string,args:string[],options:any)=>{calls.push({command,args,options});return{stdout:'PIZARRA\nLLEGADA: 2-1-4',stderr:''};};
  const env={HIPICO_ANYDOC_BIN:'anydoc',HIPICO_DOCUMENT_ANYDOC_HOSTED_OCR_ENABLED:'true',FIRECRAWL_API_KEY:hostedKey};
  const extractor=subject.createAnyDocDocumentExtractor(env,runner,pinnedProbe);
  await extractor.extract(pdf,new AbortController().signal);
  assert.deepEqual(calls[0].args.slice(-2),['--ocr','hosted']);
  assert.ok(!calls[0].args.includes(hostedKey));
  assert.equal(calls[0].options.env.FIRECRAWL_API_KEY,hostedKey);
});

test('AnyDoc hosted OCR stays disabled when the API key is absent',async()=>{
  const subject=await loadSubject();
  assert.ok(subject);
  const calls:any[]=[];
  const runner=async(command:string,args:string[],options:any)=>{calls.push({command,args,options});return{stdout:'PROGRAMA DE CARRERAS',stderr:''};};
  const extractor=subject.createAnyDocDocumentExtractor({HIPICO_ANYDOC_BIN:'anydoc',HIPICO_DOCUMENT_ANYDOC_HOSTED_OCR_ENABLED:'true'},runner,pinnedProbe);
  await extractor.extract(pdf,new AbortController().signal);
  assert.ok(!calls[0].args.includes('hosted'));
  assert.equal(extractor.capability().ocr,false);
});

test('AnyDoc rejects an unavailable or unpinned binary version',async()=>{
  const subject=await loadSubject();
  assert.ok(subject);
  const runner=async()=>({stdout:'unused',stderr:''});
  assert.equal(subject.createAnyDocDocumentExtractor({HIPICO_ANYDOC_BIN:'anydoc'},runner,()=>({available:true,version:'0.2.5'})),null);
  assert.equal(subject.createAnyDocDocumentExtractor({HIPICO_ANYDOC_BIN:'anydoc'},runner,()=>({available:false,version:null})),null);
});
