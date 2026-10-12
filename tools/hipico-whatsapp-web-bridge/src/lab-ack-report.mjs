import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { loadRuntimeConfig } from './runtime-config.mjs';
import { createLabTestReplyJournal, LAB_TEST_ACK_STATES } from './lab-test-reply-journal.mjs';

export function parseLabAckReportArgs(argv=[]){
  const args={state:'all',limit:50,check:false};
  const provided=new Set();
  for(const arg of argv){
    if(arg==='--check'){
      if(provided.has('check'))throw new Error('LAB_TEST_REPORT_ARG_DUPLICATED');
      provided.add('check');args.check=true;continue;
    }
    const match=/^--(state|limit)=(.+)$/.exec(arg);
    if(!match||provided.has(match[1]))throw new Error('LAB_TEST_REPORT_ARG_INVALID');
    const [,key,value]=match;
    provided.add(key);
    if(key==='state'){
      if(value!=='all'&&!LAB_TEST_ACK_STATES.includes(value))throw new Error('LAB_TEST_REPORT_STATE_INVALID');
      args.state=value;
    }else{
      if(!/^[1-9][0-9]*$/.test(value)||Number(value)>100)throw new Error('LAB_TEST_REPORT_LIMIT_INVALID');
      args.limit=Number(value);
    }
  }
  return args;
}

export async function runLabAckReport({argv=[],env=process.env,rootDir=null}={}){
  const args=parseLabAckReportArgs(argv);
  const config=loadRuntimeConfig(env,process.cwd());
  if(!config.sourceGroupId||!config.labGroupId||config.sourceGroupId===config.labGroupId){
    throw new Error('LAB_TEST_REPORT_GROUP_PINS_REQUIRED');
  }
  // Only trusted config resolves the directory; no --dir arbitrary path override.
  const root=path.resolve(rootDir??path.join(config.dataDir,'lab-test-replies'));
  const journal=createLabTestReplyJournal({
    rootDir:root,
    labGroupId:config.labGroupId,
    sourceGroupId:config.sourceGroupId
  });
  const report=await journal.inspectReadOnly(args);
  return{report,exitCode:args.check&&report.reviewRequired>0?2:0};
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  try{
    const {report,exitCode}=await runLabAckReport({argv:process.argv.slice(2)});
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    process.exitCode=exitCode;
  }catch(error){
    // Never serialize paths, file bytes, group JIDs or nested cause messages.
    const code=String(error?.message||'');
    const safe=/^LAB_TEST_[A-Z0-9_]+$/.test(code)?code:'LAB_TEST_REPORT_FAILED';
    process.stderr.write(JSON.stringify({ok:false,code:safe})+'\n');
    process.exitCode=1;
  }
}
