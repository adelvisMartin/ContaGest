import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('frontend/dist');
const assets = path.join(root, 'assets');
if (!fs.existsSync(root)) throw new Error('frontend/dist does not exist; build frontend before capturing bundle baseline.');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const files = walk(root).map((absolute) => ({
  file: path.relative(root, absolute).replaceAll('\\', '/'),
  bytes: fs.statSync(absolute).size,
}));
const chunks = files.filter((entry) => /\.(?:js|css)$/i.test(entry.file)).sort((a, b) => b.bytes - a.bytes);
const output = {
  ticket: '#564',
  candidateSha: process.env.CANDIDATE_SHA || process.env.GITHUB_SHA || 'unknown',
  budgetMode: 'observe-only',
  capturedAt: new Date().toISOString(),
  build: {
    totalBytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    jsCssBytes: chunks.reduce((sum, entry) => sum + entry.bytes, 0),
    fileCount: files.length,
    chunkCount: chunks.length,
    largestChunks: chunks.slice(0, 20),
    assetsDirectoryPresent: fs.existsSync(assets),
  },
};
const outputDir = path.resolve('artifacts/performance');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'frontend-bundle-v564.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
