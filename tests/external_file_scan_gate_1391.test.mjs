import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const scanner = read('backend/src/shared/security/external-file-scan.ts');
const media = read('backend/src/modules/media/media.routes.ts');
const imports = read('backend/src/modules/imports/imports.routes.ts');
const importClient = read('frontend/src/services/dataImportService.js');
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
