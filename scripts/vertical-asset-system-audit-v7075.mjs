#!/usr/bin/env node
import fs from 'node:fs';

const fail=(message)=>{console.error('[vertical-assets][FAIL] '+message);process.exitCode=1;};
const read=(file)=>fs.readFileSync(file,'utf8');
const requiredKeys=['veterinary','dentistry','psychology','gym','nutrition','login'];
const catalogPath='frontend/src/assets/verticalAssets.js';
const indexPath='frontend/index.html';
const manifestPath='frontend/public/manifest.webmanifest';
const swPath='frontend/public/sw.js';

for(const file of [
  catalogPath,indexPath,manifestPath,swPath,
  'frontend/public/vendor/fontawesome/css/all.min.css',
  'frontend/public/vendor/fontawesome/LICENSE.txt',
  'frontend/public/vendor/fonts/fonts.css',
  'frontend/public/vendor/fonts/inter/OFL.txt',
  'frontend/public/vendor/fonts/jetbrains-mono/OFL.txt'
]) if(!fs.existsSync(file)) fail('missing required asset authority: '+file);

if(process.exitCode) process.exit(process.exitCode);

const catalog=read(catalogPath);
const index=read(indexPath);
const manifest=JSON.parse(read(manifestPath));
const sw=read(swPath);

for(const key of requiredKeys){
  const match=catalog.match(new RegExp(key+":'([^']+)'"));
  if(!match) { fail('catalog missing key: '+key); continue; }
  const publicPath='frontend/public'+match[1];
  if(!fs.existsSync(publicPath)) { fail('catalog points to missing asset: '+publicPath); continue; }
  const svg=read(publicPath);
  if(!/<svg\b[^>]*viewBox=/i.test(svg)) fail('SVG lacks viewBox: '+publicPath);
  if(/<script\b|(?:href|src)\s*=\s*["']https?:/i.test(svg)) fail('SVG contains executable or remote content: '+publicPath);
  if(!sw.includes(match[1])) fail('service worker does not precache '+match[1]);
}

for(const remote of ['fonts.googleapis.com','fonts.gstatic.com','cdnjs.cloudflare.com']){
  if(index.includes(remote)) fail('private shell still depends on remote visual asset: '+remote);
}
for(const local of ['/vendor/fontawesome/css/all.min.css','/vendor/fonts/fonts.css']){
  if(!index.includes(local)) fail('private shell missing local stylesheet: '+local);
}
for(const critical of [
  '/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  '/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  '/vendor/fontawesome/webfonts/fa-brands-400.woff2',
  '/vendor/fonts/inter/Inter-Variable.ttf',
  '/vendor/fonts/jetbrains-mono/JetBrainsMono-Variable.ttf'
]) if(!sw.includes(critical)) fail('PWA cache missing critical visual dependency: '+critical);

const shortcutText=JSON.stringify(manifest.shortcuts||[]);
for(const key of ['dentistry','psychology','veterinary','gym','nutrition']){
  const asset='/vertical-assets/'+key+'.svg';
  if(!shortcutText.includes(asset)) fail('PWA shortcut missing semantic icon: '+asset);
}

const owners={
  dentistry:'frontend/src/pages/DentistryPracticePage.jsx',
  psychology:'frontend/src/pages/PsychologyPracticePage.js',
  veterinary:'frontend/src/components/veterinary/VeterinaryWorkspacePrimitives.jsx',
  gym:'frontend/src/components/fitness/GymWorkspacePrimitives.jsx',
  nutrition:'frontend/src/components/fitness/GymNutritionPanel.jsx',
  login:'frontend/src/pages/LoginPage.js'
};
for(const [key,file] of Object.entries(owners)){
  const source=read(file);
  if(!source.includes(key)) fail('runtime owner does not reference semantic asset key '+key+': '+file);
}

if(!read('frontend/src/components/ui/kit.js').includes('verticalAsset(assetKey)')) fail('classic EmptyState does not use asset catalog');
if(!read('frontend/src/components/ui/cg/CgPrimitives.jsx').includes('verticalAsset(assetKey)')) fail('React EmptyState does not use asset catalog');
if(!read('frontend/src/styles/contagest-visual-system-v12.css').includes('.cgx-empty-asset')) fail('canonical CSS lacks asset geometry');

if(!process.exitCode) console.log('[vertical-assets][PASS] assets='+requiredKeys.length+' remoteCritical=0 pwa=covered');
