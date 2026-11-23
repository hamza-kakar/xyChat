/**
 * A static server for the production build whose service worker script
 * can be swapped mid-test, so a spec can publish "the next release" and
 * watch the update prompt (AGENTS.md §12.12, e2e flow 15). It serves
 * `dist/` under the same base path as `vite preview`, on its own port and
 * therefore its own origin and storage.
 */
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';

const DIST = resolve(import.meta.dirname, '../../../dist');
const BASE_PATH = process.env['E2E_BASE_PATH'] ?? '/xychat/';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export interface ReleaseServer {
  /** The app's URL on this server. */
  readonly url: string;
  /** Serves a byte-different sw.js from now on: the next release. */
  readonly publishNextRelease: () => void;
  readonly close: () => Promise<void>;
}

/** Starts the server on a free port. */
export async function startReleaseServer(): Promise<ReleaseServer> {
  let release = 0;
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (!path.startsWith(BASE_PATH)) {
      response.writeHead(404).end();
      return;
    }
    const relative = path.slice(BASE_PATH.length) || 'index.html';
    const file = normalize(resolve(DIST, relative));
    if (!file.startsWith(DIST + sep)) {
      response.writeHead(404).end();
      return;
    }
    readFile(file).then(
      (body) => {
        const isWorkerScript = relative === 'sw.js';
        const content =
          isWorkerScript && release > 0
            ? Buffer.concat([body, Buffer.from(`\n// release ${String(release)}\n`)])
            : body;
        response.writeHead(200, {
          'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
          'cache-control': 'no-cache',
        });
        response.end(content);
      },
      () => {
        response.writeHead(404).end();
      },
    );
  });
  await new Promise<void>((done) => {
    server.listen(0, '127.0.0.1', done);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}${BASE_PATH}`,
    publishNextRelease: () => {
      release += 1;
    },
    close: () =>
      new Promise<void>((done) => {
        server.close(() => {
          done();
        });
      }),
  };
}
