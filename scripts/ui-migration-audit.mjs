import fs from 'node:fs';
import path from 'node:path';
import { auditUiMigration } from '../qa/support/ui-migration-audit.mjs';

const root=process.cwd();
const report=auditUiMigration(root);
const outDir=path.join(root,'artifacts','qa');
fs.mkdirSync(outDir,{recursive:true});
const outFile=path.join(outDir,'ui-migration-audit.json');
fs.writeFileSync(outFile,JSON.stringify(report,null,2)+'\n');
console.log(`UI migration audit: MUI=${report.counts.migratedMui} exceptions=${report.counts.legacyExceptions} errors=${report.errors.length}`);
console.log(`Report: ${path.relative(root,outFile).replaceAll('\\\\','/')}`);
if(!report.ok)process.exitCode=1;
