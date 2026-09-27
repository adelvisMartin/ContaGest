import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_TOOL_DEPTH = 8;
const DEFAULT_ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[-_]?key|prompt|raw[_-]?body)/i;
const SCOPE_KEY = /^(tenantId|ownerId|organizationId|companyId)$/i;

export type SecurityScope = {
  tenantId: string;
  ownerId?: string | null;
};

export type UploadEnvelope = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

function securityError(message: string, code: string) {
  return Object.assign(new Error(message), { code });
}

function normalizedId(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function assertTenantScope(authenticated: SecurityScope, requested: SecurityScope) {
  const authTenant = normalizedId(authenticated.tenantId);
  const requestedTenant = normalizedId(requested.tenantId);
  if (!authTenant || !requestedTenant || authTenant !== requestedTenant) {
    throw securityError('Tenant boundary violation.', 'SECURITY_TENANT_SCOPE_MISMATCH');
  }
  const authOwner = normalizedId(authenticated.ownerId);
  const requestedOwner = normalizedId(requested.ownerId);
  if (requestedOwner && (!authOwner || authOwner !== requestedOwner)) {
    throw securityError('Owner boundary violation.', 'SECURITY_OWNER_SCOPE_MISMATCH');
  }
  return true;
}

function ipv4Private(ip: string) {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224;
}

function ipBlocked(ip: string) {
  const family = net.isIP(ip);
  if (family === 4) return ipv4Private(ip);
  if (family === 6) {
    const value = ip.toLowerCase();
    return value === '::1'
      || value === '::'
      || value.startsWith('fc')
      || value.startsWith('fd')
      || value.startsWith('fe8')
      || value.startsWith('fe9')
      || value.startsWith('fea')
      || value.startsWith('feb')
      || value.startsWith('::ffff:127.')
      || value.startsWith('::ffff:10.')
      || value.startsWith('::ffff:192.168.')
      || value.startsWith('::ffff:169.254.');
  }
  return true;
}

function hostAllowed(hostname: string, allowedHosts: readonly string[]) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return allowedHosts.some((candidate) => {
    const allowed = String(candidate || '').trim().toLowerCase().replace(/\.$/, '');
    return Boolean(allowed) && (host === allowed || host.endsWith(`.${allowed}`));
  });
}

export function validateProviderUrl(rawUrl: string, allowedHosts: readonly string[]) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw securityError('Provider URL is invalid.', 'SECURITY_PROVIDER_URL_INVALID');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw securityError('Provider URL must use HTTPS without embedded credentials.', 'SECURITY_PROVIDER_URL_FORBIDDEN');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw securityError('Local provider targets are forbidden.', 'SECURITY_PROVIDER_SSRF_BLOCKED');
  }
  if (!hostAllowed(hostname, allowedHosts)) {
    throw securityError('Provider host is not allowlisted.', 'SECURITY_PROVIDER_HOST_NOT_ALLOWED');
  }
  if (net.isIP(hostname) && ipBlocked(hostname)) {
    throw securityError('Private or metadata provider targets are forbidden.', 'SECURITY_PROVIDER_SSRF_BLOCKED');
  }
  return url;
}

export async function assertProviderUrlResolvesPublic(rawUrl: string, allowedHosts: readonly string[]) {
  const url = validateProviderUrl(rawUrl, allowedHosts);
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => ipBlocked(entry.address))) {
    throw securityError('Provider hostname resolved to a non-public address.', 'SECURITY_PROVIDER_DNS_REBIND_BLOCKED');
  }
  return url;
}

function hasMagic(bytes: Uint8Array, prefix: number[]) {
  return prefix.every((value, index) => bytes[index] === value);
}

function detectedMime(bytes: Uint8Array) {
  if (hasMagic(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (hasMagic(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (hasMagic(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (hasMagic(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'application/zip';
  return 'application/octet-stream';
}

export function validateUploadEnvelope(input: UploadEnvelope, allowedMime = DEFAULT_ALLOWED_MIME) {
  const filename = String(input.filename || '').trim();
  if (!filename || filename !== path.basename(filename) || filename.includes('..') || /[\\/\0]/.test(filename)) {
    throw securityError('Untrusted upload filename/path.', 'SECURITY_UPLOAD_PATH_INVALID');
  }
  if (!input.bytes?.byteLength || input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw securityError('Upload exceeds the allowed size or is empty.', 'SECURITY_UPLOAD_SIZE_INVALID');
  }
  const declared = String(input.mimeType || '').trim().toLowerCase();
  const detected = detectedMime(input.bytes);
  if (!allowedMime.has(declared) || declared !== detected) {
    throw securityError('Upload MIME does not match trusted content sniffing.', 'SECURITY_UPLOAD_MIME_MISMATCH');
  }
  if (detected === 'application/zip') {
    throw securityError('Archive uploads require an explicit bounded extraction pipeline.', 'SECURITY_UPLOAD_ARCHIVE_FORBIDDEN');
  }
  return { filename, mimeType: detected, size: input.bytes.byteLength };
}

function inspectScopedArgs(value: unknown, scope: SecurityScope, depth = 0): void {
  if (depth > MAX_TOOL_DEPTH) throw securityError('Tool arguments exceed inspection depth.', 'SECURITY_TOOL_ARGS_TOO_DEEP');
  if (Array.isArray(value)) {
    for (const entry of value) inspectScopedArgs(entry, scope, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SCOPE_KEY.test(key)) {
      if (/tenant|organization|company/i.test(key) && normalizedId(child) !== normalizedId(scope.tenantId)) {
        throw securityError('Tool arguments cross tenant scope.', 'SECURITY_TOOL_TENANT_SCOPE_MISMATCH');
      }
      if (/owner/i.test(key) && normalizedId(scope.ownerId) && normalizedId(child) !== normalizedId(scope.ownerId)) {
        throw securityError('Tool arguments cross owner scope.', 'SECURITY_TOOL_OWNER_SCOPE_MISMATCH');
      }
    }
    inspectScopedArgs(child, scope, depth + 1);
  }
}

export function assertAgentToolCall(input: {
  toolName: string;
  allowedTools: readonly string[];
  args: unknown;
  scope: SecurityScope;
  financialAuthority: boolean;
}) {
  if (input.financialAuthority) {
    throw securityError('Agents cannot hold financial authority.', 'SECURITY_AGENT_FINANCIAL_AUTHORITY_FORBIDDEN');
  }
  if (!input.allowedTools.includes(input.toolName)) {
    throw securityError('Agent tool is not allowlisted.', 'SECURITY_AGENT_TOOL_NOT_ALLOWED');
  }
  inspectScopedArgs(input.args, input.scope);
  return true;
}

export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > MAX_TOOL_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => sanitizeAuditMetadata(entry, depth + 1));
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 1000) : value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeAuditMetadata(child, depth + 1);
  }
  return output;
}

export const __test__ = { ipBlocked, hostAllowed, detectedMime, inspectScopedArgs };
