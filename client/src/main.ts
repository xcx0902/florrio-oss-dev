import { GameApp } from './app/game-app.js';
import { LocalWorkerTransport } from './net/local-worker.js';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
if (!canvas) throw new Error('missing #canvas');
export let app: GameApp | undefined;
void (async () => {
  const response = await fetch('./connection.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Connection configuration unavailable');
  app = new GameApp(canvas, {
    config: await response.json(),
    // Explicit offline composition. The network profile still goes through the
    // default NetworkTransport and never constructs a Worker.
    transportFactory: config => config.profile === 'local' ? new LocalWorkerTransport() : undefined,
  });
  await app.start();
})().catch(error => {
  app?.dispose();
  const status = document.getElementById('status') ?? document.body.appendChild(document.createElement('div'));
  status.textContent = error instanceof Error ? error.message : String(error);
});
window.addEventListener('pagehide', () => app?.dispose(), { once: true });
