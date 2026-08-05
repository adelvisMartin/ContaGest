import { access, readFile } from "node:fs/promises";

const required = [
  "index.html",
  "hipico-assets/app.css",
  "hipico-assets/loader.js",
  "hipico-assets/app-gz-0.part",
  "hipico-assets/app-gz-1.part",
  "hipico-assets/manifest.webmanifest",
  "hipico-assets/sw.js",
  "hipico-assets/icon.svg"
];

for (const file of required) await access(file);

const [html, loader, part0, part1, manifest] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("hipico-assets/loader.js", "utf8"),
  readFile("hipico-assets/app-gz-0.part", "utf8"),
  readFile("hipico-assets/app-gz-1.part", "utf8"),
  readFile("hipico-assets/manifest.webmanifest", "utf8")
]);

if (!html.includes('lang="es"') || !html.includes("Hípico Control")) throw new Error("Shell PWA incompleto.");
if (!loader.includes("DecompressionStream") || !loader.includes("app-gz-1.part")) throw new Error("Loader incompleto.");
if (part0.length < 5000 || part1.length < 5000) throw new Error("Bundle comprimido incompleto.");
const parsedManifest = JSON.parse(manifest);
if (parsedManifest.display !== "standalone" || parsedManifest.start_url !== "/") throw new Error("Manifest PWA inválido.");

console.log("QA Hípico Control aprobada.");
