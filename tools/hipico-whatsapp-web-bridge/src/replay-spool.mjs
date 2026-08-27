import fs from 'node:fs/promises';
import path from 'node:path';
import { loadSpoolFile,planReplay,quarantineFile } from './spool-journal.mjs';

const args=Object.fromEntries(process.argv.slice(2).map((arg)=>{const [key,...rest]=arg.replace(/^--/,'').split('=');return[key,rest.join('=')||'true'];}));
const dir=path.resolve(args.dir||'data/spool-lab-mirror-v2');
const quarantineDir=path.resolve(args.quarantine||'data/quarantine-v2');
const destination=String(args.destination||'');
const expected=String(process.env.HIPICO_LAB_CHANNEL_KEY||'');
const execute=args.execute==='true';
if(!expected)throw new Error('HIPICO_LAB_CHANNEL_KEY_REQUIRED');

const files=(await fs.readdir(dir).catch(()=>[])).filter((name)=>name.endsWith('.json')).sort();
const records=[];
for(const name of files){
  const file=path.join(dir,name);const loaded=await loadSpoolFile(file,{parserVersion:args.parser||undefined});
  if(!loaded.validation.valid){
    await quarantineFile(file,quarantineDir,loaded.validation.errors.join(','));continue;
  }
  records.push(loaded.record);
}
const plan=planReplay(records,{destination,expectedDestination:expected,from:args.from,to:args.to,dryRun:!execute});
console.log(JSON.stringify({mode:execute?'EXECUTE_REQUESTED':'DRY_RUN',...plan},null,2));
if(execute){
  throw new Error('REPLAY_EXECUTION_REQUIRES_RUNTIME_ADAPTER');
}
