import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { closeServer, createStaticServer, parseOptions, registerShutdownHandlers, resolveRequestPath } from './static-preview.mjs';

test('parses host, port, and root options', () => {
  assert.equal(parseOptions([]).root, '_site');
  assert.deepEqual(parseOptions(['--root', '.', '--host', '0.0.0.0', '--port', '4321']), {
    root: '.', host: '0.0.0.0', port: 4321,
  });
  assert.throws(() => parseOptions(['--port', '4321junk']), /Invalid --port value/);
});

test('serves MIME types, HEAD requests, extensionless paths, and no-store responses', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hl-preview-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'guide'));
  await writeFile(path.join(root, 'index.html'), '<h1>Home</h1>');
  await writeFile(path.join(root, 'guide', 'index.html'), '<h1>Guide</h1>');
  await writeFile(path.join(root, 'data.json'), '{}');
  const server = await createStaticServer({ root, host: '127.0.0.1', port: 0, log: null });
  context.after(() => closeServer(server));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('cache-control'), 'no-store');
  assert.match(home.headers.get('content-type'), /^text\/html/);
  assert.equal(await home.text(), '<h1>Home</h1>');
  assert.equal(await (await fetch(`${base}/guide`)).text(), '<h1>Guide</h1>');

  const head = await fetch(`${base}/data.json`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(await head.text(), '');
  assert.equal((await fetch(`${base}/missing.css`)).status, 404);
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
});

test('rejects traversal and malformed request paths', async (context) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'hl-preview-boundary-'));
  context.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'docs');
  await mkdir(root);
  await writeFile(path.join(parent, 'secret.html'), 'secret');
  const resolvedRoot = await realpath(root);
  assert.equal(await resolveRequestPath(resolvedRoot, '/../secret.html'), null);
  assert.equal(await resolveRequestPath(resolvedRoot, '/%2e%2e/secret.html'), null);
  assert.equal(await resolveRequestPath(resolvedRoot, '/bad%00name'), null);
  const outside = path.join(parent, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'index.html'), 'secret');
  try {
    await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(await resolveRequestPath(resolvedRoot, '/escape/'), null);
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
  }
});

test('SIGINT and SIGTERM handlers close the server cleanly', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hl-preview-signal-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'index.html'), 'ok');
  const server = await createStaticServer({ root, host: '127.0.0.1', port: 0, log: null });
  const runtime = new EventEmitter();
  runtime.exitCode = undefined;
  registerShutdownHandlers(server, runtime);
  assert.equal(runtime.listenerCount('SIGINT'), 1);
  assert.equal(runtime.listenerCount('SIGTERM'), 1);
  const closed = once(server, 'close');
  runtime.emit('SIGTERM');
  await closed;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(server.listening, false);
  assert.equal(runtime.exitCode, 0);
});
