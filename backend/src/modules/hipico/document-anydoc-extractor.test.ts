import test from 'node:test';
import assert from 'node:assert/strict';

async function loadSubject(){
  return import('./document-anydoc-extractor.js').catch(()=>null);
}

test('AnyDoc extractor exists and stays local by default',async()=>{
  const subject=await loadSubject();
  assert.ok(subject,'document-anydoc-extractor must exist');
  const calls:any[]=[];
  const runner=async(command:string,args:string[],options:any)=>{
    calls.push({command,args,options});
    if(args.includes('--version'))return{stdout:'0.2.4\n',stderr:''};
    return{stdout:'# PROGRAMA DE CARRERAS\nHIPODROMO: La Rinconada\nCARRERA 1',stderr:''};
  };
  const extractor=subject.createAnyDocDocumentExtractor({HIPICO_ANYDOC_BIN:'/opt/hipico/anydoc'},runner);
  assert.ok(extractor);
  assert.equal(extractor.capability().configured,true);
  const result=await extractor.extract(Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n'),new AbortController().signal);
  assert.equal(result.method,'native_text');
  assert.equal(result.parserVersion,'anydoc@0.2.4');
  const conversion=calls.find((call)=>!call.args.includes('--version'));
  assert.ok(conversion);
  assert.ok(!conversion.args.includes('hosted'),'hosted OCR must never be implicit');
  assert.equal(conversion.options.shell,false);
});

test('AnyDoc needs-OCR exit maps to local OCR requirement without cloud egress',async()=>{
  const subject=await loadSubject();
  assert.ok(subject);
  const runner=async(_command:string,args:string[])=>{
    if(args.includes('--version'))return{stdout:'0.2.4\n',stderr:''};
    const error:any=new Error('Command failed');error.code=3;error.exitCode=3;error.stderr='anydoc: pages 1 need OCR';throw error;
  };
  const extractor=subject.createAnyDocDocumentExtractor({HIPICO_ANYDOC_BIN:'anydoc'},runner);
  await assert.rejects(extractor.extract(Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n'),new AbortController().signal),(error:any)=>error?.code==='HIPICO_DOCUMENT_OCR_NOT_CONFIGURED');
});

test('AnyDoc hosted OCR requires two explicit switches and never leaks API key in argv',async()=>{
  const subject=await loadSubject();
  assert.ok(subject);
  const calls:any[]=[];
  const runner=async(command:string,args:string[],options:any)=>{calls.push({command,args,options});if(args.includes('--version'))return{stdout:'0.2.4\n',stderr:''};return{stdout:'PIZARRA\nLLEGADA: 2-1-4',stderr:''};};
  const env={HIPICO_ANYDOC_BIN:'anydoc',HIPICO_DOCUMENT_ANYDOC_HOSTED_OCR_ENABLED:'true',FIRECRAWL_API_KEY:'secret-key'};
  const extractor=subject.createAnyDocDocumentExtractor(env,runner);
  await extractor.extract(Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n'),new AbortController().signal);
  const conversion=calls.find((call)=>!call.args.includes('--version'));
  assert.deepEqual(conversion.args.slice(-2),['--ocr','hosted']);
  assert.ok(!conversion.args.includes('secret-key'));
  assert.equal(conversion.options.env.FIRECRAWL_API_KEY,'secret-key');
});

test('AnyDoc rejects an unpinned binary version',async()=>{
  const subject=await loadSubject();
  assert.ok(subject);
  const runner=async()=>({stdout:'0.2.5\n',stderr:''});
  assert.equal(subject.createAnyDocDocumentExtractor({HIPICO_ANYDOC_BIN:'anydoc'},runner),null);
});
