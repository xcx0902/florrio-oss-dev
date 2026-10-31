/** Product HTTP handler with a realpath boundary and deterministic cleanup. */
import http from 'node:http';
import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
export function staticHandler(root, { diagnostics = false, routes = {} } = {}) {
  root = path.resolve(root);
  return async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
      if (routes[pathname]) return routes[pathname](request, response);
      let filename;
      if (diagnostics && pathname === '/dev/test-api.js') filename = await realpath(path.resolve('build/client/dev/test-api.js'));
      else {
        const candidate = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!candidate.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
        filename = await realpath(candidate);
        const boundary = await realpath(root);
        if (!filename.startsWith(boundary + path.sep)) { response.writeHead(403).end(); return; }
      }
      const bytes = await readFile(filename);
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }).end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) { response.writeHead(error instanceof URIError ? 400 : 404).end('Not found'); }
  };
}
export async function startTestServer(root, options = {}) {
  const server = http.createServer(staticHandler(root, options));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, origin: `http://127.0.0.1:${server.address().port}`, async close() { if (!server.listening) return; await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); } };
}
