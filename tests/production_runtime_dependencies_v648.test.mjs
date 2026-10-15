import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const dockerfile = readFileSync(new URL('../ops/docker/Dockerfile.api', import.meta.url), 'utf8');

function verifyProductionInstall(source) {
  const productionDeps = source.split('FROM build AS production-deps\n')[1]?.split('\nFROM ')[0];
  assert.ok(productionDeps, 'separar la depuración de dependencias después del build');
  assert.match(productionDeps, /RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund/);
  assert.match(productionDeps, /require\(['"]@prisma\/client['"]\)/);

  const runtime = source.split('FROM node:22-bookworm-slim AS runtime\n')[1];
  assert.ok(runtime, 'mantener la etapa runtime de Node 22');
  assert.match(runtime, /COPY --from=production-deps \/app\/node_modules \/app\/node_modules/);
  assert.doesNotMatch(runtime, /COPY --from=build \/app\/node_modules \/app\/node_modules/);
  assert.match(runtime, /^USER node$/m);
  assert.match(runtime, /CMD \["npm","--workspace","backend","run","start"\]/);
  assert.match(runtime, /http:\/\/127\.0\.0\.1:3030\/health/);
}

test('la imagen de la API sólo copia dependencias runtime depuradas', () => {
  verifyProductionInstall(dockerfile);
});

test('la imagen conserva esquema Prisma y scripts de migración', () => {
  assert.match(dockerfile, /^COPY backend\/prisma backend\/prisma$/m);
  assert.match(dockerfile, /^COPY backend\/scripts backend\/scripts$/m);
  assert.match(dockerfile, /^COPY --from=build \/app\/backend\/prisma \/app\/backend\/prisma$/m);
  assert.match(dockerfile, /^COPY --from=build \/app\/backend\/scripts \/app\/backend\/scripts$/m);
});

test('regresión: no se admite copiar node_modules sin depurar', () => {
  const malformed = dockerfile.replace(
    'COPY --from=production-deps /app/node_modules /app/node_modules',
    'COPY --from=build /app/node_modules /app/node_modules'
  );
  assert.throws(() => verifyProductionInstall(malformed));
});

test('regresión: no se admite omitir prune de dependencias de desarrollo', () => {
  const malformed = dockerfile.replace('npm prune --omit=dev', 'npm prune');
  assert.throws(() => verifyProductionInstall(malformed));
});
