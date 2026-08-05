import { access, readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

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

const [html, loader, part0, part1, manifestText, css, sw] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("hipico-assets/loader.js", "utf8"),
  readFile("hipico-assets/app-gz-0.part", "utf8"),
  readFile("hipico-assets/app-gz-1.part", "utf8"),
  readFile("hipico-assets/manifest.webmanifest", "utf8"),
  readFile("hipico-assets/app.css", "utf8"),
  readFile("hipico-assets/sw.js", "utf8")
]);

if (!html.includes('lang="es"') || !html.includes("Hípico Control")) throw new Error("Shell PWA incompleto.");
if (!loader.includes("DecompressionStream") || !loader.includes("app-gz-1.part")) throw new Error("Loader incompleto.");
if (part0.length < 10000 || part1.length < 10000) throw new Error("Bundle comprimido incompleto.");
const source = gunzipSync(Buffer.from((part0 + part1).trim(), "base64")).toString("utf8");
for (const marker of [
  "generateWhatsappText",
  "generateBetReceiptText",
  "generateBalancesWhatsappText",
  "generateDailySummaryText",
  "movement-form",
  "Guardar apuesta y preparar WhatsApp",
  "TERCIO",
  "DISPONIBLE",
  "Arevalo",
  "Xavier",
  "quickPlays",
  "quickAmounts"
]) if (!source.includes(marker)) throw new Error(`Falta control funcional: ${marker}`);
if (!source.includes('clubName: "CLUB HIPICO TRIPLE COWN"')) throw new Error("No está el ejemplo oficial del club.");
if (!source.includes('board: ["6", "8", "5", "2", "", ""]')) throw new Error("No está la pizarra de caracterización.");
if (!css.includes("quick-chip") || !css.includes("@media")) throw new Error("Estilos móviles/accesos rápidos incompletos.");
const manifest = JSON.parse(manifestText);
if (manifest.display !== "standalone" || manifest.start_url !== "/") throw new Error("Manifest PWA inválido.");
if (!manifest.shortcuts?.some(x => x.url?.includes("reports"))) throw new Error("Falta acceso rápido a disponibles.");
if (!sw.includes("hipico-control-v1.2.0")) throw new Error("Service worker sin versión v1.2.0.");
console.log("QA Hípico Control v1.2 aprobada: comprobante, plano, disponibles, movimientos, cierre y PWA.");
