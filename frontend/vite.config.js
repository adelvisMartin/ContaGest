import { defineConfig } from 'vite';

const pwaInstallPlugin = {
  name: 'contagest-pwa-install',
  transformIndexHtml(html) {
    return html
      .replaceAll('11.12.0', '11.13.0')
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
