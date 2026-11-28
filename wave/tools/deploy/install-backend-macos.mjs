import { access, mkdir, readFile, writeFile, cp, rename, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
export const runtime = path.join(homedir(), 'Library/Application Support/FlorrioWavePreview');
const label = 'org.xcx0902.florriowave.preview';
const domain = `gui/${userInfo().uid}`;
const agent = path.join(homedir(), `Library/LaunchAgents/${label}.plist`);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const xml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  return result;
};
const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return false;
  }
};

function defaultAgent() {
  return `<?xml version="1.0" encoding="UTF-8"?>
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
`;
}

function listeners() {
  const result = run('/usr/sbin/lsof', ['-t', '-iTCP:8480', '-sTCP:LISTEN']);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || 'Cannot inspect port 8480');
  }
  return result.stdout.trim().split('\n').filter(Boolean).map(Number);
}

async function stopBackend() {
  const pids = new Set(listeners());
  // A draining host can close its listener before its SQLite queue is flushed.
  for (const pid of pids) {
    const command = run('/bin/ps', ['-p', String(pid), '-o', 'command=']).stdout;
    if (
      !command.includes('wave_host') ||
      (!command.includes(runtime) && !command.includes(path.join(repo, 'build/wave/preview')))
    ) {
      throw new Error('Port 8480 belongs to another service');
    }
  }
  const state = run('/bin/launchctl', ['print', `${domain}/${label}`]);
  const servicePid = state.stdout.match(/\bpid = (\d+)/)?.[1];
  if (servicePid) {
    pids.add(Number(servicePid));
  }
  if (state.status === 0) {
    const stopped = run('/bin/launchctl', ['bootout', `${domain}/${label}`]);
    if (stopped.status !== 0) {
      throw new Error(stopped.stderr || 'Cannot stop preview LaunchAgent');
    }
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }
  }
  const until = Date.now() + 60000;
  while (true) {
    const alive = [...pids].some((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        if (error.code !== 'ESRCH') {
          throw error;
        }
        return false;
      }
    });
    if (!alive) {
      break;
    }
    if (Date.now() >= until) {
      throw new Error('Previous backend is still draining; runtime was not overwritten');
    }
    await delay(200);
  }
  if (listeners().length) {
    throw new Error('Port 8480 is still occupied; runtime was not overwritten');
  }
}

async function startBackend() {
  const result = run('/bin/launchctl', ['bootstrap', domain, agent]);
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Could not start preview LaunchAgent');
  }
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    try {
      const response = await fetch('http://localhost:8480/healthz', {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok && (await response.json()).status === 'ok') {
        return;
      }
    } catch {}
    await delay(200);
  }
  throw new Error('Backend did not become healthy; inspect ' + path.join(runtime, 'logs/wave.log'));
}

// Injectable service operations let recovery tests run without touching launchd.
export async function installRelease({
  binary,
  web,
  metadata,
  destination = runtime,
  plist = agent,
  service = { stop: stopBackend, start: startBackend },
}) {
  await mkdir(destination, { recursive: true });
  const lock = path.join(destination, '.deploy.lock');
  await mkdir(lock); // Atomic; never remove another deployment's lock.
  const backup = path.join(
    destination,
    'backups',
    new Date().toISOString().replaceAll(':', '-') + '-' + process.pid,
  );
  const stage = path.join(backup, 'next');
  const moved = [];
  let stopped = false;
  let switching = false;
  let oldPlist;
  try {
    oldPlist = (await exists(plist)) ? await readFile(plist) : undefined;
    await mkdir(backup, { recursive: true, mode: 0o700 });
    await mkdir(stage);
    await cp(binary, path.join(stage, 'wave_host'));
    await cp(web, path.join(stage, 'web'), { recursive: true });
    await writeFile(path.join(stage, 'release.json'), metadata ?? '{}\n');
    for (const directory of ['bin', 'logs', 'saves']) {
      await mkdir(path.join(destination, directory), { recursive: true });
    }
    await mkdir(path.dirname(plist), { recursive: true });
    if (oldPlist) {
      await writeFile(path.join(backup, 'agent.plist'), oldPlist);
    }
    await service.stop();
    stopped = true;
    const database = path.join(destination, 'saves/profiles.sqlite3');
    if (await exists(database)) {
      // sqlite3 dot commands use double-quoted C escapes, not SQL quoting.
      const target = JSON.stringify(path.join(backup, 'profiles.sqlite3'));
      const result = run('/usr/bin/sqlite3', [database, `.backup ${target}`]);
      if (result.status !== 0) {
        throw new Error(result.stderr || 'SQLite backup failed');
      }
    }
    switching = true;
    for (const [name, relative] of [
      ['wave_host', 'bin/wave_host'],
      ['web', 'web'],
      ['release.json', 'release.json'],
    ]) {
      const target = path.join(destination, relative);
      const previous = (await exists(target)) ? path.join(backup, name) : undefined;
      if (previous) {
        await rename(target, previous);
      }
      moved.push({ target, previous });
      await rename(path.join(stage, name), target);
    }
    await writeFile(plist, oldPlist ?? defaultAgent());
    await service.start();
    console.log(`Installed and started ${label}; previous release and save backup: ${backup}`);
    return backup;
  } catch (error) {
    if (stopped) {
      try {
        if (switching) {
          await service.stop();
          for (const { target, previous } of moved.reverse()) {
            await rm(target, { recursive: true, force: true });
            if (previous) {
              await rename(previous, target);
            }
          }
          if (oldPlist) {
            await writeFile(plist, oldPlist);
          } else {
            await rm(plist, { force: true });
          }
        }
        if (oldPlist) {
          await service.start();
        }
      } catch (recovery) {
        throw new AggregateError(
          [error, recovery],
          `Deploy and recovery failed; inspect ${backup} and ${destination}/logs/wave.log`,
          { cause: recovery },
        );
      }
    }
    throw error;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      'native-dir': { type: 'string', default: path.join(repo, 'build/wave/native') },
      'web-root': { type: 'string', default: path.join(repo, 'build/wave/preview/web') },
      metadata: { type: 'string' },
    },
  });
  if (process.platform !== 'darwin') {
    throw new Error('This installer requires macOS launchd');
  }
  await installRelease({
    binary: path.resolve(values['native-dir'], 'wave_host'),
    web: path.resolve(values['web-root']),
    metadata: values.metadata ? await readFile(path.resolve(values.metadata)) : undefined,
  });
}
