#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { CRITICAL_VISUAL_ROUTES, MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';

const project=String(process.env.CG_CROSS_BROWSER_PROJECT||'').trim();
const scope=String(process.env.CG_CROSS_BROWSER_SCOPE||'critical').trim();
const allowedProjects=new Set(['firefox','webkit-safari']);
if(!allowedProjects.has(project))throw new Error(`CG_CROSS_BROWSER_PROJECT must be firefox or webkit-safari; received ${project||'(empty)'}`);
if(!['critical','full'].includes(scope))throw new Error(`CG_CROSS_BROWSER_SCOPE must be critical or full; received ${scope}`);

const verticalRoutes=MODULE_VISUAL_CATALOG
  .filter((item)=>['health','fitness'].includes(item.family))
  .map((item)=>item.route);
const criticalRoutes=[...new Set([...CRITICAL_VISUAL_ROUTES,...verticalRoutes])];
const routes=scope==='full'?MODULE_VISUAL_CATALOG.map((item)=>item.route):criticalRoutes;

if(MODULE_VISUAL_CATALOG.length!==58)throw new Error(`63/75 catalog drift: expected 58 routes, received ${MODULE_VISUAL_CATALOG.length}`);
if(!routes.length)throw new Error('63/75 resolved an empty compatibility route set');

const grep=`^(?:${routes.join('|')}) · deep desktop/mobile light/dark audit$`;
console.log(`[cross-browser-63] project=${project} scope=${scope} routes=${routes.length}`);
console.log(`[cross-browser-63] route-set=${routes.join(',')}`);

const result=spawnSync(
  'npx',
  ['--no-install','playwright','test','qa/exhaustive-route-v164.spec.mjs',`--project=${project}`,'--workers=1','--reporter=list','--grep',grep],
  {cwd:process.cwd(),stdio:'inherit',env:{...process.env,CI:'1',PLAYWRIGHT_HTML_OPEN:'never'},shell:false}
);
if(result.error)throw result.error;
process.exitCode=result.status??1;
