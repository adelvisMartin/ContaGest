import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pagePath = 'frontend/src/pages/GymManagementPage.jsx';
const toolPath = 'frontend/src/components/fitness/FitnessProductivityTools.jsx';

test('Gym workspace imports the existing productivity surface that it mounts', () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  const tools = fs.readFileSync(toolPath, 'utf8');

  assert.match(page, /<FitnessProductivityTools\b/, 'the Gym workspace must retain its productivity surface');
  assert.match(
    page,
    /import\s*\{\s*FitnessProductivityTools\s*\}\s*from\s*['"]\.\.\/components\/fitness\/FitnessProductivityTools\.jsx['"]/,
    'the mounted component must be imported from its actual module'
  );
  assert.match(tools, /export\s+function\s+FitnessProductivityTools\s*\(/,
    'the imported module must export the rendered component');
});
