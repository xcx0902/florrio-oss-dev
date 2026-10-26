/**
 * Pinned navigator.userAgent for parity runs (R30).
 *
 * The archived client sends `navigator.userAgent` verbatim inside its first
 * `sp_server_send` handshake packet. Chrome upgrades therefore change the
 * recorded golden server trace even when nothing in the game changed: Chrome
 * 155 -> 156 flipped exactly one byte (`HeadlessChrome/155` -> `/156`).
 *
 * Pinning the UA in the parity init script makes the golden independent of the
 * locally installed Chrome build. The pinned value is the UA that recorded the
 * current goldens (Chrome 155 headless on macOS); it is intentionally frozen
 * and must only change together with a full `--update` of the goldens.
 *
 * Keep this string byte-identical to `PINNED_USER_AGENT` in docs/parity.md.
 */
export function installPinnedUserAgent(options = {}) {
  const userAgent = options.userAgent
    || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36';
  const appVersion = userAgent.replace(/^Mozilla\//, '');

  const define = (target, property, value) => {
    try {
      Object.defineProperty(target, property, { configurable: true, get: () => value });
    } catch {
      // Older engines expose a non-configurable accessor; leave it untouched.
    }
  };

  define(Navigator.prototype, 'userAgent', userAgent);
  define(Navigator.prototype, 'appVersion', appVersion);
  define(Navigator.prototype, 'vendor', 'Google Inc.');
  define(Navigator.prototype, 'platform', 'MacIntel');
  // `navigator.userAgentData` exists on Chrome 90+. Freeze the brand list so a
  // future Chrome cannot leak its own major version through Client Hints.
  define(Navigator.prototype, 'userAgentData', {
    brands: [
      { brand: 'Chromium', version: '155' },
      { brand: 'Google Chrome', version: '155' },
      { brand: 'Not?A_Brand', version: '24' },
    ],
    mobile: false,
    platform: 'macOS',
  });
  window.__parityUserAgent = userAgent;
}
