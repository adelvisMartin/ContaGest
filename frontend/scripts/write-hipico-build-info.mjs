import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const configPath=fileURLToPath(new URL('../public/hipico-control/assets/js/config.js',import.meta.url));
const configSource=fs.readFileSync(configPath,'utf8');
const versionMatch=configSource.match(/export const APP_VERSION\s*=\s*["']([^"']+)["']/);
if(!versionMatch?.[1])throw new Error('HIPICO_APP_VERSION_NOT_FOUND');

const version=versionMatch[1].trim();
if(!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version))throw new Error('HIPICO_APP_VERSION_INVALID');

const rawSha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GIT_SHA||process.env.COMMIT_SHA||'').trim();
const candidateSha=/^[a-f0-9]{40}$/i.test(rawSha)?rawSha.toLowerCase():'local-unbound';
const rawChannel=String(process.env.HIPICO_RELEASE_CHANNEL||'pilot').trim().toLowerCase();
const channel=['lab','pilot','production'].includes(rawChannel)?rawChannel:'pilot';
const revision=String(process.env.VERCEL_GIT_COMMIT_REF||process.env.GIT_BRANCH||'source').trim().slice(0,160)||'source';

const payload={
  schemaVersion:2,
  product:'control-hipico',
  version,
  channel,
  revision,
  buildId:version,
  candidateSha,
  bound:candidateSha!=='local-unbound',
  generatedAt:new Date().toISOString(),
  baseline:'Hipico-Control-v1.13.0-RC1.apk#sha256-b477dbe224596b4e',
  source:'git-canonical-web',
  compatibility:{
    workspaceSchema:10,
    parserContract:'whatsapp-parser-v1'
  }
};

const out=fileURLToPath(new URL('../public/hipico-control/build-info.json',import.meta.url));
fs.writeFileSync(out,`${JSON.stringify(payload,null,2)}\n`,'utf8');
console.log(`[hipico-build-info] ${payload.version} sha=${payload.candidateSha} channel=${payload.channel}`);
