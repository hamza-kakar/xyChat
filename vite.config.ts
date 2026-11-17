import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { type Plugin, defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME } from './src/app/app-name';

const projectRoot = dirname(fileURLToPath(import.meta.url));

/**
 * The Content Security Policy required by AGENTS.md §15.1. GitHub Pages cannot
 * set response headers, so the policy is delivered via a meta element. It is
 * injected only at build time: the dev server injects its own inline styles
 * and HMR scripts, which a strict CSP would break.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "style-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "manifest-src 'self'",
].join('; ');

function injectCspMeta(): Plugin {
  return {
    name: 'chatkeep:inject-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      const metaTag = `<meta http-equiv="Content-Security-Policy" content="${CSP_DIRECTIVES}">`;
      return html.replace('</title>', `</title>\n    ${metaTag}`);
    },
  };
}

async function readPackageVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  return packageJson.version;
}

export default defineConfig(async () => {
  const appVersion = await readPackageVersion();
  return {
    base: process.env['VITE_BASE'] ?? '/waChatBack/',
    plugins: [
      react(),
      tailwindcss(),
      injectCspMeta(),
      VitePWA({
        registerType: 'prompt',
        manifest: {
          name: APP_NAME,
          short_name: APP_NAME,
          description: 'A private, offline viewer for exported chat archives.',
          start_url: './',
          scope: './',
          display: 'standalone',
          background_color: '#f6f7f8',
          theme_color: '#0e7c66',
          icons: [
            {
              src: 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,wasm,svg,png,webmanifest}'],
          navigateFallback: 'index.html',
        },
        injectRegister: 'auto',
      }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
  };
});
