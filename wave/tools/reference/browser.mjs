import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright-core';

const origin = 'https://florr.io';

async function bootPage(browser, { resources, fixture, output, archive }) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    locale: 'en-US',
    serviceWorkers: 'block',
  });
  const started = performance.now();
  const events = [];
  function record(event) {
    events.push({
      sequence: events.length + 1,
      relativeMs: Math.round(performance.now() - started),
      ...event,
    });
  }
  const discovery = fixture.discovery;
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const requestBody = request.postDataBuffer();
    record({
      event: 'http-request',
      kind: 'captured',
      direction: 'client-to-server',
      url,
      method,
      resourceType: request.resourceType(),
      length: requestBody?.length ?? 0,
      hex: requestBody?.toString('hex') ?? '',
    });
    const resource = resources.get(url);
    if (method === 'GET' && resource) {
      const { contentType, body } = resource;
      record({
        event: 'http-response',
        direction: 'server-to-client',
        url,
        status: 200,
        length: body.length,
        kind: 'local-resource',
      });
      await route.fulfill({ status: 200, contentType, body });
    } else if (method === discovery.method && url === discovery.url) {
      const body = Buffer.from(discovery.response.hex, 'hex');
      record({
        event: 'http-response',
        kind: 'synthetic',
        direction: 'server-to-client',
        url,
        status: discovery.response.status,
        length: body.length,
        hex: body.toString('hex'),
      });
      await route.fulfill({
        status: discovery.response.status,
        contentType: discovery.response.contentType,
        headers: { 'access-control-allow-origin': origin },
        body,
      });
    } else {
      record({ event: 'http-blocked', url });
      await route.abort();
    }
  });
  let finish;
  const sawReplyHandled = new Promise((resolve) => {
    finish = resolve;
  });
  await context.routeWebSocket(/.*/, (socket) => {
    const url = socket.url();
    record({ event: 'socket-open', kind: 'synthetic', url });
    socket.onMessage((message) => {
      const bytes = Buffer.from(message);
      const event = {
        event: 'socket-send',
        kind: 'captured',
        direction: 'client-to-server',
        url,
        length: bytes.length,
        hex: bytes.toString('hex'),
        binary: typeof message !== 'string',
      };
      const first = !events.some((entry) => entry.event === 'socket-send');
      record(event);
      if (first) {
        if (url === fixture.socket.url) {
          const reply = Buffer.from(fixture.socket.response.hex, 'hex');
          record({
            event: 'socket-receive',
            kind: 'synthetic',
            direction: 'server-to-client',
            url,
            length: reply.length,
            hex: reply.toString('hex'),
          });
          socket.send(reply);
        }
      }
    });
    socket.onClose((code, reason) => record({ event: 'socket-close', url, code, reason }));
  });
  const page = await context.newPage();
  page.on('console', (entry) => {
    const text = entry.text();
    if (['warning', 'error', 'log'].includes(entry.type())) {
      record({ event: 'console', level: entry.type(), text });
    }
    if (text === fixture.socket.response.expectedLog) {
      finish();
    }
  });
  page.on('pageerror', (error) => record({ event: 'page-error', text: error.message }));
  await page.goto(origin, { waitUntil: 'load', timeout: 12_000 });

  let timeout;
  try {
    await Promise.race([
      sawReplyHandled,
      new Promise((resolve) => {
        timeout = setTimeout(resolve, 6000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  // Allow the original receive callback and next animation frame to run.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const state = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      overlay: Boolean(document.getElementById('canvasOverlay')),
      loading: getComputedStyle(document.getElementById('loading')).display !== 'none',
      error: getComputedStyle(document.getElementById('errorDialog')).display !== 'none',
      wasm: Boolean(window.Module?.asm?.Jf instanceof WebAssembly.Memory),
      title: document.title,
      canvas: [window.Module?.canvas.width, window.Module?.canvas.height],
      ubuntuLoaded: [...document.fonts].some(
        (font) => font.family === 'Ubuntu' && font.status === 'loaded',
      ),
    };
  });
  await page.screenshot({ path: output, timeout: 10_000 });
  const result = {
    page: archive ? 'archived-html' : 'local-shell',
    browser: browser.version(),
    state,
    events: events.slice(),
  };
  await context.close();
  return result;
}

export async function bootReference({ passes, executablePath, fixture }) {
  const browser = await chromium.launch({
    executablePath,
    args: ['--host-resolver-rules=MAP * ~NOTFOUND', '--no-proxy-server'],
  });
  try {
    const results = [];
    for (const pass of passes) {
      results.push(await bootPage(browser, { ...pass, fixture }));
    }
    return results;
  } finally {
    await browser.close();
  }
}
