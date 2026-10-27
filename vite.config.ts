import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

/** The owner's page's key in dev (`npm run dev`), unless ADMIN_KEY is set. */
const DEV_ADMIN_KEY = process.env.ADMIN_KEY ?? 'dev-owner-key-0123456789-abcdefghijkl';

/**
 * `npm run dev` runs Raad's server in-process (/api/v1/*, streamed like on
 * Cloudflare), with a KV in memory and the statistics in an SQLite in memory,
 * filled with a made-up month for the owner's page (/admin/). In dev only,
 * POST /dev/capture saves anonymized pages as test fixtures.
 */
function raadInDev(): Plugin {
  return {
    name: 'raad-in-dev',
    configureServer(server: ViteDevServer) {
      let env: Promise<Record<string, unknown>> | undefined;
      const devEnv = () => (env ??= (async () => {
        const { sqliteDb } = await server.ssrLoadModule('/src/dev/sqlite-db.ts');
        const { seedSampleStats } = await server.ssrLoadModule('/src/dev/sample-stats.ts');
        const kv = new Map<string, string>();
        const db = sqliteDb();
        await seedSampleStats(db);
        console.info(`  owner's page: /admin/ (dev key: ${DEV_ADMIN_KEY}; statistics are made up)`);
        return {
          RAAD_DEV: '1',
          ADMIN_KEY: DEV_ADMIN_KEY,
          STATS: db,
          GUARD: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => { kv.set(k, v); }, delete: async (k: string) => { kv.delete(k); } },
        };
      })());
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? '';
        try {
          // Like Cloudflare Pages: the folder's page lives at its address with a slash.
          if (url === '/admin' || url.startsWith('/admin?')) {
            res.statusCode = 308;
            res.setHeader('Location', url.replace('/admin', '/admin/'));
            res.end();
            return;
          }
          if (url.startsWith('/api/')) {
            const { handleApi } = await server.ssrLoadModule('/raad/server/router.ts');
            const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : undefined;
            const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
            const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => {}) };
            const response: Response = await handleApi(new Request(`http://localhost${url}`, { method: req.method, body, headers }), await devEnv(), ctx);
            res.statusCode = response.status;
            response.headers.forEach((v, k) => res.setHeader(k, v));
            if (response.body) {
              const reader = response.body.getReader();
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
            }
            res.end();
            return;
          }
          if (url === '/dev/capture' && req.method === 'POST') {
            const { anonymize, leaks, secretsFor } = await server.ssrLoadModule('/src/dev/anonymize.ts');
            const { pages, person } = JSON.parse(await readBody(req));
            const secrets = secretsFor(person);
            const dir = path.resolve('test/fixtures/peoplesoft');
            await mkdir(dir, { recursive: true });
            const written: string[] = [];
            const refused: Record<string, string[]> = {};
            for (const [key, html] of Object.entries(pages as Record<string, string>)) {
              if (!/^[a-z]+$/.test(key)) continue;
              const clean = anonymize(html, secrets);
              const left = leaks(clean, secrets);
              if (left.length) { refused[key] = left.map((v: string) => `${v.length} chars`); continue; }
              await writeFile(path.join(dir, `${key}.html`), clean, 'utf8');
              written.push(key);
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ written, refused }));
            return;
          }
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ code: 'DEV_ERROR', message: (e as Error).message }));
          return;
        }
        next();
      });
    },
  };
}

/**
 * Gives the service worker a new cache name on every build, so an update
 * replaces the old files instead of piling up beside them (public/sw.js).
 */
function swVersion(): Plugin {
  return {
    name: 'sw-version',
    apply: 'build',
    async closeBundle() {
      const file = path.resolve('dist/sw.js');
      const src = await readFile(file, 'utf8');
      await writeFile(file, src.replace('__BUILD__', `${pkg.version}-${Date.now().toString(36)}`), 'utf8');
    },
  };
}

export default defineConfig({
  plugins: [preact(), raadInDev(), swVersion()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: 'dist',
    target: 'es2022',
    // The students' app, and the owner's page beside it (/admin/), each with only its own code.
    rolldownOptions: { input: { main: path.resolve('index.html'), admin: path.resolve('admin/index.html') } },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
