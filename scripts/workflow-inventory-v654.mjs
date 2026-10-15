#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_DIR = '.github/workflows';
const CATEGORIES = new Set(['AUTHORITATIVE', 'ADAPTER', 'SCHEDULED', 'PROVIDER_SPECIFIC', 'SUPERSEDED', 'TEMPORARY']);
const SAFE_FILE = /^\.github\/workflows\/[a-zA-Z0-9_.-]+\.ya?ml$/;
const SAFE_OWNER = /^[a-z][a-z0-9-]*$/;

function inspectWorkflow(source, name) {
  const lines = source.split(/\r?\n/);
  const errors = [];
  const triggers = new Set(), jobs = new Set(), checkNames = new Set();
  const permissions = [], dependencies = [], artifactRetentionDays = [];
  let section = '';
  let insideJob = false;
  for (const line of lines) {
    const heading = /^([A-Za-z_][\w-]*):\s*(?:#.*)?$/.exec(line);
    if (heading) { section = heading[1]; insideJob = section === 'jobs'; continue; }
    if (section === 'on') {
      const trigger = /^  ([a-z_]+):(?:\s|$)/.exec(line);
      if (trigger) triggers.add(trigger[1]);
    }
    if (insideJob) {
      const job = /^  ([A-Za-z_][\w-]*):\s*(?:#.*)?$/.exec(line);
      if (job) jobs.add(job[1]);
      const checkName = /^    name:\s*(.+)\s*$/.exec(line);
      if (checkName) checkNames.add(checkName[1].trim());
      const needs = /^    needs:\s*(.+)$/.exec(line);
      if (needs) dependencies.push(needs[1].trim());
    }
    const permission = /^  (?:contents|actions|checks|deployments|id-token|pages|packages|pull-requests|security-events|statuses):\s*(read|write|none)/.exec(line);
    if (section === 'permissions' && permission) permissions.push([permission[0].trim(),permission[1]]);
    const retention = /\bretention-days:\s*(\d+)/.exec(line);
    if (retention) artifactRetentionDays.push(Number(retention[1]));
  }
  if (!/^name:\s*\S/m.test(source)) errors.push('WORKFLOW_NAME_MISSING');
  if (!triggers.size && !/^on:\s*\[/.test(source)) errors.push('WORKFLOW_TRIGGERS_UNDETECTED');
  if (!jobs.size) errors.push('WORKFLOW_JOBS_UNDETECTED');
  if ([...artifactRetentionDays].some(n => !Number.isInteger(n) || n < 1 || n > 90)) errors.push('INVALID_ARTIFACT_RETENTION');
  return { file: name, triggers: [...triggers].sort(), jobs: [...jobs].sort(), checkNames: [...checkNames].sort(), permissions, dependencies, artifactRetentionDays, errors };
}

export function auditWorkflowInventory(root = ROOT, manifest = null) {
  const errors = [], warnings = [];
  const manifestPath = path.join(root,'config/workflow-inventory-v654.json');
  if (!manifest) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8')); }
    catch { return { ok:false, errors:['WORKFLOW_MANIFEST_UNREADABLE'], warnings, workflows:[] }; }
  }
  if (manifest?.schemaVersion !== 1 || manifest?.issue !== 654 || !Array.isArray(manifest?.workflows))
    return { ok:false, errors:['WORKFLOW_MANIFEST_INVALID'], warnings, workflows:[] };
  const dir = path.join(root, WORKFLOW_DIR);
  if (!fs.existsSync(dir)) return {ok:false, errors:['WORKFLOW_DIRECTORY_MISSING'], warnings, workflows:[]};
  const files = fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).map(f=>WORKFLOW_DIR+"/"+f).sort();
  const entries = new Map();
  for (const item of manifest.workflows) {
    if (!item || !SAFE_FILE.test(item.file)) { errors.push('INVALID_INVENTORY_PATH'); continue; }
    if (entries.has(item.file)) { errors.push('DUPLICATE_INVENTORY_ENTRY:'+item.file); continue; }
    entries.set(item.file,item);
    if (!CATEGORIES.has(item.classification)) errors.push('INVALID_CLASSIFICATION:'+item.file);
    if (!SAFE_OWNER.test(item.owner)) errors.push('INVALID_OWNER:'+item.file);
    if (!['ACTIVE','REVIEW_REQUIRED','RETIRED'].includes(item.status)) errors.push('INVALID_STATUS:'+item.file);
    if (!item.reason || typeof item.reason !== 'string') errors.push('MISSING_REASON:'+item.file);
    if (['TEMPORARY','SUPERSEDED'].includes(item.classification) && item.status === 'RETIRED' && !item.consumerProof)
      errors.push('RETIREMENT_WITHOUT_CONSUMER_PROOF:'+item.file);
  }
  for (const file of files) if (!entries.has(file)) errors.push('UNCLASSIFIED_WORKFLOW:'+file);
  for (const file of entries.keys()) if (!files.includes(file)) errors.push('INVENTORY_FILE_MISSING:'+file);
  const workflows=[];
  for (const file of files) {
    const source=fs.readFileSync(path.join(root,file),'utf8');
    const report=inspectWorkflow(source,file);
    workflows.push({ ...report, classification:entries.get(file)?.classification || null, owner:entries.get(file)?.owner || null, status:entries.get(file)?.status || null });
    errors.push(...report.errors.map(e=>file+':'+e));
    if (entries.get(file)?.classification === 'TEMPORARY' && entries.get(file)?.status !== 'RETIRED')
      warnings.push('REVIEW_TEMPORARY:'+file);
    if (!/\bpermissions:\s*\n/m.test(source)) warnings.push('PERMISSIONS_NOT_EXPLICIT:'+file);
  }
  return {ok:errors.length===0,workflowCount:files.length,classifiedCount:files.filter(f=>entries.has(f)).length,errors:errors.sort(),warnings:warnings.sort(),workflows};
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=auditWorkflowInventory();
  console.log(JSON.stringify(result,null,2));
  if (!result.ok) process.exitCode=1;
}
