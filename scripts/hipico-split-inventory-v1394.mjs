import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { dirname, resolve, join, basename, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const domain = /^(?:frontend\/public\/hipico-control\/|backend\/src\/modules\/hipico(?:-bot)?\/|android\/hipico-control-v1130\/|products\/hipico-control\/|tools\/hipico[^/]*\/|docs\/hipico\/)/i;
const named = /hipico|hípico/i;
const unsafe = /(?:^|\/)(?:\.git(?:modules|config)?|\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|jks|keystore|sqlite|db|dump|bak)|(?:credentials|secrets)(?:\..*)?)(?:\/|$)/i;
const shaPattern = /^[a-f0-9]{40}$/;
function git(repo, args, encoding = 'utf8') {
  return execFileSync('git', ['-C', repo, ...args], { encoding, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
export function inventory(repo, sha) {
  if (!shaPattern.test(sha) || git(repo, ['rev-parse', '--verify', `${sha}^{commit}`]).trim() !== sha) throw new Error('Exact commit SHA required');
  let references;
  try { references = git(repo, ['grep', '-I', '-l', '-z', '-i', '-E', 'hipico|hípico', sha]); }
  catch (error) { if (error.status !== 1) throw error; references = ''; }
  const referenced = new Set(references.split('\0').filter(Boolean).map(value => value.slice(sha.length + 1)));
  const files = git(repo, ['ls-tree', '-r', '-z', sha]).split('\0').filter(Boolean).map(record => {
    const tab = record.indexOf('\t');
    const [mode, type, oid] = record.slice(0, tab).split(' ');
    const path = record.slice(tab + 1);
    const category = unsafe.test(path) || type !== 'blob' || !['100644', '100755'].includes(mode) ? 'blocked' : domain.test(path) ? 'domain-review' : named.test(path) ? 'named-review' : referenced.has(path) ? 'cross-reference-review' : 'unclassified';
    return { path, mode, type, oid, category };
  });
  return { sourceSha: sha, classificationOnly: true, files };
}
function portablePath(path) {
  return path.split('/').every(part => /^[a-z0-9._-]+$/i.test(part) && !/^\.(?:git|gitmodules|gitconfig)$/i.test(part) && part !== '.' && part !== '..' && !part.endsWith('.') && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
export function stage(repo, sha, approval, destination) {
  const report = inventory(repo, sha);
  if (approval.sourceSha !== sha || !Array.isArray(approval.files) || !approval.files.length) throw new Error('Explicit per-file approval for exact SHA required');
  const known = new Map(report.files.map(file => [file.path, file]));
  const seen = new Set();
  const selected = approval.files.map(item => {
    const file = known.get(item.path);
    const key = typeof item.path === 'string' ? item.path.toLowerCase() : '';
    if (!file || file.oid !== item.oid || file.category === 'blocked' || !portablePath(file.path) || seen.has(key) || key === 'split-provenance.json' || typeof item.reason !== 'string' || !item.reason.trim()) throw new Error('Invalid, duplicate or blocked approval');
    seen.add(key);
    return file;
  });
  // Never write inside the source checkout, including through a symlinked parent.
  const requested = resolve(destination);
  const root = join(realpathSync(dirname(requested)), basename(requested));
  const source = realpathSync(git(repo, ['rev-parse', '--show-toplevel']).trim());
  const rel = relative(source, root);
  if (!rel || (!isAbsolute(rel) && !rel.split(/[\\/]/).includes('..'))) throw new Error('Stage outside source checkout');
  mkdirSync(root, { mode: 0o700 });
  try {
    for (const file of selected) {
      const target = join(root, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, git(repo, ['cat-file', 'blob', file.oid], null), { flag: 'wx', mode: file.mode === '100755' ? 0o700 : 0o600 });
    }
    writeFileSync(join(root, 'split-provenance.json'), JSON.stringify({ sourceSha: sha, files: selected, status: 'LOCAL_STAGE_ONLY_REVIEW_AND_SECRET_SCAN_REQUIRED' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) { rmSync(root, { recursive: true, force: true }); throw error; }
  return selected.length;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, sha, approval, destination] = process.argv.slice(2);
  if (command === 'inventory' && !approval && !destination) console.log(JSON.stringify(inventory(process.cwd(), sha), null, 2));
  else if (command === 'stage' && approval && destination) console.log(`Local staged files: ${stage(process.cwd(), sha, JSON.parse(readFileSync(approval, 'utf8')), destination)}`);
  else throw new Error('Usage: inventory SHA | stage SHA APPROVAL_JSON NEW_DIRECTORY');
}
