import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const assetsDir = path.resolve('frontend/dist/assets');
const maxChunkBytes = 700 * 1024;
const maxTotalBytes = 3.5 * 1024 * 1024;

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes:true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(target) : [target];
  }));
  return nested.flat();
}

const javascript = (await filesIn(assetsDir)).filter((file) => file.endsWith('.js'));
if (!javascript.length) throw new Error('No se encontraron chunks JavaScript. Ejecuta primero el build del frontend.');

const chunks = await Promise.all(javascript.map(async (file) => ({ file:path.relative(assetsDir,file), bytes:(await stat(file)).size })));
chunks.sort((left,right) => right.bytes-left.bytes);
const oversized = chunks.filter((chunk) => chunk.bytes > maxChunkBytes);
const total = chunks.reduce((sum,chunk) => sum+chunk.bytes,0);

console.table(chunks.slice(0,10).map((chunk) => ({ chunk:chunk.file, kib:Number((chunk.bytes/1024).toFixed(1)) })));
if (oversized.length) throw new Error(`Presupuesto excedido: ${oversized.map((chunk)=>`${chunk.file} (${(chunk.bytes/1024).toFixed(1)} KiB)`).join(', ')}`);
if (total > maxTotalBytes) throw new Error(`El JavaScript total excede ${(maxTotalBytes/1024/1024).toFixed(1)} MiB: ${(total/1024/1024).toFixed(2)} MiB.`);
console.log(`Bundle aprobado: ${chunks.length} chunks, máximo ${(chunks[0].bytes/1024).toFixed(1)} KiB, total ${(total/1024/1024).toFixed(2)} MiB.`);
