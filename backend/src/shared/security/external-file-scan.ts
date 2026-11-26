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
const CLEAN_REPLY = Buffer.from('stream: OK\0');

/** Classify a complete zINSTREAM reply at EOF; null is the only clean verdict. */
export function classifyExternalFileScanReply(reply: Buffer): ExternalFileScanCode | null {
  if (reply.length === 0) return 'EXTERNAL_FILE_SCAN_UNAVAILABLE';
  if (reply.length > MAX_RESPONSE_BYTES || reply.indexOf(0) !== reply.length - 1) {
    return 'EXTERNAL_FILE_SCAN_REJECTED';
  }
  if (reply.equals(CLEAN_REPLY)) return null;
  // A signature is diagnostic only; never return its contents to callers.
  const text = reply.subarray(0, -1).toString('latin1');
  return /^stream: [\x20-\x7e]{1,400} FOUND$/.test(text)
    ? 'EXTERNAL_FILE_MALWARE_DETECTED'
    : 'EXTERNAL_FILE_SCAN_REJECTED';
}

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
    const reply = Buffer.alloc(MAX_RESPONSE_BYTES);
    let replyLength = 0;
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
    socket.on('end', () => {
      if (settled) return;
      const code = requestComplete
        ? classifyExternalFileScanReply(reply.subarray(0, replyLength))
        : 'EXTERNAL_FILE_SCAN_UNAVAILABLE';
      complete(code === null ? undefined : new ExternalFileScanError(code));
    });
    socket.on('close', () => {
      if (!settled) complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_UNAVAILABLE'));
    });
    socket.on('data', (chunk: Buffer) => {
      if (settled) return;
      if (!requestComplete || replyLength + chunk.length > MAX_RESPONSE_BYTES || chunk.includes(10)) {
        return complete(new ExternalFileScanError('EXTERNAL_FILE_SCAN_REJECTED'));
      }
      // One bounded allocation; no repeated concatenation for fragmented TCP replies.
      chunk.copy(reply, replyLength);
      replyLength += chunk.length;
      // Wait for EOF: extra frames may arrive in later TCP chunks.
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
