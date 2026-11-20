import { connect } from 'node:net';

/**
 * Private, in-memory ClamAV INSTREAM gate for externally supplied bytes.
 * ClamAV must listen only on loopback; never upload patient data to public scanners.
 */
export type ExternalFileScanCode =
  | 'EXTERNAL_FILE_SCAN_UNAVAILABLE'
  | 'EXTERNAL_FILE_MALWARE_DETECTED'
  | 'EXTERNAL_FILE_SCAN_REJECTED'
  | 'EXTERNAL_FILE_SCAN_INVALID';

export class ExternalFileScanError extends Error {
  readonly status: number;
  readonly code: ExternalFileScanCode;
  constructor(code: ExternalFileScanCode) {
    super(code);
    this.code = code;
    this.name = 'ExternalFileScanError';
    this.status = code === 'EXTERNAL_FILE_SCAN_UNAVAILABLE' ? 503 : 422;
  }
}

const MAX_SCAN_BYTES = 15 * 1024 * 1024;
const CHUNK_SIZE = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024;
const DEFAULT_PORT = 3310;

function scannerPort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  if (!/^\d{1,5}$/.test(value)) throw new ExternalFileScanError('EXTERNAL_FILE_SCAN_UNAVAILABLE');
  const port = Number(value);
  if (port < 1 || port > 65535) throw new ExternalFileScanError('EXTERNAL_FILE_SCAN_UNAVAILABLE');
  return port;
}

/**
 * A timeout, disconnect, malformed response, malware hit or scanner error
 * blocks storage, parsing and extraction. Clean != proof of file safety.
 */
export async function scanExternalFile(
  bytes: Buffer,
  options: { port?: number; timeoutMs?: number } = {},
): Promise<void> {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_SCAN_BYTES) {
    throw new ExternalFileScanError('EXTERNAL_FILE_SCAN_INVALID');
  }
  const port = options.port ?? scannerPort(process.env.CONTAGEST_CLAMD_PORT);
  const timeoutMs = options.timeoutMs ?? 8000;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new ExternalFileScanError('EXTERNAL_FILE_SCAN_UNAVAILABLE');
  }

  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    let settled = false;
    let reply = Buffer.alloc(0);
    const complete = (error?: ExternalFileScanError) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(timeoutMs, () => complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_UNAVAILABLE')));
    socket.on('error', () => complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_UNAVAILABLE')));
    const finishReply = () => {
      const terminator = reply.indexOf(0);
      const text = reply.subarray(0, terminator < 0 ? reply.length : terminator).toString('utf8').trim();
      if (text === 'stream: OK') return complete();
      if (/^stream: [^\r\n\u0000]{1,400} FOUND$/.test(text)) {
        return complete(new ExternalFileScanError('EXTERNAL_FILE_MALWARE_DETECTED'));
      }
      complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_REJECTED'));
    };
    socket.on('end', () => {
      if (!settled) {
        if (!reply.length) complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_UNAVAILABLE'));
        else finishReply();
      }
    });
    socket.on('close', () => {
      if (!settled) complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_UNAVAILABLE'));
    });
    socket.on('data', (chunk: Buffer) => {
      if (settled) return;
      if (reply.length + chunk.length > MAX_RESPONSE_BYTES) {
        return complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_REJECTED'));
      }
      reply = Buffer.concat([reply, chunk]);
      if (reply.includes(0) || reply.includes(10)) finishReply();
    });
    socket.on('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0'));
      for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        const slice = bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
        const header = Buffer.allocUnsafe(4);
        header.writeUInt32BE(slice.length, 0);
        socket.write(header);
        socket.write(slice);
      }
      socket.write(Buffer.alloc(4)); // Complete INSTREAM, remain open for verdict.
    });
  });
}
