import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { graphifyFreshness, writeGraphifyBinding } from './agent-context-v2-lib.mjs';

const root = process.cwd();
const metadataPath = path.join(root, 'graphify-out', 'source-sha.json');
const command = process.argv[2] || 'status';
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

if (command === 'status') {
  console.log(JSON.stringify(graphifyFreshness({ headSha, metadataPath }), null, 2));
} else if (command === 'bind') {
  const payload = writeGraphifyBinding({ headSha, metadataPath });
  console.log(JSON.stringify({ status: 'CURRENT', ...payload }, null, 2));
} else {
  console.error('Usage: node scripts/graphify-context-v2.mjs [status|bind]');
  process.exitCode = 2;
}
