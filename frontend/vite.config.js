import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const canonicalFontStylesheet = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';

const privateAppPlugin = {
  name: 'contagest-private-app-shell',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      // Marketing pages are independent HTML entries. Never inject private-app PWA or SEO
      // metadata into them; the marker exists only in frontend/index.html.
      if (!html.includes('data-contagest-private-app')) return html;

      const metadata = `    <meta name="application-name" content="ContaGest-VE Enterprise" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="ContaGest" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="format-detection" content="telephone=no" />
    <meta name="color-scheme" content="light dark" />`;

      return html
        .replaceAll('11.12.0', '11.14.0')
        .replaceAll('11.13.0', '11.14.0')
        .replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />')
        .replace(/https:\/\/fonts\.googleapis\.com\/css2\?family=[^"]+/, canonicalFontStylesheet)
        .replace(/<link rel="manifest"[^>]*>/, '<link rel="manifest" href="/manifest.webmanifest" />')
        .replace('</head>', `${metadata}\n</head>`)
        .replace('</body>', '  <script src="/pwa-install.js" defer></script>\n</body>');
    }
  }
};

export default defineConfig({
  plugins: [privateAppPlugin],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        app: resolve(rootDir, 'index.html'),
        soluciones: resolve(rootDir, 'soluciones/index.html'),
        'soluciones-comercios': resolve(rootDir, 'soluciones/comercios/index.html'),
        'soluciones-contadores': resolve(rootDir, 'soluciones/contadores/index.html'),
        'soluciones-salud-veterinaria': resolve(rootDir, 'soluciones/salud-veterinaria/index.html'),
        'soluciones-gimnasios': resolve(rootDir, 'soluciones/gimnasios/index.html'),
        'soluciones-multiempresa': resolve(rootDir, 'soluciones/multiempresa/index.html'),
        'portal-veterinaria': resolve(rootDir, 'portal/veterinaria/index.html')
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@mui/') || id.includes('@emotion/')) return 'vendor-mui';
          if (id.includes('react/') || id.includes('react-dom/')) return 'vendor-react';
          if (id.includes('html5-qrcode')) return 'vendor-scanner';
          if (id.includes('qrcode')) return 'vendor-qrcode';
          return 'vendor';
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    hmr: {
      host: 'localhost',
      protocol: 'ws',
      clientPort: 8080
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true
  }
});
