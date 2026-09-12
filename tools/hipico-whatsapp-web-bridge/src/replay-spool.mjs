import path from 'node:path';
import { loadRuntimeConfig } from './runtime-config.mjs';
import { BRIDGE_SPOOL_KINDS, createBridgeSpoolRuntime } from './spool-runtime.mjs';

function parseArgs(argv){
  return Object.fromEntries(argv.map((arg)=>{
    const [key,...rest]=arg.replace(/^--/,'').split('=');
    return[key,rest.join('=')||'true'];
  }));
}

const args=parseArgs(process.argv.slice(2));
const config=loadRuntimeConfig();
const rootDir=path.resolve(args.dir||path.join(config.dataDir,'spool-v2'));
const kind=String(args.kind||BRIDGE_SPOOL_KINDS.LAB_MIRROR);
const destination=String(args.destination||'');
const expectedDestination=kind===BRIDGE_SPOOL_KINDS.LAB_MIRROR
  ? String(config.labChannelKey||'')
  : kind===BRIDGE_SPOOL_KINDS.BACKEND_EVENT
    ? 'backend-ingest'
    : '';
const limit=Math.max(1,Math.min(1000,Number(args.limit||100)));
const execute=args.execute==='true';

if(!expectedDestination)throw new Error('REPLAY_KIND_OR_DESTINATION_NOT_CONFIGURED');
if(!destination)throw new Error('REPLAY_DESTINATION_REQUIRED');

const runtime=createBridgeSpoolRuntime({rootDir,parserVersion:String(args.parser||'whatsapp-parser-v1')});
const plan=await runtime.replayPlan({kind,destination,expectedDestination,from:args.from||null,to:args.to||null,limit});
console.log(JSON.stringify({mode:execute?'REQUEUE_REQUESTED':'DRY_RUN',rootDir,...plan},null,2));

if(execute){
  const expectedCount=Number(args['expected-count']);
  if(!Number.isInteger(expectedCount)||expectedCount<0)throw new Error('REPLAY_EXPECTED_COUNT_REQUIRED');
  if(args.confirm!=='REQUEUE')throw new Error('REPLAY_CONFIRM_REQUEUE_REQUIRED');
  if(expectedCount!==plan.count)throw new Error(`REPLAY_COUNT_CHANGED expected=${expectedCount} actual=${plan.count}`);
  const result=await runtime.requestReplay({
    kind,destination,expectedDestination,
    recordIds:plan.eligible.map((row)=>row.recordId),
    expectedCount
  });
  console.log(JSON.stringify({mode:'REQUEUED_FOR_LIVE_RUNTIME',...result},null,2));
}
