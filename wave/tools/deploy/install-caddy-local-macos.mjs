import { mkdir, writeFile, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const runtime = path.join(homedir(), 'Library/Application Support/FlorrioWavePreview');
const label = 'org.xcx0902.florriowave.caddy-local';
const domain = `gui/${userInfo().uid}`;
const agent = path.join(homedir(), `Library/LaunchAgents/${label}.plist`);
const xml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
spawnSync('/bin/launchctl', ['bootout', `${domain}/${label}`]);
await mkdir(path.join(runtime, 'bin'), { recursive: true });
await mkdir(path.join(runtime, 'logs'), { recursive: true });
await mkdir(path.dirname(agent), { recursive: true });
await cp(path.join(repo, 'build/wave/preview/bin/caddy'), path.join(runtime, 'bin/caddy'));
await cp(path.join(repo, 'wave/deploy/Caddyfile.local'), path.join(runtime, 'Caddyfile.local'));
await writeFile(
  agent,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(path.join(runtime, 'bin/caddy'))}</string>
<string>run</string><string>--config</string><string>${xml(path.join(runtime, 'Caddyfile.local'))}</string><string>--adapter</string><string>caddyfile</string></array>
<key>WorkingDirectory</key><string>${xml(runtime)}</string>
<key>EnvironmentVariables</key><dict>
<key>XDG_DATA_HOME</key><string>${xml(path.join(runtime, 'caddy/data'))}</string>
<key>XDG_CONFIG_HOME</key><string>${xml(path.join(runtime, 'caddy/config'))}</string>
</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>${xml(path.join(runtime, 'logs/caddy-local.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(runtime, 'logs/caddy-local.log'))}</string>
</dict></plist>`,
);
const result = spawnSync('/bin/launchctl', ['bootstrap', domain, agent], { encoding: 'utf8' });
if (result.status !== 0) {
  throw new Error(result.stderr);
}
console.log(`Installed and started ${label}`);
