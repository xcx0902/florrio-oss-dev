#!/usr/bin/env node
/**
 * 本地静态服务器：以正确的 MIME 类型提供 dist-next 交付树。
 *
 * 用法：
 *   node serve.mjs                  # 默认运行 dist-next
 *   node serve.mjs --port 9000      # 指定端口
 *   node serve.mjs --no-open        # 不自动打开浏览器
 *   node serve.mjs --host 0.0.0.0   # 开放到局域网（请注意安全）
 *   node serve.mjs --root dist-next # 指定其他构建输出目录
 *
 * archive/ 是只读历史资料，不允许作为静态站点根目录。
 */

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The rebuilt C++/TypeScript delivery tree is the only supported entry.
let ROOT = path.join(__dirname, 'dist-next');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function parseArgs(argv) {
  const opts = { port: 8477, host: '127.0.0.1', open: true, root: 'dist-next' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' || a === '-p') opts.port = Number(argv[++i]);
    else if (a === '--host') opts.host = argv[++i];
    else if (a === '--no-open') opts.open = false;
    else if (a === '--root') opts.root = argv[++i];
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (/^\d+$/.test(a)) opts.port = Number(a);
  }
  return opts;
}

/** 静态文件请求处理 */
async function handle(req, res) {
  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }

  if (pathname.endsWith('/')) pathname += 'index.html';

  // 防目录穿越：解析后必须仍在 ROOT 内
  const full = path.resolve(ROOT, '.' + pathname);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(full);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found: ' + pathname);
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(302, { Location: pathname + '/' }).end();
    return;
  }

  const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Content-Length': stat.size,
    // 本地开发：永远拿最新文件，避免改了 html/js 却还在跑旧缓存
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    // 让 sp_server.wasm 可以被 worker 正常取到；同源即可，无需 COOP/COEP
  };

  if (method === 'HEAD') {
    res.writeHead(200, headers).end();
    return;
  }

  res.writeHead(200, headers);
  const stream = fs.createReadStream(full);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function probePort(host, port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  } catch { /* 打不开就算了，手动访问即可 */ }
}

const opts = parseArgs(process.argv.slice(2));
ROOT = path.resolve(__dirname, opts.root);
const archiveRoot = path.join(__dirname, 'archive');
if (ROOT === archiveRoot || ROOT.startsWith(archiveRoot + path.sep)) {
  console.error('archive/ 是只读历史资料，不能作为站点根目录。');
  process.exit(1);
}
if (opts.help) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  process.exit(0);
}

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`找不到 ${path.join(ROOT, 'index.html')}，请先构建或指定 --root。`);
  process.exit(1);
}

// 端口被占用就顺延，避免和别的东西打架
let port = opts.port;
for (let i = 0; i < 20; i++) {
  if (await probePort(opts.host, port)) break;
  console.log(`端口 ${port} 被占用，尝试 ${port + 1} ...`);
  port++;
}

const server = http.createServer(handle);
server.listen(port, opts.host, () => {
  const target = opts.host === '0.0.0.0' || opts.host === '::' ? `http://localhost:${port}/` : `http://${opts.host}:${port}/`;
  console.log('');
  console.log('  Legacy Florr.io 本地单机版已启动');
  console.log('  ------------------------------------');
  console.log(`  地址:  ${target}`);
  console.log(`  目录:  ${ROOT}`);
  console.log('');
  console.log('  提示: 必须用 http:// 访问，直接双击 index.html（file://）无法加载 Worker 与 wasm。');
  console.log('  Ctrl+C 停止服务。');
  console.log('');
  if (opts.open) openBrowser(target);
});

server.on('error', (err) => {
  console.error('启动失败:', err.message);
  process.exit(1);
});
