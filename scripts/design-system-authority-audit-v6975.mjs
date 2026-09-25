#!/usr/bin/env node
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(file,'utf8');
const fail=(message)=>{console.error('[design-system-authority][FAIL] '+message);process.exitCode=1;};

const facadePath='frontend/src/components/designSystem.js';
const tokensPath='frontend/src/components/designTokens.js';
const kitPath='frontend/src/components/ui/kit.js';
const indexPath='frontend/src/components/ui/index.js';
const cssPath='frontend/src/styles/contagest-visual-system-v12.css';

for(const file of [facadePath,tokensPath,kitPath,indexPath,cssPath]){
  if(!fs.existsSync(file)) fail('missing authority file: '+file);
}
if(process.exitCode) process.exit(process.exitCode);

const facade=read(facadePath);
const tokens=read(tokensPath);
const kit=read(kitPath);
const index=read(indexPath);
const css=read(cssPath);

if(!facade.includes("from './ui/kit.js'")) fail('legacy facade must delegate to ./ui/kit.js');
if(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(tokens)) fail('designTokens.js must not define a second color palette');
if(!/export\s+\*\s+from\s+['"]\.\/kit\.js['"]/.test(index)) fail('ui/index.js must re-export the canonical kit');
if(!/export\s+(const|function)\s+Button\b/.test(kit)) fail('canonical kit must export Button');
if(!/export\s+(const|function)\s+PageHeader\b/.test(kit)) fail('canonical kit must export PageHeader');

const tokenRefs=[...tokens.matchAll(/var\((--cg-v-[a-z0-9-]+)\)/gi)].map((m)=>m[1]);
if(!tokenRefs.length) fail('designTokens.js must reference canonical --cg-v-* CSS variables');
for(const token of new Set(tokenRefs)){
  if(!css.includes(token+':')) fail('token facade references undeclared CSS variable: '+token);
}

if(!/Backward-compatible design-system facade/.test(facade)) fail('designSystem.js must remain an explicit compatibility facade');
if(!/Compatibility token facade/.test(tokens)) fail('designTokens.js must remain an explicit compatibility facade');

if(!process.exitCode){
  console.log('[design-system-authority][PASS] tokenRefs='+new Set(tokenRefs).size+' canonicalKit=frontend/src/components/ui/kit.js');
}
