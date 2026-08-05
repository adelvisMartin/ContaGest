import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const source = join(root, "hipico-assets");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const files = [
  "app.css",
  "loader.js",
  "app-gz-0.part",
  "app-gz-1.part",
  "manifest.webmanifest",
  "sw.js",
  "icon.svg"
];

for (const file of files) {
  const target = join(dist, file);
  await mkdir(dirname(target), { recursive: true });
  await cp(join(source, file), target);
}

await cp(join(root, "index.html"), join(dist, "index.html"));
console.log("Build Hípico Control listo.");
