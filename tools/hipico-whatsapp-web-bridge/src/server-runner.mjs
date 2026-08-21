import { spawn } from 'node:child_process';

const SERVICE = 'control-hipico-whatsapp-bridge';
let child = null;
let stopping = false;

function emit(level, message, extra = {}) {
  const line = String(message ?? '').trim();
  if (!line) return;
  process.stdout.write(`${JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: SERVICE,
    message: line.slice(0, 4000),
    ...extra
  })}\n`);
}

function pipeLines(stream, level) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      emit(level, buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  });
  stream.on('end', () => emit(level, buffer));
}

function forward(signal) {
  if (stopping) return;
  stopping = true;
  emit('info', `forwarding ${signal} to bridge`);
  if (!child || child.killed) return;
  child.kill(signal);
  const timer = setTimeout(() => {
    if (child && !child.killed) {
      emit('warn', 'bridge did not stop within 15s; sending SIGKILL');
      child.kill('SIGKILL');
    }
  }, 15000);
  timer.unref?.();
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => forward(signal));
}

emit('info', 'starting bridge runtime', {
  node: process.version,
  runtimeMode: process.env.HIPICO_RUNTIME_MODE || 'production',
  labSendEnabled: String(process.env.HIPICO_LAB_SEND_ENABLED || 'false').toLowerCase() === 'true'
});

child = spawn(process.execPath, ['src/index.mjs'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
});

pipeLines(child.stdout, 'info');
pipeLines(child.stderr, 'error');

child.on('error', (error) => {
  emit('error', 'bridge child process failed to start', { error: error.message });
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  emit(code === 0 ? 'info' : 'error', 'bridge runtime exited', { code, signal });
  process.exitCode = Number.isInteger(code) ? code : 1;
});
