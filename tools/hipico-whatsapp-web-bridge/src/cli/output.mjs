import { redactDiagnostic } from '../observability.mjs';

function normalizedError(error) {
  if (!error) return null;
  const code = String(error?.code || 'HIPICO_CLI_ERROR').slice(0, 120);
  const message = String(error?.message || error || 'Error operativo Hípico.').slice(0, 500);
  return redactDiagnostic({ code, message });
}

export function createCliEnvelope({ ok, command, data = null, error = null }) {
  return Object.freeze({
    schemaVersion: 1,
    ok: Boolean(ok),
    command: String(command || 'unknown').slice(0, 120),
    data: data == null ? null : redactDiagnostic(data),
    error: normalizedError(error)
  });
}

export function formatCliOutput(envelope, { json = false } = {}) {
  const safe = createCliEnvelope(envelope);
  if (json) return `${JSON.stringify(safe)}\n`;
  if (!safe.ok) return `ERROR ${safe.error?.code || 'HIPICO_CLI_ERROR'}: ${safe.error?.message || 'Operación fallida.'}\n`;
  if (safe.command === 'version' && safe.data?.version) return `Control Hípico Bridge ${safe.data.version}\n`;
  if (safe.data && typeof safe.data === 'object') return `${JSON.stringify(safe.data, null, 2)}\n`;
  return `${String(safe.data ?? 'OK')}\n`;
}
