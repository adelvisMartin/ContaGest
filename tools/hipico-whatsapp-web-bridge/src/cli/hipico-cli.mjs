import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliArgs, CLI_USAGE } from './command-parser.mjs';
import { createCliEnvelope, formatCliOutput } from './output.mjs';
import { createCliRuntimeServices } from './runtime-services.mjs';

const HANDLERS = Object.freeze({
  status: (services) => services.status(),
  doctor: (services) => services.doctor(),
  health: (services) => services.health(),
  version: (services) => services.version(),
  'bridge status': (services) => services.bridgeStatus(),
  'channel status': (services) => services.channelStatus(),
  groups: (services) => services.groups(),
  'messages tail': (services, parsed) => services.messagesTail({ limit: parsed.limit }),
  'events tail': (services, parsed) => services.eventsTail({ limit: parsed.limit }),
  trace: (services, parsed) => services.trace({ correlationId: parsed.correlationId })
});

function safeCommandFromArgv(argv) {
  return Array.isArray(argv) && argv.length ? String(argv[0]).slice(0, 80) : 'usage';
}

export async function runCli(argv = [], services = createCliRuntimeServices()) {
  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    const envelope = createCliEnvelope({
      ok: false,
      command: safeCommandFromArgv(argv),
      error,
      data: { usage: CLI_USAGE }
    });
    const json = Array.isArray(argv) && argv.includes('--json');
    return { exitCode: 2, envelope, output: formatCliOutput(envelope, { json }) };
  }

  try {
    const handler = HANDLERS[parsed.command];
    if (!handler) throw Object.assign(new Error('Comando Hípico no implementado.'), { code: 'HIPICO_CLI_COMMAND_NOT_IMPLEMENTED' });
    const data = await handler(services, parsed);
    const envelope = createCliEnvelope({ ok: true, command: parsed.command, data });
    return { exitCode: 0, envelope, output: formatCliOutput(envelope, { json: parsed.json }) };
  } catch (error) {
    const envelope = createCliEnvelope({ ok: false, command: parsed.command, error });
    return { exitCode: 1, envelope, output: formatCliOutput(envelope, { json: parsed.json }) };
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  const result = await runCli(process.argv.slice(2));
  const stream = result.exitCode === 0 ? process.stdout : process.stderr;
  stream.write(result.output);
  process.exitCode = result.exitCode;
}
