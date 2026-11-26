import assert from 'node:assert/strict';
import test from 'node:test';
import { scanExternalFile, ExternalFileScanError } from './external-file-scan.ts';

// This suite intentionally has no mock or skip: clamd with official signatures
// must already be listening on loopback. EICAR is a harmless standard test file.
test('real clamd accepts benign bytes and rejects the EICAR test vector', async () => {
  await scanExternalFile(Buffer.from('ContaGest isolated scanner smoke: benign text'));
  const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-' + 'STANDARD-ANTIVIRUS-TEST-FILE!$H+H*', 'ascii');
  assert.equal(eicar.length, 68);
  await assert.rejects(scanExternalFile(eicar), error =>
    error instanceof ExternalFileScanError && error.code === 'EXTERNAL_FILE_MALWARE_DETECTED');
  await scanExternalFile(Buffer.from('Clean after rejection'));
});
