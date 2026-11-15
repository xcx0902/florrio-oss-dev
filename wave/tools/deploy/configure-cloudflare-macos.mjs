import { spawnSync } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const directory = path.join(homedir(), 'Library/Application Support/FlorrioWavePreview/secrets');
const prompt = spawnSync(
  '/usr/bin/osascript',
  [
    '-e',
    'text returned of (display dialog "请输入 Cloudflare API Token。仅用于 xcx0902.dpdns.org 的 Zone:Read 与 DNS:Edit；凭证只保存在本机，不写入仓库或聊天。" default answer "" with hidden answer buttons {"取消", "保存"} default button "保存" with title "Wave DNS 证书验证")',
  ],
  { encoding: 'utf8' },
);
if (prompt.status !== 0) {
  throw new Error('Cloudflare token entry was cancelled or unavailable');
}
const token = prompt.stdout.trim();
if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
  throw new Error('The value is not a Cloudflare API Token');
}
function cloudflare(endpoint) {
  // The header travels over stdin, so the token is absent from process arguments.
  const result = spawnSync('/usr/bin/curl', ['--config', '-'], {
    encoding: 'utf8',
    input: `silent\nshow-error\nfail\nmax-time = 30\nurl = "https://api.cloudflare.com/client/v4/${endpoint}"\nheader = "Authorization: Bearer ${token}"\n`,
  });
  if (result.status !== 0) {
    throw new Error('Cloudflare API validation failed; the credential was not saved');
  }
  let data;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new Error('Cloudflare returned an unexpected response');
  }
  if (!data.success) {
    throw new Error('Cloudflare rejected the token or its permissions');
  }
  return data.result;
}
if (cloudflare('user/tokens/verify').status !== 'active') {
  throw new Error('Cloudflare API Token is not active');
}
const zones = cloudflare('zones?name=xcx0902.dpdns.org&status=active');
if (zones.length !== 1 || zones[0].name !== 'xcx0902.dpdns.org') {
  throw new Error('The token cannot read the active xcx0902.dpdns.org zone');
}
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
const target = path.join(directory, 'cloudflare-token');
await writeFile(target, token + '\n', { mode: 0o600 });
await chmod(target, 0o600);
console.log('Cloudflare token verified and saved privately for Wave certificate renewal.');
