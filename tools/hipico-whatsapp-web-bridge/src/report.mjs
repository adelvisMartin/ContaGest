import fs from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve(String(
  process.env.HIPICO_DATA_DIR ||
  (process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'ControlHipicoBridge', 'data')
    : path.join(process.cwd(), 'data'))
));
const trainingDir = path.join(dataDir, 'training');
const includeSamples = String(process.env.HIPICO_REPORT_INCLUDE_SAMPLES || '').toLowerCase() === 'true';
let files = [];
try { files = (await fs.readdir(trainingDir)).filter((name) => name.endsWith('.jsonl')).sort(); } catch {}
if (!files.length) {
  console.log('Todavía no hay journal de entrenamiento. Inicia el Bridge y deja llegar mensajes nuevos.');
  process.exit(0);
}

const counts = new Map();
const risks = new Map();
let total = 0;
let backendMatched = 0;
let backendDifferent = 0;
const recent = [];
for (const file of files) {
  const text = await fs.readFile(path.join(trainingDir, file), 'utf8');
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    let row; try { row = JSON.parse(line); } catch { continue; }
    total += 1;
    const intent = row?.local?.intent || 'unknown';
    const risk = row?.local?.risk || 'unknown';
    counts.set(intent, (counts.get(intent) || 0) + 1);
    risks.set(risk, (risks.get(risk) || 0) + 1);
    if (row.backend?.classification) {
      if (row.backend.classification === intent) backendMatched += 1;
      else backendDifferent += 1;
    }
    if (includeSamples) {
      recent.push({ at: row.timestamp, sender: row.senderKey || 'pseudonymous', intent, text: String(row.text || '').replace(/\s+/g, ' ').slice(0, 100) });
    }
  }
}

console.log('\nCONTROL HÍPICO — RESUMEN SHADOW LOCAL');
console.log(`Mensajes journal: ${total}`);
console.log(`Backend vs local coinciden: ${backendMatched}`);
console.log(`Backend vs local difieren: ${backendDifferent}`);
console.log('\nPor intención:');
for (const [key, value] of [...counts.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${key.padEnd(24)} ${value}`);
console.log('\nPor riesgo:');
for (const [key, value] of [...risks.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${key.padEnd(12)} ${value}`);
if (includeSamples) {
  console.log('\nÚltimos 10 (habilitado explícitamente):');
  for (const row of recent.slice(-10)) console.log(`  ${row.at || ''} | ${row.sender || '-'} | ${row.intent} | ${row.text}`);
} else {
  console.log('\nMuestras de texto ocultas. Define HIPICO_REPORT_INCLUDE_SAMPLES=true solo durante una revisión autorizada.');
}
console.log('');
