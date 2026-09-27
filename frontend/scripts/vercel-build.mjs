import { spawnSync } from 'node:child_process';

// DIAGNOSTIC-ONLY branch probe. Never merge this classifier.
const result = spawnSync('npm', ['--workspace','backend','run','typecheck'], {
  cwd: '..', env: process.env, shell: false, encoding: 'utf8', stdio: 'pipe'
});

if (result.error) {
  process.exitCode = 119;
} else if (result.status === 0) {
  process.exitCode = 0;
} else {
  const normalized = `${result.stdout || ''}\n${result.stderr || ''}`.replaceAll('\\', '/');
  const match = normalized.match(/src\/shared\/observability\/context\.ts\((\d+),(\d+)\):\s*error\s+TS(\d+)/);
  if (!match) {
    process.exitCode = 90;
  } else {
    const line = Number(match[1]);
    process.exitCode = line >= 46 && line <= 60 ? 100 + (line - 45) : 91;
  }
}
