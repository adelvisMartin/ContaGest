#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const REQUIRED_DIRECTIONS=Object.freeze(['A_TO_B','B_TO_A']);
const PERSISTENCE_LAYERS=new Set(['repository','postgres']);
const EXPECTED_RESULTS=new Set(['NOT_FOUND_OR_TENANT_OVERRIDE','CROSS_TENANT_REFERENCE','NOT_FOUND_OR_FORBIDDEN','TENANT_SCOPED_RESULT']);

export function validateTenantIsolationMatrix(matrix){
  if(!matrix||matrix.schemaVersion!==641||matrix.issue!==641)throw new Error('TENANT_MATRIX_VERSION');
  const directions=new Set(matrix.directions||[]);
  if(REQUIRED_DIRECTIONS.some((direction)=>!directions.has(direction)))throw new Error('TENANT_MATRIX_DIRECTIONS');
  if(Number(matrix.nonDisclosure?.readMissingOrForeign)!==404)throw new Error('TENANT_MATRIX_NON_DISCLOSURE_READ');
  if(Number(matrix.nonDisclosure?.crossTenantReference)!==409)throw new Error('TENANT_MATRIX_NON_DISCLOSURE_REFERENCE');
  const contexts=Array.isArray(matrix.contexts)?matrix.contexts:[];
  if(!contexts.length)throw new Error('TENANT_MATRIX_CONTEXTS');
  const seen=new Set();
  for(const context of contexts){
    if(!context?.id)throw new Error('TENANT_MATRIX_CONTEXT_ID');
    const surfaces=Array.isArray(context.surfaces)?context.surfaces:[];
    if(!surfaces.length)throw new Error(`TENANT_MATRIX_CONTEXT_EMPTY:${context.id}`);
    for(const surface of surfaces){
      if(!surface?.id||seen.has(surface.id))throw new Error(`TENANT_MATRIX_SURFACE_ID:${surface?.id||'missing'}`);
      seen.add(surface.id);
      const layers=new Set(surface.layers||[]);
      if(!layers.has('api'))throw new Error(`TENANT_MATRIX_API_LAYER:${surface.id}`);
      if(![...layers].some((layer)=>PERSISTENCE_LAYERS.has(layer)))throw new Error(`TENANT_MATRIX_PERSISTENCE_LAYER:${surface.id}`);
      if(!Array.isArray(surface.attacks)||!surface.attacks.length)throw new Error(`TENANT_MATRIX_ATTACKS:${surface.id}`);
      if(!EXPECTED_RESULTS.has(surface.expected))throw new Error(`TENANT_MATRIX_EXPECTED:${surface.id}`);
      if(!Array.isArray(surface.evidence)||!surface.evidence.length)throw new Error(`TENANT_MATRIX_EVIDENCE:${surface.id}`);
    }
  }
  return true;
}

export function expandDirectionalCases(matrix){
  validateTenantIsolationMatrix(matrix);
  return matrix.contexts.flatMap((context)=>context.surfaces.flatMap((surface)=>
    REQUIRED_DIRECTIONS.map((direction)=>({
      contextId:context.id,
      surfaceId:surface.id,
      direction,
      layers:[...surface.layers],
      attacks:[...surface.attacks],
      expected:surface.expected,
      evidence:[...surface.evidence],
    }))));
}

export function summarizeTenantIsolationMatrix(matrix){
  const cases=expandDirectionalCases(matrix);
  const layers=[...new Set(cases.flatMap((row)=>row.layers))].sort();
  const attacks=[...new Set(cases.flatMap((row)=>row.attacks))].sort();
  return Object.freeze({
    contexts:matrix.contexts.length,
    surfaces:cases.length/REQUIRED_DIRECTIONS.length,
    directionalCases:cases.length,
    layers,
    attacks,
  });
}

function cli(){
  const file=process.argv[2]||'config/tenant-isolation-adversarial-v641.json';
  const matrix=JSON.parse(fs.readFileSync(file,'utf8'));
  validateTenantIsolationMatrix(matrix);
  console.log(JSON.stringify({status:'PASS',...summarizeTenantIsolationMatrix(matrix)},null,2));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{cli();}
  catch(error){console.error(`[tenant-isolation-v641] ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;}
}
