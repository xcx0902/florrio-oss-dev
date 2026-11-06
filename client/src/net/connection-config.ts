import { CATALOG_HASH, PROTOCOL_VERSION } from './multiplayer-codec.js';
export interface ConnectionConfig {
  profile: 'network' | 'local';
  prediction?: boolean;
  url: string;
  roomId: string;
  protocolVersion: number;
  catalogHash: string;
}
export function connectionConfig(
  value: Partial<ConnectionConfig> = {},
  locationUrl = location.href,
): ConnectionConfig {
  const page = new URL(locationUrl);
  const url = new URL(value.url ?? '/ws', page);
  if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  }
  if (
    !['ws:', 'wss:'].includes(url.protocol) ||
    (page.protocol === 'https:' && url.protocol !== 'wss:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Invalid game server address');
  }
  const config = {
    profile: 'network' as const,
    roomId: 'garden',
    protocolVersion: PROTOCOL_VERSION,
    catalogHash: CATALOG_HASH,
    ...value,
    url: url.href,
  };
  config.prediction = value.prediction ?? page.searchParams.get('prediction') !== 'off';
  // An explicit offline profile is retained for diagnostics and compatibility regressions.
  if (page.searchParams.get('profile') === 'offline') {
    config.profile = 'local';
  }
  if (
    !['network', 'local'].includes(config.profile) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.roomId)
  ) {
    throw new Error('Invalid connection configuration');
  }
  if (config.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error('Game protocol version mismatch');
  }
  if (config.catalogHash !== CATALOG_HASH) {
    throw new Error('Game catalog version mismatch');
  }
  return config;
}
