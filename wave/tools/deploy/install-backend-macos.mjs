import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const preview = path.join(repo, 'build/wave/preview');
const runtime = path.join(homedir(), 'Library/Application Support/FlorrioWavePreview');
const label = 'org.xcx0902.florriowave.preview';
const domain = `gui/${userInfo().uid}`;
const agent = path.join(homedir(), `Library/LaunchAgents/${label}.plist`);
const xml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const run = (command, args) => spawnSync(command, args, { encoding: 'utf8' });
await mkdir(path.dirname(agent), { recursive: true });
await mkdir(path.join(preview, 'logs'), { recursive: true });
// launchd services keep their runtime outside macOS-protected Documents folders.
run('/bin/launchctl', ['bootout', `${domain}/${label}`]);
const listener = run('/usr/sbin/lsof', ['-t', '-iTCP:8480', '-sTCP:LISTEN']).stdout.trim();
if (listener) {
  for (const pid of listener.split('\n')) {
    const command = run('/bin/ps', ['-p', pid, '-o', 'command=']).stdout;
    if (
      !command.includes('wave_host') ||
      (!command.includes(preview) && !command.includes(runtime))
    ) {
      throw new Error('Port 8480 belongs to another service');
    }
    process.kill(Number(pid), 'SIGTERM');
  }
}
const stopDeadline = Date.now() + 60000;
while (run('/usr/sbin/lsof', ['-t', '-iTCP:8480', '-sTCP:LISTEN']).stdout.trim()) {
  if (Date.now() >= stopDeadline) {
    throw new Error('Previous backend is still draining; runtime was not overwritten');
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
await mkdir(path.join(runtime, 'bin'), { recursive: true });
await mkdir(path.join(runtime, 'logs'), { recursive: true });
await mkdir(path.join(runtime, 'saves'), { recursive: true });
await cp(path.join(repo, 'build/wave/native/wave_host'), path.join(runtime, 'bin/wave_host'));
await cp(path.join(preview, 'web'), path.join(runtime, 'web'), { recursive: true });
try {
  await readFile(path.join(runtime, 'saves/profiles.sqlite3'));
} catch {
  try {
    await cp(
      path.join(preview, 'saves/profiles.sqlite3'),
      path.join(runtime, 'saves/profiles.sqlite3'),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}
await writeFile(
  agent,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(path.join(runtime, 'bin/wave_host'))}</string>
<string>${xml(path.join(runtime, 'web'))}</string><string>8480</string>
<string>${xml(path.join(runtime, 'saves/profiles.sqlite3'))}</string></array>
<key>WorkingDirectory</key><string>${xml(runtime)}</string>
<key>EnvironmentVariables</key><dict>
<key>WAVE_ALLOWED_ORIGINS</key><string>http://localhost:8080,https://localhost:8443,https://preview.florriowave.xcx0902.dpdns.org,https://preview.florriowave.xcx0902.dpdns.org:18443</string>
<key>WAVE_MAX_PLAYERS</key><string>32</string>
<key>WAVE_MAX_GUESTS</key><string>256</string>
<key>WAVE_MAX_ROOMS</key><string>32</string>
</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>5</integer>
<key>ExitTimeOut</key><integer>60</integer>
<key>StandardOutPath</key><string>${xml(path.join(runtime, 'logs/wave.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(runtime, 'logs/wave.log'))}</string>
</dict></plist>
`,
);
const result = run('/bin/launchctl', ['bootstrap', domain, agent]);
if (result.status !== 0) {
  throw new Error(result.stderr || 'Could not start preview LaunchAgent');
}
const until = Date.now() + 10000;
let healthy = false;
while (!healthy && Date.now() < until) {
  try {
    healthy = (await fetch('http://localhost:8480/healthz')).ok;
  } catch {}
  if (!healthy) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
if (!healthy) {
  throw new Error(
    'Preview backend did not become healthy; inspect ' + path.join(runtime, 'logs/wave.log'),
  );
}
console.log(`Installed and started ${label} at ${runtime}`);
