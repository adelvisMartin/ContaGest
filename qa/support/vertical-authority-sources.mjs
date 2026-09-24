import fs from 'node:fs';

export const readAuthoritySource = (path) => fs.readFileSync(path, 'utf8');

const joinRequired = (...paths) => paths.map(readAuthoritySource).join('\n');
const joinOptional = (paths) => paths.filter((path)=>fs.existsSync(path)).map(readAuthoritySource).join('\n');
const joinBoundedAuthority = (requiredPaths, optionalPaths=[]) => [
  joinRequired(...requiredPaths),
  joinOptional(optionalPaths)
].filter(Boolean).join('\n');

export const healthBackendSource = () => joinBoundedAuthority(
  [
    'backend/src/modules/verticals/health.routes.ts',
    'backend/src/modules/verticals/health.schemas.ts'
  ],
  [
    'backend/src/modules/verticals/health.route-helpers.ts',
    'backend/src/modules/verticals/health-core.routes.ts',
    'backend/src/modules/verticals/health-encounters.routes.ts',
    'backend/src/modules/verticals/health-dental-financial.routes.ts',
    'backend/src/modules/verticals/health-measurements.routes.ts'
  ]
);

export const veterinaryBackendSource = () => joinBoundedAuthority(
  [
    'backend/src/modules/verticals/veterinary.routes.ts',
    'backend/src/modules/verticals/veterinary.schemas.ts'
  ],
  [
    'backend/src/modules/verticals/veterinary-inventory.routes.ts',
    'backend/src/modules/verticals/veterinary-overview.routes.ts',
    'backend/src/modules/verticals/veterinary-diagnostics.routes.ts',
    'backend/src/modules/verticals/veterinary-hospitalization.routes.ts',
    'backend/src/modules/verticals/veterinary-treatment-sheet.routes.ts',
    'backend/src/modules/verticals/veterinary-patients.routes.ts',
    'backend/src/modules/verticals/veterinary-guardian.routes.ts',
    'backend/src/modules/verticals/veterinary-communications.routes.ts',
    'backend/src/modules/verticals/veterinary-appointments.routes.ts',
    'backend/src/modules/verticals/veterinary-boarding.routes.ts',
    'backend/src/modules/verticals/veterinary-financial.routes.ts'
  ]
);

export const gymBackendSource = () => joinBoundedAuthority(
  [
    'backend/src/modules/verticals/gym.routes.ts',
    'backend/src/modules/verticals/gym.schemas.ts'
  ],
  [
    'backend/src/modules/verticals/gym-core.routes.ts',
    'backend/src/modules/verticals/gym-training.routes.ts',
    'backend/src/modules/verticals/gym-nutrition.routes.ts',
    'backend/src/modules/verticals/gym-adherence.routes.ts',
    'backend/src/modules/verticals/gym-classes.routes.ts'
  ]
);

export const veterinaryWorkspaceSource = () => joinBoundedAuthority(
  [
    'frontend/src/components/veterinary/VeterinaryWorkspace.jsx',
    'frontend/src/components/veterinary/veterinaryWorkspace.helpers.js'
  ],
  [
    'frontend/src/components/veterinary/VeterinaryWorkspaceViews.jsx',
    'frontend/src/components/veterinary/VeterinaryWorkspaceDialogs.jsx',
    'frontend/src/components/veterinary/VeterinaryWorkspacePrimitives.jsx'
  ]
);
