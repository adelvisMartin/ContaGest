import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = (path) => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const scanner = read('backend/src/shared/security/external-file-scan.ts');
const media = read('backend/src/modules/media/media.routes.ts');
const imports = read('backend/src/modules/imports/imports.routes.ts');
const importClient = read('frontend/src/services/dataImportService.js');
const bank = read('backend/src/modules/bank-reconciliation/bank-reconciliation.routes.ts');
const payables = read('backend/src/modules/payables/payables.service.ts');
const payableRoutes = read('backend/src/modules/payables/payables.routes.ts');
const hipico = read('backend/src/modules/hipico/document-engine.ts');
const hipicoOperator = read('backend/src/modules/hipico/document.routes.ts');
const hipicoBridge = read('backend/src/modules/hipico-bot/hipico-bridge-document.routes.ts');
const cors = read('backend/src/shared/middleware/security.ts');

test('#1391 scanner is local-only, stream-limited and rejects unknown results', () => {
  assert.match(scanner, /host: '127\.0\.0\.1'/);
  assert.match(scanner, /zINSTREAM/);
  assert.match(scanner, /MAX_SCAN_BYTES = 15 \* 1024 \* 1024/);
  assert.match(scanner, /MAX_RESPONSE_BYTES = 1024/);
  assert.match(scanner, /EXTERNAL_FILE_MALWARE_DETECTED/);
  assert.match(scanner, /EXTERNAL_FILE_SCAN_UNAVAILABLE/);
  assert.match(scanner, /EXTERNAL_FILE_SCAN_REJECTED/);
  assert.doesNotMatch(scanner, /http:|https:|fetch\(/);
});

test('#1391 only authorized, bounded import files reach scanner', () => {
  assert.match(imports, /router\.use\(requireTenant, requirePermission\('admin\.manage'\)\)/);
  assert.match(imports, /router\.post\('\/file-scan'/);
  assert.match(imports, /express\.raw\(\{ type: 'application\/octet-stream', limit: FILE_SCAN_LIMIT_BYTES \}\)/);
  assert.match(imports, /createHash\('sha256'\)/);
  assert.match(cors, /X-Import-Filename/);
  const parseFile=importClient.split('async parseFile(file, type)')[1].split('validateRows(')[0];
  assert.ok(parseFile.includes("BackendApi.request('/imports/file-scan'"));
  assert.ok(parseFile.includes("if(name.endsWith('.xlsx'))"));
  assert.ok(parseFile.indexOf("BackendApi.request('/imports/file-scan'") < parseFile.indexOf("if(name.endsWith('.xlsx'))"));
  assert.match(parseFile, /await BackendApi\.request/);
});

test('#1391 clinical media and Hípico block bytes before persistence/extraction', () => {
  assert.match(media, /await scanExternalFile\(image\.bytes\)/);
  assert.match(media, /assertPassiveClinicalPdf\(bytes,mime\)/);
  assert.match(media, /await scanExternalFile\(bytes\)/);
  const ingest=hipico.split('async ingest(')[1].split('async reprocessExisting(')[0];
  assert.ok(ingest.indexOf('await this.scan(input.pdf)') < ingest.indexOf('await this.store.put('));
  const reprocess=hipico.split('async reprocessExisting(')[1];
  assert.ok(reprocess.indexOf('await this.scan(pdf)') < reprocess.indexOf('await this.store.getAuthority('));
  for (const route of [hipicoOperator, hipicoBridge]) {
    assert.match(route, /EXTERNAL_FILE_SCAN_UNAVAILABLE/);
    assert.match(route, /EXTERNAL_FILE_MALWARE_DETECTED/);
  }
});

test('#1391 imported bank statements are scanned before any financial ingest',()=>{
  assert.match(bank,/requirePermission\('banking\.manage'\)/);
  assert.match(bank,/await scanExternalFile\(upload\.bytes\)/);
  const handler=bank.split("router.post('/imports'")[1];
  assert.ok(handler.includes('await scanExternalFile(upload.bytes)'));
  assert.ok(handler.includes('await importBankStatement('));
  assert.ok(handler.indexOf('await scanExternalFile(upload.bytes)')<handler.indexOf('await importBankStatement('));
});

test('#1391 supplier invoices scan before DB persistence and on reprocessing',()=>{
  assert.match(payableRoutes,/requirePermission\('purchases\.manage'\)/);
  assert.match(payableRoutes,/Content-Disposition',`attachment;/);
  const ingest=payables.split('export async function ingestPayableDocument(')[1].split('export async function processPayableDocument(')[0];
  const reprocess=payables.split('export async function processPayableDocument(')[1].split('export async function listPayableDocuments(')[0];
  assert.ok(ingest.includes('await scanExternalFile(input.bytes)') && ingest.includes('await prisma.$queryRaw'));
  assert.ok(ingest.indexOf('await scanExternalFile(input.bytes)')<ingest.indexOf('await prisma.$queryRaw'));
  assert.ok(reprocess.includes('await scanExternalFile(Buffer.from(document.originalContent))') && reprocess.includes('await prisma.$executeRaw'));
  assert.ok(reprocess.indexOf('await scanExternalFile(Buffer.from(document.originalContent))')<reprocess.indexOf('await prisma.$executeRaw'));
});

test('#1391 import client does not parse a file on missing or malformed scan evidence', async () => {
  const start=importClient.indexOf('  async parseFile(file, type)');
  const end=importClient.indexOf('  validateRows(',start);
  assert.ok(start>=0 && end>start);
  const sha='a'.repeat(64);
  for (const verdict of [undefined, {}, {status:'unknown',sha256:sha}, {status:'clean'}, {status:'clean',sha256:'invalid'}, {status:'clean',sha256:sha}]) {
    let reads=0;
    const {parseFile}=runInNewContext('({' + importClient.slice(start,end) + '})',{
      MAX_FILE_BYTES:5*1024*1024,
      BackendApi:{request:async()=>verdict},
      decoder:new TextDecoder(),
      normalizeRecord:record=>record,
    });
    const file={name:'example.json',size:2,arrayBuffer:async()=>{reads++;return new TextEncoder().encode('[]');}};
    if(verdict?.status==='clean' && verdict.sha256===sha){
      const rows=await parseFile(file,'clients');
      assert.equal(rows.length,0);
      assert.equal(reads,1);
    }else{
      await assert.rejects(parseFile(file,'clients'),/No se pudo validar la seguridad/);
      assert.equal(reads,0);
    }
  }
});

test('#1391 historical payable originals are integrity-checked and rescanned before download', () => {
  const start=payables.indexOf('export async function getPayableContent(');
  const end=payables.indexOf('function mergedField(',start);
  assert.ok(start>=0 && end>start);
  const content=payables.slice(start,end);
  const readAt=content.indexOf('await getDocument(tenantId, id, true)');
  const hashAt=content.indexOf("createHash('sha256').update(bytes).digest('hex')");
  const scanAt=content.indexOf('await scanExternalFile(bytes)');
  const returnAt=content.indexOf('return { bytes,');
  assert.ok(readAt>=0 && hashAt>readAt && scanAt>hashAt && returnAt>scanAt);
});

test('#1391 text and JSON file staging derives rows and provenance from scanned bytes', () => {
  const start=imports.indexOf("router.post('/preview-file'");
  const end=imports.indexOf('const exportTypeSchema',start);
  assert.ok(start>=0 && end>start);
  const route=imports.slice(start,end);
  const scan=route.indexOf('await scanExternalFile(bytes)');
  const parse=route.indexOf('JSON.parse(text)');
  assert.match(route,/parseDelimitedImport\(text,/);
  const schema=route.indexOf('previewSchema.parse');
  const hash=route.indexOf("createHash('sha256').update(bytes)");
  const stage=route.indexOf('await createImportPreview(req,input,sourceSha256)');
  assert.ok(scan>=0 && parse>scan && schema>parse && hash>schema && stage>hash);
  assert.match(importClient,/previewOriginalFile/);
  assert.match(read('frontend/src/pages/DataImportPage.js'),/await DataImportService\.previewOriginalFile\(file,type,duplicatePolicy\)/);
  assert.match(imports,/IMPORT_SOURCE_INTEGRITY_MISMATCH/);
  assert.match(imports,/checksum\(input\.type,input\.templateVersion,[\s\S]*?sourceSha256\)/);
});
