import assert from 'node:assert/strict';

// Cache namespaces must change after the historically looping r38 shell.
// Do not pin the CURRENT revision: each legitimate release must still be able
// to rotate the active cache and delete the older namespaces.
export function assertHipicoShellCacheRotated(source) {
  const revisions = [...String(source).matchAll(
    /const SHELL_CACHE\s*=\s*`\$\{CACHE_VERSION\}-shell-r(\d+)-consolidator-v\d+-\d+-\d+`/g
  )];
  assert.equal(revisions.length, 1, 'exactly one versioned active Hípico shell cache is required');
  const revision = Number(revisions[0][1]);
  assert.ok(Number.isSafeInteger(revision) && revision > 38, 'active shell cache must supersede historic r38');
  return revision;
}
