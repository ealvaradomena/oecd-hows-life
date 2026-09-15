#!/usr/bin/env node
/**
 * Static website preview server for the already-rendered docs/ tree.
 * Quarto launches this single Node process directly so Windows can terminate
 * the external server without a nested `quarto run`/Deno process tree.
 */

import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'], ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'], ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2'],
]);

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required option: ${name}`);
}

export function parseOptions(args) {
  const root = option(args, '--root', 'docs');
  const host = option(args, '--host', '127.0.0.1');
  const portText = option(args, '--port', '4200');
  const port = Number.parseInt(portText, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== portText) {
    throw new Error(`Invalid --port value: ${portText}`);
  }
  return { root, host, port };
}

function insideRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function resolveRequestPath(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0')) return null;

  const segments = decoded.replaceAll('\\', '/').split('/').filter(Boolean);
  if (segments.some((part) => part === '..' || part === '.')) return null;
  let relative = segments.join('/');
  if (!relative || decoded.endsWith('/')) relative = `${relative ? `${relative}/` : ''}index.html`;
  let candidate = path.join(root, ...relative.split('/'));

  try {
    if ((await stat(candidate)).isDirectory()) candidate = path.join(candidate, 'index.html');
  } catch {
    if (path.extname(candidate)) return null;
    candidate = `${candidate}.html`;
    try { if (!(await stat(candidate)).isFile()) return null; } catch { return null; }
  }

  try {
    const resolved = await realpath(candidate);
    return insideRoot(resolved, root) ? resolved : null;
  } catch { return null; }
}

function plainText(response, status, body) {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(body);
}

export async function createStaticServer({ root, host, port, log = console.log }) {
  const resolvedRoot = await realpath(root);
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      plainText(response, 405, 'Method not allowed');
      return;
    }

    let pathname;
    try { pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname; }
    catch { plainText(response, 400, 'Bad request'); return; }
    const file = await resolveRequestPath(resolvedRoot, pathname);
    if (!file) { plainText(response, 404, 'Not found'); return; }

    let info;
    try { info = await stat(file); } catch { plainText(response, 404, 'Not found'); return; }
    response.writeHead(200, {
      'content-type': mimeTypes.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream',
      'content-length': String(info.size),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  log?.(`STATIC_PREVIEW_READY http://${displayHost}:${actualPort}/`);
  return server;
}

export async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export function registerShutdownHandlers(server, runtime = process) {
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    try { await closeServer(server); runtime.exitCode = 0; }
    catch (error) { console.error(error); runtime.exitCode = 1; }
  };
  runtime.once('SIGINT', shutdown);
  runtime.once('SIGTERM', shutdown);
}

async function main() {
  const server = await createStaticServer(parseOptions(process.argv.slice(2)));
  registerShutdownHandlers(server);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
