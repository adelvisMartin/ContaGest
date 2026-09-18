import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  auditRepositoryArchitecture,
  findForbiddenBackendDependencies,
  findForbiddenOptionalPackDependencies
} from '../scripts/architecture-boundary-audit.mjs';

test('core dependency gate covers every optional pack root',()=>{
  const findings=findForbiddenBackendDependencies([
    {
      path:'/repo/backend/src/modules/accounting/accounting.routes.ts',
      source:`import hipico from '../hipico/hipico-system.routes.js';`
    },
    {
      path:'/repo/backend/src/modules/sales/sales.routes.ts',
      source:`import food from '../food/food.routes.js';`
    },
    {
      path:'/repo/backend/src/modules/inventory/inventory.routes.ts',
      source:`import veterinary from '../verticals/veterinary.routes.js';`
    }
  ]);
  assert.equal(findings.length,3);
  assert.ok(findings.some((item)=>item.includes('/hipico/')));
  assert.ok(findings.some((item)=>item.includes('/food/')));
  assert.ok(findings.some((item)=>item.includes('/verticals/')));
});

test('verticals may depend on shared/database/own package but not ERP implementation modules',()=>{
  const findings=findForbiddenOptionalPackDependencies([
    {
      path:'/repo/backend/src/modules/verticals/health.routes.ts',
      source:[
        `import { prisma } from '../../database/prisma.js';`,
        `import { ok } from '../../shared/http.js';`,
        `import { one } from './verticals.shared.js';`
      ].join('\n')
    },
    {
      path:'/repo/backend/src/modules/verticals/gym.routes.ts',
      source:`import salesRoutes from '../sales/sales.routes.js';`
    }
  ]);
  assert.equal(findings.length,1);
  assert.match(findings[0],/verticals\/gym\.routes\.ts/);
  assert.match(findings[0],/sales/);
});

test('hipico and hipico-bot are one optional-pack family but cannot import ERP implementation modules',()=>{
  const findings=findForbiddenOptionalPackDependencies([
    {
      path:'/repo/backend/src/modules/hipico/agent.routes.ts',
      source:[
        `import security from '../hipico-bot/hipico-operator-security.js';`,
        `import { prisma } from '../../database/prisma.js';`
      ].join('\n')
    },
    {
      path:'/repo/backend/src/modules/hipico-bot/hipico-provider.routes.ts',
      source:`import accounting from '../accounting/accounting.routes.js';`
    }
  ]);
  assert.equal(findings.length,1);
  assert.match(findings[0],/hipico-bot\/hipico-provider\.routes\.ts/);
  assert.match(findings[0],/accounting/);
});

test('test-only imports do not become production architecture violations',()=>{
  const findings=findForbiddenOptionalPackDependencies([
    {
      path:'/repo/backend/src/modules/hipico/architecture.test.ts',
      source:`import accounting from '../accounting/accounting.routes.js';`
    },
    {
      path:'/repo/backend/src/modules/hipico/hipico-data.integration.ts',
      source:`import accounting from '../accounting/accounting.routes.js';`
    }
  ]);
  assert.deepEqual(findings,[]);
});

test('optional packs share an explicit tenant context contract',()=>{
  const contract=fs.readFileSync(path.join(process.cwd(),'backend/src/shared/contracts/optional-pack.ts'),'utf8');
  const verticalShared=fs.readFileSync(path.join(process.cwd(),'backend/src/modules/verticals/verticals.shared.ts'),'utf8');
  assert.match(contract,/export type OptionalPackRequestContext/);
  assert.match(contract,/tenantId:\s*string/);
  assert.match(verticalShared,/OptionalPackRequestContext/);
  assert.match(verticalShared,/\.\.\/\.\.\/shared\/contracts\/optional-pack\.js/);
});

test('current repository satisfies bidirectional optional-pack dependency rules',()=>{
  const result=auditRepositoryArchitecture(process.cwd());
  assert.equal(result.ok,true,JSON.stringify(result,null,2));
  assert.equal(result.runtimeRouteCount,58);
  assert.equal(result.visualRouteCount,58);
});
