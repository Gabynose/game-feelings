import { defineConfig, loadEnv, type Plugin } from 'vite';

declare const process: { env: Record<string, string | undefined> };

const MAX_DEV_BODY = 16 * 1024;

// Minimal shape of Node's IncomingMessage (the project does not depend on @types/node).
type NodeReq = AsyncIterable<Uint8Array> & {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
};

// --- /api dev plugin (backend-engineer) ---------------------------------------------
// Mounts the SAME handlers Vercel runs in production (api/*.ts export `GET`/`POST`
// taking a Web `Request` and returning a `Response`; see
// https://vercel.com/docs/functions/functions-api-reference#function-signature).
// Dev only: nothing here is bundled into the client.
function apiDev(secrets: Record<string, string>): Plugin {
  return {
    name: 'api-dev',
    apply: 'serve',
    configureServer(server) {
      for (const [k, v] of Object.entries(secrets)) process.env[k] ??= v;

      server.middlewares.use(async (incoming, res, next) => {
        const req = incoming as unknown as NodeReq;
        const url = new URL(req.url ?? '/', 'http://localhost');
        const name = /^\/api\/([a-z]+)$/.exec(url.pathname)?.[1];
        if (!name) return next();

        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };

        let mod: Record<string, unknown>;
        try {
          mod = await server.ssrLoadModule(`/api/${name}.ts`);
        } catch (e) {
          // a missing file is a 404; anything else (syntax error, bad import) is OUR bug: say so
          const err = e as { code?: string; message?: string };
          if (err.code === 'ERR_LOAD_URL' || /Failed to load url|Does the file exist/.test(err.message ?? '')) return send(404, { error: 'not_found' });
          console.error('[api-dev] failed to load', name, err.message);
          return send(500, { error: 'server_error' });
        }
        const method = req.method ?? 'GET';
        const exported = mod[method] ?? (mod.default as { fetch?: unknown } | undefined)?.fetch;
        if (typeof exported !== 'function') return send(405, { error: 'method_not_allowed' });
        const handler = exported as (r: Request) => Promise<Response>;

        const chunks: Uint8Array[] = [];
        let size = 0;
        if (method !== 'GET' && method !== 'HEAD') {
          for await (const c of req) {
            size += c.byteLength;
            if (size > MAX_DEV_BODY) return send(413, { error: 'payload_too_large' }); // dev guard, same idea as the real limits
            chunks.push(c);
          }
        }
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(',') : v);
        headers.set('x-real-ip', req.socket.remoteAddress ?? 'local');

        try {
          const response = await handler(
            new Request(url, { method, headers, body: chunks.length ? new Blob(chunks as BlobPart[]) : undefined }),
          );
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(new Uint8Array(await response.arrayBuffer()));
        } catch (e) {
          console.error('[api-dev] handler threw', name, e instanceof Error ? e.message : 'unknown');
          send(500, { error: 'server_error' });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ''); // reads .env.local; non-VITE_ keys never reach the client
  return {
    plugins: [
      apiDev({
        GEMINI_API_KEY: env.GEMINI_API_KEY ?? '',
        RAWG_API_KEY: env.RAWG_API_KEY ?? '',
      }),
    ],
  };
});
