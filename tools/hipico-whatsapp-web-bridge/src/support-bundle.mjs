import path from 'node:path';
import { buildSupportBundle } from './observability.mjs';
import { VERSION } from './runtime-config.mjs';

function dataDir() {
  return path.resolve(String(
    process.env.HIPICO_DATA_DIR ||
    (process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'ControlHipicoBridge', 'data')
      : path.join(process.cwd(), 'data'))
  ));
}

function argValue(name, fallback = '') {
  const prefix = `${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

const source = dataDir();
const sha = String(process.env.GITHUB_SHA || process.env.HIPICO_BUILD_SHA || argValue('--sha', 'unknown')).trim() || 'unknown';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(argValue('--out', path.join(source, 'support-bundles', `${stamp}-${sha.slice(0, 12)}`)));

try {
  const manifest = await buildSupportBundle({ dataDir: source, outDir: output, version: VERSION, sha });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    output,
    version: manifest.version,
    sha: manifest.sha,
    fileCount: manifest.files.length,
    manifestSha256: manifest.manifestSha256,
    redactionPolicy: manifest.redactionPolicy
  })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: String(error?.message || error) })}\n`);
  process.exitCode = 1;
}
