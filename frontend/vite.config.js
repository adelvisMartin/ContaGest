import { defineConfig } from 'vite';

const canonicalFontStylesheet = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';

const pwaInstallPlugin = {
  name: 'contagest-pwa-install',
  transformIndexHtml(html) {
    const metadata = `    <meta name="application-name" content="ContaGest-VE Enterprise" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="ContaGest" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="https://conta-gest-frontend.vercel.app/" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="es_VE" />
    <meta property="og:site_name" content="ContaGest-VE Enterprise" />
    <meta property="og:title" content="ContaGest-VE Enterprise | Gestión empresarial" />
    <meta property="og:description" content="ERP empresarial para ventas, inventario, contabilidad, fiscal, bancos, nómina y operaciones." />
    <meta property="og:url" content="https://conta-gest-frontend.vercel.app/" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="ContaGest-VE Enterprise" />
    <meta name="twitter:description" content="Gestión empresarial segura, adaptable y centralizada." />`;
    return html
      .replaceAll('11.12.0', '11.14.0')
      .replaceAll('11.13.0', '11.14.0')
      .replace(/https:\/\/fonts\.googleapis\.com\/css2\?family=[^"]+/, canonicalFontStylesheet)
      .replace(/<link rel="manifest"[^>]*>/, '<link rel="manifest" href="/manifest.webmanifest" />')
      .replace('</head>', `${metadata}\n</head>`)
      .replace('</body>', '  <script src="/pwa-install.js" defer></script>\n</body>');
  }
};

export default defineConfig({
  plugins: [pwaInstallPlugin],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
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
