import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const cmd = read('../HIPICO.cmd');
const ps1 = read('../HIPICO.ps1');

test('CMD launcher delegates to PowerShell 7, preserves quoting boundary and propagates exit code', () => {
  assert.match(cmd, /where\s+pwsh/i);
  assert.match(cmd, /pwsh[\s\S]*-File\s+"%~dp0HIPICO\.ps1"\s+%\*/i);
  assert.match(cmd, /exit\s+\/b\s+%ERRORLEVEL%/i);
  assert.doesNotMatch(cmd, /npm\s+(?:ci|install)/i);
  assert.doesNotMatch(cmd, /sendMessage|SOURCE.*send/i);
});

test('PowerShell launcher keeps install/update work separate from daily start and read-only CLI commands', () => {
  assert.match(ps1, /ValidateSet\('install','start','status','doctor','health','version','bridge','channel','groups','messages','events','trace'\)/);
  assert.match(ps1, /if\s*\(\$Command\s+-eq\s+'install'\)[\s\S]*npm\s+ci\s+--no-audit\s+--no-fund/i);
  assert.match(ps1, /if\s*\(\$Command\s+-eq\s+'start'\)[\s\S]*npm\s+start/i);
  assert.equal((ps1.match(/npm\s+ci\s+--no-audit\s+--no-fund/gi) || []).length, 1, 'npm ci must exist only in install branch');
  assert.match(ps1, /src[\\/]cli[\\/]hipico-cli\.mjs/);
  assert.match(ps1, /--env-file-if-exists=\.env/);
  assert.doesNotMatch(ps1, /git\s+(?:pull|reset|checkout)|curl\s+.*\|/i);
});

test('PowerShell launcher requires Node 22 and forwards CLI process exit code', () => {
  assert.match(ps1, /node\s+--version/i);
  assert.match(ps1, /Node 22/i);
  assert.match(ps1, /exit\s+\$LASTEXITCODE/i);
});
