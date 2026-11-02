import { GameApp } from './app/game-app.js';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
if (!canvas) throw new Error('missing #canvas');
export let app: GameApp | undefined;
void (async () => {
  const response = await fetch('./connection.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Connection configuration unavailable');
  const config = await response.json();
  // This composition intentionally has no Worker/WASM fallback. A stale
  // ?profile=offline link fails loudly instead of silently joining online.
  if (config?.profile === 'local') throw new Error('Offline profile is unavailable in this build');
  app = new GameApp(canvas, { config });
  await app.start();
})().catch(error => {
  app?.dispose();
  const status = document.getElementById('status') ?? document.body.appendChild(document.createElement('div'));
  status.textContent = error instanceof Error ? error.message : String(error);
});
window.addEventListener('pagehide', () => app?.dispose(), { once: true });
