import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { monotonicElapsedMs, remainingSoakMs } from '../scripts/hipico-soak-monotonic-v120.mjs';

const dayMs = 24 * 60 * 60 * 1000;

test('#120 monotonic elapsed time gates a full 24h regardless of wall clock changes', () => {
  const monoStart = 100_000;
  // A wall clock may jump ahead by a day, but monotonic time has advanced 2h.
  const wallStart = 1_800_000_000_000;
  const changedWallClock = wallStart + dayMs + 2 * 60 * 60 * 1000;
  assert.ok(changedWallClock - wallStart > dayMs);
  assert.equal(monotonicElapsedMs(monoStart, monoStart + 2 * 60 * 60 * 1000), 7_200_000);
  assert.equal(remainingSoakMs(monoStart, 1440, monoStart + 7_200_000), 22 * 60 * 60 * 1000);
  assert.equal(remainingSoakMs(monoStart, 1440, monoStart + dayMs - 1), 1);
  assert.equal(remainingSoakMs(monoStart, 1440, monoStart + dayMs), 0);
});

test('#120 refuses invalid durations or a backward/nonfinite monotonic clock', () => {
  for (const [start, end] of [[10, 9], [NaN, 10], [1, Infinity]]) {
    assert.throws(() => monotonicElapsedMs(start, end), /MONOTONIC_CLOCK_INVALID/);
  }
  for (const minutes of [0, -1, NaN, Infinity, Number.MAX_VALUE]) {
    assert.throws(() => remainingSoakMs(1, minutes, 2), /DURATION_INVALID/);
  }
  assert.equal(monotonicElapsedMs(10.5, 11.99), 1);
});

test('#120 production soak runner uses monotonic time for samples, loop and final duration', () => {
  const source = fs.readFileSync(new URL('../backend/scripts/hipico-soak-v120.ts', import.meta.url), 'utf8');
  assert.match(source, /from '\.\.\/\.\.\/scripts\/hipico-soak-monotonic-v120\.mjs'/);
  assert.match(source, /const startedAtMonotonicMs=performance\.now\(\)/);
  assert.match(source, /while\(remainingSoakMs\(startedAtMonotonicMs,durationMinutes,performance\.now\(\)\)>0\)/);
  assert.match(source, /elapsedMs:monotonicElapsedMs\(startedAtMonotonicMs,performance\.now\(\)\)/);
  assert.match(source, /const durationMs=monotonicElapsedMs\(startedAtMonotonicMs,performance\.now\(\)\)/);
  assert.doesNotMatch(source, /const endAt=start\+durationMinutes\*60_000/);
});
