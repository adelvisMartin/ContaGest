import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const privateIndex = read('frontend/index.html');
const vite = read('frontend/vite.config.js');
const vercel = read('frontend/vercel.json');
const robots = read('frontend/public/robots.txt');
const sitemap = read('frontend/public/sitemap.xml');
const marketingJs = read('frontend/src/marketing/marketing.js');
const marketingCss = read('frontend/src/marketing/marketing.css');
const brand = read('frontend/src/pages/BrandGuidelinesPage.js');
const claims = read('docs/MARKETING_CLAIMS_REGISTER.md');
const seoDoc = read('docs/MARKETING_SEO_V1.md');

const publicPages = [
  ['soluciones','frontend/soluciones/index.html','https://conta-gest-frontend.vercel.app/soluciones/'],
  ['comercios','frontend/soluciones/comercios/index.html','https://conta-gest-frontend.vercel.app/soluciones/comercios/'],
  ['contadores','frontend/soluciones/contadores/index.html','https://conta-gest-frontend.vercel.app/soluciones/contadores/'],
  ['salud-veterinaria','frontend/soluciones/salud-veterinaria/index.html','https://conta-gest-frontend.vercel.app/soluciones/salud-veterinaria/'],
  ['gimnasios','frontend/soluciones/gimnasios/index.html','https://conta-gest-frontend.vercel.app/soluciones/gimnasios/'],
  ['multiempresa','frontend/soluciones/multiempresa/index.html','https://conta-gest-frontend.vercel.app/soluciones/multiempresa/']
].map(([name,path,canonical]) => ({ name,path,canonical,html:read(path) }));

