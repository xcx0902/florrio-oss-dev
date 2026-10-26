/** Resolve Chromium consistently on developer machines and Linux CI.
 * Undefined delegates to Playwright's installed, revision-pinned Chromium.
 */
import { existsSync } from 'node:fs';

export function chromiumExecutable(explicit = process.env.CHROME_PATH, {
  platform = process.platform, exists = existsSync,
} = {}) {
  if (explicit) {
    if (!exists(explicit)) throw new Error(`CHROME_PATH does not exist: ${explicit}`);
    return explicit;
  }
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return platform === 'darwin' && exists(macChrome) ? macChrome : undefined;
}
