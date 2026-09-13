function usage(message = 'Comando Hípico inválido.') {
  const error = new Error(message);
  error.code = 'HIPICO_CLI_USAGE';
  throw error;
}

function normalizeLimit(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 200) usage('--limit debe ser un entero entre 1 y 200.');
  return value;
}

export function parseCliArgs(input = []) {
  if (!Array.isArray(input)) usage('Los argumentos del CLI deben ser una lista.');
  const argv = input.map((value) => String(value));
  let json = false;
  let explicitLimit = null;
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      if (json) usage('--json no puede repetirse.');
      json = true;
      continue;
    }
    if (token === '--limit') {
      if (explicitLimit !== null || index + 1 >= argv.length) usage('--limit requiere un valor único.');
      explicitLimit = normalizeLimit(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token.startsWith('--limit=')) {
      if (explicitLimit !== null) usage('--limit no puede repetirse.');
      explicitLimit = normalizeLimit(token.slice('--limit='.length));
      continue;
    }
    if (token.startsWith('--')) usage(`Opción no reconocida: ${token}`);
    positional.push(token);
  }

  if (!positional.length) usage();
  const one = positional[0];
  const two = positional.slice(0, 2).join(' ');
  const simple = new Set(['status', 'doctor', 'health', 'version', 'groups']);
  let command = null;
  let correlationId = null;

  if (simple.has(one) && positional.length === 1) command = one;
  else if (['bridge status', 'channel status', 'messages tail', 'events tail'].includes(two) && positional.length === 2) command = two;
  else if (one === 'trace' && positional.length === 2) {
    correlationId = positional[1];
    if (!/^[A-Za-z0-9._:-]{3,160}$/.test(correlationId)) usage('correlationId no es válido.');
    command = 'trace';
  } else usage();

  const isTail = command === 'messages tail' || command === 'events tail';
  if (explicitLimit !== null && !isTail) usage('--limit sólo aplica a messages tail o events tail.');

  return Object.freeze({
    command,
    json,
    ...(isTail ? { limit: explicitLimit ?? 20 } : {}),
    ...(correlationId ? { correlationId } : {})
  });
}

export const CLI_USAGE = Object.freeze([
  'hipico status',
  'hipico doctor',
  'hipico health',
  'hipico version',
  'hipico bridge status',
  'hipico channel status',
  'hipico groups',
  'hipico messages tail [--limit 1..200]',
  'hipico events tail [--limit 1..200]',
  'hipico trace <correlationId>',
  'agrega --json a cualquier comando para salida estable schemaVersion=1'
]);
