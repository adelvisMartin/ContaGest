import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const raw=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GIT_SHA||process.env.COMMIT_SHA||'').trim();
const candidateSha=/^[a-f0-9]{40}$/i.test(raw)?raw.toLowerCase():'local-unbound';
const payload={
  schemaVersion:1,
  product:'contagest-erp',
  version:pkg.version,
  candidateSha,
  bound:candidateSha!=='local-unbound',
  mobileContract:['#180','#181','#182'],
  generatedAt:new Date().toISOString()
};
const out=fileURLToPath(new URL('../public/build-info.json',import.meta.url));
fs.writeFileSync(out,JSON.stringify(payload,null,2)+'\n');
console.log(`[build-info] ${payload.product} ${payload.version} sha=${payload.candidateSha}`);
