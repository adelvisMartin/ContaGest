import fs from 'node:fs';
import { reconcileClaims } from './agent-system-v3-lib.mjs';

const args=process.argv.slice(2);
const valueOf=(flag)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:'';};
const CLAIM_MODE=/^Agent-Claim-Mode:\s*(exclusive|advisory)\s*$/im;
const CLAIM_ISSUE=/^Agent-Claim-Issue:\s*#?(\d+)\s*$/im;
const SUPERSEDES=/^Agent-Claim-Supersedes:\s*([^\n]+)$/im;
const CLOSURE=/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/i;

function repository(value){const slug=String(value??'').trim();if(!/^[^/]+\/[^/]+$/.test(slug))throw new Error('repository must be owner/name');return slug;}
function parseClaim(pr){
  const body=String(pr.body??'');
  const issue=Number(body.match(CLAIM_ISSUE)?.[1]||body.match(CLOSURE)?.[1]);
  if(!Number.isInteger(issue))return null;
  const mode=body.match(CLAIM_MODE)?.[1]||'exclusive';
  const supersedes=(body.match(SUPERSEDES)?.[1]||'').split(',').map((item)=>item.trim().replace(/^#/,'')).filter(Boolean).map((id)=>`pr-${id}`);
  return {id:`pr-${pr.number}`,issue,mode,status:pr.state==='open'?'active':'closed',updatedAt:pr.updated_at||null,supersedes};
}
async function fetchOpenPullRequests(repo,token){
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'contagest-agent-system-v3'};
  if(token)headers.Authorization=`Bearer ${token}`;
  const results=[];
  for(let page=1;page<=10;page+=1){
    const response=await fetch(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=100&page=${page}`,{headers});
    if(!response.ok)throw new Error(`GitHub pull-request lookup failed: HTTP ${response.status}`);
    const batch=await response.json();results.push(...batch);if(batch.length<100)break;
  }
  return results;
}

async function main(){
  if(args.includes('--help')){console.log('Agent System v3 work-claim reconciliation. Exclusive claims block duplicates; advisory claims never own closure; one directed supersession root is required.');return;}
  const fixture=valueOf('--fixture');
  const prs=fixture?JSON.parse(fs.readFileSync(fixture,'utf8')):await fetchOpenPullRequests(repository(valueOf('--repo')||process.env.GITHUB_REPOSITORY),process.env.GITHUB_TOKEN||'');
  const claims=prs.map(parseClaim).filter(Boolean);
  const result=reconcileClaims(claims);
  console.log(JSON.stringify({schemaVersion:3,claims,result},null,2));
  if(!result.ok)process.exitCode=1;
}
main().catch((error)=>{console.error(`DUPLICATE_WORK_CLAIM_GATE_BLOCKED ${error.message}`);process.exitCode=2;});
