import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.resolve(here, '..');
const androidApp = path.join(wrapper, 'android', 'app');
const res = path.join(androidApp, 'src', 'main', 'res');
const manifest = path.join(androidApp, 'src', 'main', 'AndroidManifest.xml');
const icon = path.join(wrapper, 'www', 'icons', 'icon-192.png');
const maskable = path.join(wrapper, 'www', 'icons', 'icon-192-maskable.png');

for (const file of [manifest, icon, maskable]) {
  if (!fs.existsSync(file)) throw new Error(`Branding Android: falta ${file}`);
}

const densityDirs = ['mipmap-mdpi','mipmap-hdpi','mipmap-xhdpi','mipmap-xxhdpi','mipmap-xxxhdpi'];
for (const dir of densityDirs) {
  const target = path.join(res, dir);
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(icon, path.join(target, 'ic_launcher.png'));
  fs.copyFileSync(icon, path.join(target, 'ic_launcher_round.png'));
  fs.copyFileSync(maskable, path.join(target, 'ic_launcher_foreground.png'));
}

const adaptiveDir = path.join(res, 'mipmap-anydpi-v26');
fs.mkdirSync(adaptiveDir, { recursive: true });
const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/hipico_launcher_background" />\n  <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n`;
fs.writeFileSync(path.join(adaptiveDir, 'ic_launcher.xml'), adaptiveXml, 'utf8');
fs.writeFileSync(path.join(adaptiveDir, 'ic_launcher_round.xml'), adaptiveXml, 'utf8');

const values = path.join(res, 'values');
fs.mkdirSync(values, { recursive: true });
fs.writeFileSync(
  path.join(values, 'hipico_launcher.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="hipico_launcher_background">#721522</color>\n</resources>\n`,
  'utf8'
);

let xml = fs.readFileSync(manifest, 'utf8');
xml = xml.replace(/android:icon="[^"]+"/, 'android:icon="@mipmap/ic_launcher"');
if (/android:roundIcon="[^"]+"/.test(xml)) {
  xml = xml.replace(/android:roundIcon="[^"]+"/, 'android:roundIcon="@mipmap/ic_launcher_round"');
} else {
  xml = xml.replace(/<application\b/, '<application android:roundIcon="@mipmap/ic_launcher_round"');
}
fs.writeFileSync(manifest, xml, 'utf8');

console.log('Branding Android: launcher normal/round/adaptive alineado con los iconos oficiales de Control Hípico.');
