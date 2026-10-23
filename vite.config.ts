import preact from '@preact/preset-vite';
import { mkdir, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { defineConfig } from 'vitest/config';

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

/**
 * `npm run dev` runs the same edge code as Cloudflare (/api/v1/*), and in dev
 * only, POST /dev/capture saves anonymized pages as test fixtures.
 */
function edgeInDev(): Plugin {
  return {
    name: 'ties-edge-in-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? '';
        try {
          if (url.startsWith('/api/')) {
            const { handleApi } = await server.ssrLoadModule('/src/adapters/peoplesoft/edge/router.ts');
            const body = req.method === 'POST' ? await readBody(req) : undefined;
            const response: Response = await handleApi(new Request(`http://localhost${url}`, { method: req.method, body }));
            res.statusCode = response.status;
            response.headers.forEach((v, k) => res.setHeader(k, v));
            res.end(await response.text());
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

export default defineConfig({
  plugins: [preact(), edgeInDev()],
  build: { outDir: 'dist', target: 'es2022' },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
