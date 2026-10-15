#!/usr/bin/env node
/**
 * Optional repo-local installer/launcher for the official pinned REA release.
 * No global packages, MCP setup, native engine installs or app runtime changes.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const prefix = path.join(root, '.local-tools', 'rea');
const packageVersion = '6.5.0';
const packageName = 'rea-agents';
const cli = path.join(prefix, 'node_modules', packageName, 'scripts', 'rea.mjs');
const packageJson = path.join(prefix, 'node_modules', packageName, 'package.json');

export function nodeSupported(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26;
}

function block(message) {
  console.error('REA_LOCAL_BLOCKED: ' + message);
  process.exitCode = 1;
}

function availableCli() {
  if (!existsSync(cli) || !existsSync(packageJson)) return false;
  const resolved = realpathSync(cli);
  const base = realpathSync(prefix);
  if (!resolved.startsWith(base + path.sep)) return false;
  try {
    const manifest = JSON.parse(readFileSync(packageJson, 'utf8'));
    return manifest.name === packageName &&
      manifest.version === packageVersion && manifest.license === 'MIT';
  } catch {
    return false;
  }
}

function npmCliPath() {
  const bin = path.dirname(process.execPath);
  const candidates = [
    path.join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    process.env.npm_execpath
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root, stdio: 'inherit', shell: false
  });
  if (result.error) { block(result.error.message); return; }
  process.exitCode = result.status ?? 1;
}

export function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? 'plan';
  if (command === 'plan') {
    console.log('REA local install plan (no writes)');
    console.log('Target: ' + prefix);
    console.log('Official npm package: ' + packageName + '@' + packageVersion + ' (MIT)');
    console.log('Install: isolated prefix, scripts disabled, optional native dependencies omitted');
    console.log('No global tools, Node upgrade, MCP registration, browser actions or production changes');
    console.log('Node: ' + process.version + ' (' +
      (nodeSupported(process.version) ? 'supported' :
      'requires >=22.19 in Node 22, >=24.11 in Node 24, or >=26') + ')');
    console.log('Installed/verified: ' + (availableCli() ? 'yes' : 'no'));
    console.log('Next: node scripts/rea-local-install.mjs install');
    return;
  }
  if (!['install', 'doctor', 'rea'].includes(command)) {
    block('Usage: plan | install | doctor | rea <CLI args>');
    return;
  }
  if (!nodeSupported(process.version)) {
    block('Node ' + process.version + ' unsupported by REA ' + packageVersion +
      '; install Node 22.19+ (or 24.11+, 26+) on your own device first.');
    return;
  }
  if (command === 'install') {
    if (argv.length !== 1) { block('install takes no additional arguments'); return; }
    if (availableCli()) {
      console.log('REA_LOCAL_VERIFIED ' + packageVersion + ' in ' + prefix);
      return;
    }
    const npmCli = npmCliPath();
    if (!npmCli) { block('Cannot locate npm-cli.js next to this Node installation'); return; }
    console.log('Installing REA ' + packageVersion + ' into ' + prefix);
    runNode([
      npmCli, 'install', '--prefix', prefix, '--no-save', '--package-lock=false',
      '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund',
      '--engine-strict', '--no-update-notifier', packageName + '@' + packageVersion
    ]);
    if (process.exitCode !== 0) return;
    if (!availableCli()) {
      block('Package installed but version/license/entrypoint cannot be verified');
      return;
    }
    console.log('REA_LOCAL_VERIFIED ' + packageVersion);
    return;
  }
  if (!availableCli()) {
    block('REA not installed/verified. Run: node scripts/rea-local-install.mjs install');
    return;
  }
  if (command === 'doctor') {
    if (argv.length !== 1) { block('doctor takes no arguments; it is read-only'); return; }
    runNode([cli, 'doctor', '--client', 'codex', '--json']);
    return;
  }
  if (argv.length < 2) { block('rea requires explicit REA CLI arguments'); return; }
  // No implicit scenarios or browser actions. Only explicitly supplied CLI arguments.
  runNode([cli, ...argv.slice(1)]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
