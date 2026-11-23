import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { type Plugin, defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME } from './src/app/app-name';
import { splashLinkTags } from './scripts/splash-screens';

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

function injectBuildMeta(): Plugin {
  return {
    name: 'wachatback:inject-meta',
    apply: 'build',
    transformIndexHtml(html) {
      const metaTag = `<meta http-equiv="Content-Security-Policy" content="${CSP_DIRECTIVES}">`;
      // The app name lives in one constant (AGENTS.md header); index.html
      // gets it injected at build time so a rename is a one-line change.
      // The iOS launch images (§14) are generated with the icons.
      return html
        .replace('</title>', `</title>\n    ${metaTag}`)
        .replace('</head>', `  ${splashLinkTags()}\n  </head>`)
        .replaceAll('{{APP_NAME}}', APP_NAME);
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
    base: process.env['VITE_BASE'] ?? '/wachatback/',
    plugins: [
      react(),
      tailwindcss(),
      injectBuildMeta(),
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
          theme_color: '#101413',
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
          // licenses.json is the generated license list for Settings → About.
          globPatterns: ['**/*.{js,css,html,wasm,svg,png,webmanifest}', 'licenses.json'],
          // ogg-opus-decoder's ML build loads only with speech enhancement,
          // which the app never enables (ADR 0013).
          globIgnores: ['**/opus-ml-*.js'],
          navigateFallback: 'index.html',
        },
        injectRegister: 'auto',
      }),
    ],
    worker: {
      // Module workers (§3.2) keep dynamic imports as separate chunks, so
      // the Opus decoder's optional ML build is never inlined into the
      // audio worker.
      format: 'es' as const,
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
  };
});