test('la SPA privada es noindex y ya no contiene metadata SEO comercial indexable', () => {
  assert.match(privateIndex, /data-contagest-private-app/);
  assert.match(privateIndex, /<meta name="robots" content="noindex,nofollow,noarchive,nosnippet"/);
  assert.match(privateIndex, /<title>Acceso privado \| ContaGest<\/title>/);
  assert.match(privateIndex, /\/icons\/contagest-app\.svg/);
  assert.doesNotMatch(privateIndex, /content="index,follow/);
});

test('Vite transforma solo la app privada y compila las seis entradas comerciales', () => {
  assert.match(vite, /data-contagest-private-app/);
  assert.match(vite, /if \(!html\.includes\('data-contagest-private-app'\)\) return html/);
  assert.doesNotMatch(vite, /<meta name="robots" content="index,follow/);
  for (const path of [
    'soluciones/index.html',
    'soluciones/comercios/index.html',
    'soluciones/contadores/index.html',
    'soluciones/salud-veterinaria/index.html',
    'soluciones/gimnasios/index.html',
    'soluciones/multiempresa/index.html'
  ]) assert.match(vite, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('Vercel aplica noindex por header a la entrada privada/API sin bloquear las landings', () => {
  const config = JSON.parse(vercel);
  const headerMap = new Map(config.headers.map((entry) => [entry.source, entry.headers]));
  for (const source of ['/', '/index.html']) {
    const headers = headerMap.get(source) || [];
    assert.equal(headers.find((item) => item.key === 'X-Robots-Tag')?.value, 'noindex, nofollow, noarchive, nosnippet');
  }
  const api = headerMap.get('/api/(.*)') || [];
  assert.match(api.find((item) => item.key === 'X-Robots-Tag')?.value || '', /noindex/);
  assert.ok(headerMap.has('/soluciones/(.*)'));
});

test('robots y sitemap separan crawling público de rutas privadas', () => {
  assert.match(robots, /^Allow: \/soluciones\/$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Disallow: \/\*\?module=$/m);
  assert.doesNotMatch(robots, /^Disallow: \/$/m);
  assert.match(robots, /Sitemap: https:\/\/conta-gest-frontend\.vercel\.app\/sitemap\.xml/);

  for (const {canonical} of publicPages) assert.match(sitemap, new RegExp(`<loc>${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
  assert.doesNotMatch(sitemap, /\?module=/);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/conta-gest-frontend\.vercel\.app\/<\/loc>/);
});

test('cada landing pública tiene SEO propio, structured data, assets canónicos y CTA demo', () => {
  for (const page of publicPages) {
    assert.match(page.html, /<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"/);
    assert.match(page.html, new RegExp(`<link rel="canonical" href="${page.canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(page.html, /type="application\/ld\+json"/);
    assert.match(page.html, /\/brand\/contagest-logo\.svg/);
    assert.match(page.html, /\/icons\/contagest-app\.svg/);
    assert.match(page.html, /\/src\/marketing\/marketing\.css/);
    assert.match(page.html, /\/src\/marketing\/marketing\.js/);
    assert.match(page.html, /data-demo-cta/);
    assert.doesNotMatch(page.html, /https:\/\/wa\.me\/\d/);
    assert.doesNotMatch(page.html, /AggregateRating|"@type"\s*:\s*"Review"/);
  }
});

test('la portada comercial contiene las cinco verticales requeridas, pricing, FAQ y casos de uso', () => {
  const home = publicPages.find((page) => page.name === 'soluciones').html;
  for (const path of ['comercios','contadores','salud-veterinaria','gimnasios','multiempresa']) {
    assert.match(home, new RegExp(`/soluciones/${path}/`));
  }
  for (const price of ['USD 19','USD 22','USD 32','USD 45']) assert.match(home, new RegExp(price));
  assert.match(home, /FAQPage/);
  assert.match(home, /Casos de uso, no testimonios inventados/);
  assert.match(home, /precios objetivo mensuales, no una promesa contractual rígida/i);
});

test('claims delicados se muestran solo como planificados, condicionales o prohibidos', () => {
  const home = publicPages.find((page) => page.name === 'soluciones').html;
  assert.match(home, /SENIAT o conciliación bancaria universal en tiempo real<\/strong><span class="mk-status mk-status-planned">Planificado<\/span>/);
  assert.match(home, /IA y canales WhatsApp\/SMS\/email<\/strong><span class="mk-status mk-status-beta">Condicional<\/span>/);
  assert.match(home, /“Inhackeable”, “100% seguro” o “cifrado end-to-end”<\/strong><span class="mk-status mk-status-rule">No usar<\/span>/);
  assert.match(claims, /## Prohibidos sin evidencia adicional/);
  assert.match(claims, /Testimonios, ratings, número de clientes, ahorro porcentual o resultados cuantificados/);
});

test('CTA WhatsApp nunca inventa teléfono y solo se activa con configuración pública válida', () => {
  assert.match(marketingJs, /VITE_MARKETING_WHATSAPP_NUMBER/);
  assert.match(marketingJs, /\^\\d\{8,15\}\$/);
  assert.match(marketingJs, /node\.hidden = true/);
  assert.match(marketingJs, /https:\/\/wa\.me\/\$\{phone\}/);
  assert.doesNotMatch(marketingJs, /wa\.me\/\d{8,}/);
});

test('BrandGuidelines usa exactamente los assets v11.15 y documenta la frontera SEO', () => {
  assert.match(brand, /src="\/icons\/contagest-app\.svg"/);
  assert.match(brand, /src="\/brand\/contagest-logo\.svg"/);
  assert.match(brand, /sitio comercial indexable vive en <code>\/soluciones\/<\/code>/);
  assert.match(brand, /Aplicación privada: \/ \+ \?module=… \+ noindex/);
});

test('la capa pública tiene contratos básicos de accesibilidad y responsive', () => {
  for (const page of publicPages) assert.match(page.html, /class="mk-skip" href="#contenido"/);
  assert.match(marketingCss, /:focus-visible/);
  assert.match(marketingCss, /prefers-reduced-motion/);
  assert.match(marketingCss, /@media \(max-width: 680px\)/);
  assert.match(marketingCss, /min-width: 320px/);
});

test('documentación de SEO preserva pricing como referencia y define el rollback', () => {
  assert.match(seoDoc, /Subscription\.amount.*fuente contractual real/s);
  assert.match(seoDoc, /No se usa `Disallow: \/`/);
  assert.match(seoDoc, /No hay migraciones ni cambios de base de datos/);
});
