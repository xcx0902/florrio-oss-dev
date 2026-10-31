import { GameApp } from './app/game-app.js';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
if (!canvas) throw new Error('missing #canvas');
const app = new GameApp(canvas);
void app.start().catch(error => {
  app.dispose();
  const status = document.getElementById('status') ?? document.body.appendChild(document.createElement('div'));
  status.textContent = error instanceof Error ? error.message : String(error);
});
window.addEventListener('pagehide', () => app.dispose(), { once: true });
