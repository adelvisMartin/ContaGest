import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:net';
import { scanExternalFile, ExternalFileScanError } from './external-file-scan.js';

// Synthetic ClamAV protocol fixture: no real patient bytes or network provider.
async function withDaemon(reply: string, exercise: (port: number) => Promise<void>, options: { closeEarly?: boolean; keepOpen?: boolean; splitReply?: boolean } = {}) {
  const server = createServer(socket => {
    let received = Buffer.alloc(0);
    socket.on('data', part => {
      received = Buffer.concat([received, part]);
      if (received.length < 10 || received.subarray(0, 10).toString() !== 'zINSTREAM\0') return;
      let cursor = 10, complete = false;
      while (cursor + 4 <= received.length) {
        const n = received.readUInt32BE(cursor);
        if (n === 0) { complete = true; break; }
        if (cursor + 4 + n > received.length) break;
        cursor += 4 + n;
      }
      if (complete) {
        if (options.closeEarly) socket.destroy();
        else if (options.keepOpen) socket.write(Buffer.from(reply));
        else if (options.splitReply) socket.write(Buffer.from(reply.slice(0, 5)), () => socket.end(Buffer.from(reply.slice(5))));
        else socket.end(Buffer.from(reply));
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try { await exercise(port); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
const content = Buffer.from('synthetic-test-only-payload');
const matches = (code: string) => (error: unknown) => error instanceof ExternalFileScanError && error.code === code;

test('explicit ClamAV clean verdict permits processing', async () => {
  await withDaemon('stream: OK\0', port => scanExternalFile(content, { port, timeoutMs: 1000 }));
});
test('malware verdict is blocked before persistence', async () => {
  await withDaemon('stream: Eicar-Test-Signature FOUND\0', async port => {
    await assert.rejects(scanExternalFile(content, { port, timeoutMs: 1000 }), matches('EXTERNAL_FILE_MALWARE_DETECTED'));
  });
});
test('scanner error, size-limit and unknown verdict are fail closed', async () => {
  for (const response of ['stream: INSTREAM size limit exceeded. ERROR\0', 'stream: CLEAN\0']) {
    await withDaemon(response, async port => {
      await assert.rejects(scanExternalFile(content, { port, timeoutMs: 1000 }), matches('EXTERNAL_FILE_SCAN_REJECTED'));
    });
  }
});
test('disconnect and unavailable daemon never return a clean verdict', async () => {
  await withDaemon('', async port => {
    await assert.rejects(scanExternalFile(content, { port, timeoutMs: 1000 }), matches('EXTERNAL_FILE_SCAN_UNAVAILABLE'));
  }, { closeEarly: true });
});
test('empty and oversized inputs never reach the scanner', async () => {
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(15 * 1024 * 1024 + 1)]) {
    await assert.rejects(scanExternalFile(bytes), matches('EXTERNAL_FILE_SCAN_INVALID'));
  }
});

test('truncated, newline-framed, padded and contradictory clean replies are rejected', async () => {
  for (const response of ['stream: OK', 'stream: OK\n', ' stream: OK\0', 'stream: OK\0stream: Threat FOUND\0']) {
    await withDaemon(response, async port => {
      await assert.rejects(scanExternalFile(content, { port, timeoutMs: 1000 }), matches('EXTERNAL_FILE_SCAN_REJECTED'));
    });
  }
});

test('fragmented verdict after a multi-frame request is accepted', async () => {
  await withDaemon('stream: OK\0', port => scanExternalFile(Buffer.alloc(256 * 1024, 65), { port, timeoutMs: 1000 }), { splitReply: true });
});
test('a clean-looking verdict without connection completion times out', async () => {
  await withDaemon('stream: OK\0', async port => {
    await assert.rejects(scanExternalFile(content, { port, timeoutMs: 150 }), matches('EXTERNAL_FILE_SCAN_UNAVAILABLE'));
  }, { keepOpen: true });
});
test('oversized response is rejected', async () => {
  await withDaemon('stream: ' + 'X'.repeat(1024) + '\0', async port => {
    await assert.rejects(scanExternalFile(content, { port, timeoutMs: 1000 }), matches('EXTERNAL_FILE_SCAN_REJECTED'));
  });
});
