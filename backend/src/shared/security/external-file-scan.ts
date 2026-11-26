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
    let requestComplete = false;
    let reply = Buffer.alloc(0);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const complete = (error?: ExternalFileScanError) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    deadline = setTimeout(() => complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_UNAVAILABLE')), timeoutMs);
    socket.setTimeout(timeoutMs, () => complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_UNAVAILABLE')));
    socket.on('error', () => complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_UNAVAILABLE')));
    const finishReply = () => {
      const terminator = reply.indexOf(0);
      // zINSTREAM uses exactly one NUL-terminated response on a single-command connection.
      if (!requestComplete || terminator < 0 || terminator !== reply.length - 1) {
        return complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_REJECTED'));
      }
      const text = reply.subarray(0, terminator).toString('utf8');
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
      // Wait for EOF before accepting a verdict: extra frames may arrive in later TCP chunks.
      if (!requestComplete || reply.includes(10)) {
        return complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_REJECTED'));
      }
    });
    socket.on('connect', () => {
      let offset = 0;
      const sendNext = () => {
        while (!settled && offset < bytes.length) {
          const slice = bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
          const frame = Buffer.allocUnsafe(4 + slice.length);
          frame.writeUInt32BE(slice.length, 0);
          slice.copy(frame, 4);
          offset += slice.length;
          // Do not buffer entire clinical files for concurrent scanner requests.
          if (!socket.write(frame)) { socket.once('drain', sendNext); return; }
        }
        if (!settled) {
          requestComplete = true;
          socket.write(Buffer.alloc(4)); // End of INSTREAM.
        }
      };
      socket.write(Buffer.from('zINSTREAM\0'), sendNext);
    });
  });
}
