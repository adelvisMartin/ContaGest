import { spawnSync } from 'node:child_process';

// DIAGNOSTIC-ONLY branch probe. Never merge this classifier.
// Vercel's connected API does not expose build logs, so encode only the broad
// source area of the first TypeScript diagnostic in the process exit status.
const result = spawnSync('npm', ['--workspace','backend','run','typecheck'], {
  cwd: '..',
  env: process.env,
  shell: false,
  encoding: 'utf8',
  stdio: 'pipe'
});

if (result.error) {
  console.error('[vercel-probe] backend typecheck could not start');
  process.exitCode = 119;
} else if (result.status === 0) {
  console.log('[vercel-probe] backend typecheck passed');
  process.exitCode = 0;
} else {
  const diagnostics = `${result.stdout || ''}\n${result.stderr || ''}`;
  const areas = [
    ['modules/hipico-bot/', 41],
    ['modules/hipico/', 42],
    ['modules/imports/', 43],
    ['modules/commercial/', 44],
    ['modules/banking/', 45],
    ['modules/accounting/', 46],
    ['modules/sales/', 47],
    ['modules/purchases/', 48],
    ['modules/inventory/', 49],
    ['modules/auth/', 50],
    ['modules/exports/', 51],
    ['modules/payables/', 52],
    ['modules/', 53],
    ['shared/', 54],
    ['config/', 55],
    ['database/', 56],
    ['prisma/', 57]
  ];
  const normalized = diagnostics.replaceAll('\\', '/');
  const match = areas.find(([needle]) => normalized.includes(needle));
  const code = match ? match[1] : 90;
  console.error(`[vercel-probe] backend typecheck failed areaCode=${code}`);
  process.exitCode = code;
}
