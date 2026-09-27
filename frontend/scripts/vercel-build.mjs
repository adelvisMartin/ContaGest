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
  const areas = [
    ['src/shared/observability/context.test.ts', 61],
    ['src/shared/observability/context.ts', 62],
    ['src/shared/observability/http.ts', 63],
    ['src/shared/observability/logger.ts', 64],
    ['src/shared/security/production-boundaries.test.ts', 65],
    ['src/shared/security/production-boundaries.ts', 66],
    ['src/shared/financial/', 67],
    ['src/shared/services/financial-idempotency.service', 68],
    ['src/shared/services/', 69],
    ['src/shared/middleware/', 70],
    ['src/shared/http', 71],
    ['src/shared/', 72]
  ];
  const match = areas.find(([needle]) => normalized.includes(needle));
  process.exitCode = match ? match[1] : 90;
}
