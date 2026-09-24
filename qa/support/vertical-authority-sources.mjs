import fs from 'node:fs';

export const readAuthoritySource = (path) => fs.readFileSync(path, 'utf8');

export const joinAuthoritySources = (...paths) =>
  paths.map(readAuthoritySource).join('\n');

export const healthBackendSource = () => joinAuthoritySources(
  'backend/src/modules/verticals/health.routes.ts',
  'backend/src/modules/verticals/health.schemas.ts'
);

export const veterinaryBackendSource = () => joinAuthoritySources(
  'backend/src/modules/verticals/veterinary.routes.ts',
  'backend/src/modules/verticals/veterinary.schemas.ts'
);

export const gymBackendSource = () => joinAuthoritySources(
  'backend/src/modules/verticals/gym.routes.ts',
  'backend/src/modules/verticals/gym.schemas.ts'
);

export const veterinaryWorkspaceSource = () => joinAuthoritySources(
  'frontend/src/components/veterinary/VeterinaryWorkspace.jsx',
  'frontend/src/components/veterinary/veterinaryWorkspace.helpers.js'
);
