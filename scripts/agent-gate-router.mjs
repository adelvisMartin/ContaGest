import { execFileSync } from 'node:child_process';
import { gatesForFiles } from '../qa/support/domain-risk-catalog.mjs';

const args=process.argv.slice(2);
const valueOf=(flag)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:'';};
const explicit=valueOf('--files');
const base=valueOf('--base')||process.env.CG_DIFF_BASE||'main';
let files=[];
if(explicit){files=explicit.split(',').map((item)=>item.trim()).filter(Boolean);}else{
  try{files=execFileSync('git',['diff','--name-only',`${base}...HEAD`],{encoding:'utf8'}).split(/\r?\n/).map((item)=>item.trim()).filter(Boolean);}catch(error){console.error(`No se pudo obtener el diff contra ${base}: ${error.message}`);process.exit(2);}
}
const domains=gatesForFiles(files);
const unique=(values)=>[...new Set(values)].sort();
const output={base,files,domains:domains.map(({id,severity})=>({id,severity})),agents:unique(domains.flatMap((domain)=>domain.agents)),skills:unique(domains.flatMap((domain)=>domain.skills)),gates:unique(domains.flatMap((domain)=>domain.gates)),critical:domains.some((domain)=>domain.severity==='critical')};
console.log(JSON.stringify(output,null,2));
if(!files.length)console.error('Aviso: no se detectaron archivos modificados.');
if(output.critical)console.error('Cambio crítico detectado: no reducir gates sin evidencia y aprobación del owner.');
