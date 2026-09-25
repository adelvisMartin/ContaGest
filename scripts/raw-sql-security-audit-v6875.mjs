#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_CONFIG = 'config/raw-sql-security-68-75.json';

function walk(root, extensions, excludePatterns) {
  if (!fs.existsSync(root)) return [];
  const excludes = excludePatterns.map((pattern) => new RegExp(pattern));
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) return walk(file, extensions, excludePatterns);
    if (!entry.isFile() || !extensions.includes(path.extname(entry.name))) return [];
    const normalized = file.replaceAll('\\\\', '/');
    return excludes.some((rx) => rx.test(normalized)) ? [] : [normalized];
  });
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function readQuoted(source, start) {
  const quote = source[start];
  if (!['\'', '"', '`'].includes(quote)) return null;
  let escaped = false;
  for (let i = start + 1; i < source.length; i += 1) {
    const char = source[i];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === quote) return { text: source.slice(start, i + 1), end: i + 1, quote };
  }
  return null;
}

function firstArgument(source, openParen) {
  let i = openParen + 1;
  while (/\s/.test(source[i] || '')) i += 1;
  const quoted = readQuoted(source, i);
  if (quoted) {
    let j = quoted.end;
    while (/\s/.test(source[j] || '')) j += 1;
    return { kind: 'literal', value: quoted.text, quote: quoted.quote, tail: source.slice(j, j + 8), start: i, end: quoted.end };
  }
  let depth = 0;
  let end = i;
  for (; end < source.length; end += 1) {
    const char = source[end];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') {
      if (depth === 0 && char === ')') break;
      depth = Math.max(0, depth - 1);
    }
    if (char === ',' && depth === 0) break;
  }
  return { kind: 'expression', value: source.slice(i, end).trim(), start: i, end };
}

export function analyzeRawSqlSource(source, file, config) {
  const findings = [];
  if (/raw-sql-security\s*:\s*(ignore|disable|skip)/i.test(source)) {
    findings.push({ file, line: 1, code: 'INLINE_IGNORE', message: 'Inline raw-SQL audit bypass directives are forbidden.' });
  }

  const methodRx = /\$(queryRawUnsafe|executeRawUnsafe)(?:<[^;(){}]+>)?\s*\(/g;
  for (const match of source.matchAll(methodRx)) {
    const method = match[1];
    const openParen = match.index + match[0].lastIndexOf('(');
    const arg = firstArgument(source, openParen);
    const line = lineNumber(source, match.index);
    if (!arg?.value) {
      findings.push({ file, line, code: 'UNPARSEABLE_RAW_SQL', message: method + ' first argument could not be parsed.' });
      continue;
    }

    if (arg.kind === 'literal') {
      if (arg.quote === '`' && arg.value.includes('${')) {
        findings.push({ file, line, code: 'RAW_SQL_INTERPOLATION', message: method + ' uses template interpolation; bind values as separate parameters.' });
      }
      if (/^\s*\+/.test(arg.tail)) {
        findings.push({ file, line, code: 'RAW_SQL_CONCAT', message: method + ' concatenates SQL text dynamically.' });
      }
      continue;
    }

    const expression = arg.value;
    const approved = (config.approvedDynamicSql || []).some((entry) => entry.file === file && entry.expression === expression && String(entry.reason || '').trim().length >= 12);
    if (approved) continue;

    const requestDerived = (config.requestDerivedTokens || []).some((token) => expression.includes(token));
    if (requestDerived) {
      findings.push({ file, line, code: 'REQUEST_DERIVED_RAW_SQL', message: method + ' receives request-derived SQL text.' });
    } else {
      findings.push({ file, line, code: 'DYNAMIC_RAW_SQL_REVIEW', message: method + ' receives a non-literal SQL expression; classify it in approvedDynamicSql with a concrete reason or refactor to static SQL.' });
    }
  }

  const prismaRawRx = /Prisma\.raw\s*\(/g;
  for (const match of source.matchAll(prismaRawRx)) {
    const openParen = match.index + match[0].lastIndexOf('(');
    const arg = firstArgument(source, openParen);
    if (!arg?.value) continue;
    if (arg.kind !== 'literal' || (arg.quote === '`' && arg.value.includes('${'))) {
      findings.push({ file, line: lineNumber(source, match.index), code: 'DYNAMIC_PRISMA_RAW', message: 'Prisma.raw must receive static SQL text only.' });
    }
  }
  return findings;
}

export function runRawSqlSecurityAudit(configPath = DEFAULT_CONFIG) {
  const root = process.cwd();
  const config = JSON.parse(fs.readFileSync(path.join(root, configPath), 'utf8'));
  const files = config.scope.roots.flatMap((relative) =>
    walk(path.join(root, relative), config.scope.extensions, config.scope.excludePatterns)
  );
  const findings = files.flatMap((absolute) => {
    const relative = path.relative(root, absolute).replaceAll('\\\\', '/');
    return analyzeRawSqlSource(fs.readFileSync(absolute, 'utf8'), relative, config);
  });
  return { files, findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { files, findings } = runRawSqlSecurityAudit();
  if (findings.length) {
    for (const finding of findings) console.error('[raw-sql-security][FAIL] ' + finding.file + ':' + finding.line + ' ' + finding.code + ' ' + finding.message);
    console.error('[raw-sql-security][SUMMARY] files=' + files.length + ' findings=' + findings.length);
    process.exitCode = 1;
  } else {
    console.log('[raw-sql-security][PASS] files=' + files.length + ' findings=0');
  }
}
