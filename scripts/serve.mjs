#!/usr/bin/env node
// Локальный сервер для игры: `npm start` (или `node scripts/serve.mjs --open`).
// Нужен только для разработки: саму игру можно открыть файлом `promezhutok.html`.
// Типы файлов задаются явно, иначе часть серверов отдаёт .js как text/plain и
// браузер отказывается запускать модуль.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const readArg = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const port = Number(readArg('--port') ?? process.env.PORT ?? 8000);
const shouldOpen = args.includes('--open') || args.includes('-o');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Некорректный адрес');
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = resolve(root, `.${pathname}`);
  // Не отдаём ничего за пределами папки проекта.
  if (target !== root && !target.startsWith(root + sep)) return send(res, 403, 'Доступ запрещён');
  try {
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    const size = info.isDirectory() ? (await stat(file)).size : info.size;
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': size,
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(res);
  } catch {
    send(res, 404, 'Файл не найден');
  }
});

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  const child = spawn(command, [url], { stdio: 'ignore', detached: true });
  child.on('error', () => { /* браузер откроем сами */ });
  child.unref();
}

server.listen(port, '0.0.0.0', () => {
  const url = `http://localhost:${port}/`;
  console.log('Промежуток: сервер запущен.');
  console.log(`  Игра:      ${url}`);
  console.log(`  Прототип:  ${url}?mode=prototype`);
  console.log(`  Один файл: ${url}promezhutok.html`);
  console.log('Остановка: Ctrl+C');
  if (shouldOpen) openBrowser(url);
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Порт ${port} занят. Запустите с другим портом: node scripts/serve.mjs --port 8010`);
    process.exit(1);
  }
  throw error;
});
