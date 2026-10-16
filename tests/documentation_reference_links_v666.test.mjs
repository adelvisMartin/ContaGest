import assert from 'node:assert/strict';
import test from 'node:test';
import { collectReferenceLinks } from '../scripts/documentation-reference-links-v666.mjs';

test('#666 resolves case-insensitive reference definitions and collapsed links', () => {
  const value = '[Guide][manual]\n[Also][MANUAL]\n[Manual][]\n[manual]: <docs/guide.md> "Guide"\n';
  // A collapsed reference uses its visible text (Manual).
  assert.deepEqual(collectReferenceLinks(value), [
    { kind: 'target', line: 4, reference: '<docs/guide.md>' },
  ]);
});

test('#666 rejects undefined reference labels deterministically', () => {
  assert.deepEqual(collectReferenceLinks('[One][missing]\n[Two][]'), [
    { kind: 'undefined', line: 1, reference: 'missing' },
    { kind: 'undefined', line: 2, reference: 'two' },
  ]);
});

test('#666 does not audit fenced or inline code samples, image links, or footnotes', () => {
  const value = [
    '```md', '[no][nope]', '[nope]: docs/missing.md', '```',
    '~~~', '[sample][no]', '~~~',
    '`[inline][no]`', '![image][no]',
    '[^note]: Footnote content',
    '[Real][good]', '[good]: docs/guide.md',
  ].join('\n');
  assert.deepEqual(collectReferenceLinks(value), [
    { kind: 'target', line: 12, reference: 'docs/guide.md' },
  ]);
});

test('#666 keeps missing relative references for canonical root/symlink verification', () => {
  assert.deepEqual(collectReferenceLinks('[Broken][B]\n[B]: ../outside.md'), [
    { kind: 'target', line: 2, reference: '../outside.md' },
  ]);
});

test('#666 ignores unused reference definitions, preserving low noise', () => {
  assert.deepEqual(collectReferenceLinks('[unused]: docs/obsolete.md'), []);
});

test('#666 never performs I/O; HTTP links remain for existing skip policy', () => {
  assert.deepEqual(collectReferenceLinks('[Official][site]\n[site]: https://example.com/'), [
    { kind: 'target', line: 2, reference: 'https://example.com/' },
  ]);
});

test('#666 ignores escaped Markdown brackets but retains an operative link after a literal slash', () => {
  const document = String.raw`\[Literal][missing]
\\[Active][exists]
[exists]: docs/guide.md`;
  assert.deepEqual(collectReferenceLinks(document), [
    { kind: 'target', line: 3, reference: 'docs/guide.md' },
  ]);
});
