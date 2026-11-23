/**
 * After a deploy, an open page asks for files of the old build. Those errors
 * reload the page and are not reported as bugs; real errors still are.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMissingBuildFile } from '../src/lib/reloadForNewBuild.ts';

test('the messages of a file from a replaced build are recognised, in every browser', () => {
  for (const m of [
    'Failed to fetch dynamically imported module: https://app.voli.uz/assets/Map-1a2b.js',
    'Importing a module script failed.',
    'error loading dynamically imported module',
    "Cannot read properties of undefined (reading 'default')",
    "Cannot destructure property 'default' of '(intermediate value)' as it is undefined.",
    "undefined is not an object (evaluating 'n.default')",
  ]) assert.ok(isMissingBuildFile(new Error(m)), m);
});

test('ordinary errors are still reported', () => {
  for (const m of ["Cannot read properties of undefined (reading 'balance')", 'Network request failed', "Cannot destructure property 'id' of 'session' as it is undefined."]) {
    assert.equal(isMissingBuildFile(new Error(m)), false, m);
  }
});
