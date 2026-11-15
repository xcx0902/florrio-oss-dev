#!/bin/bash
# Run once as an administrator after local deployment checks have passed.
set -eu
if [ "$(id -u)" != 0 ]; then
  echo 'Run with sudo: /bin/bash wave/tools/deploy/install-caddy-macos.sh /absolute/repository/path' >&2
  exit 1
fi
repo=${1:?Pass the absolute repository path}
binary="$repo/build/wave/preview/bin/caddy"
config="$repo/wave/deploy/Caddyfile"
credential=${2:-/usr/local/etc/florriowave-preview/cloudflare-token}
if [ ! -s "$credential" ]; then
  echo 'Run configure-cloudflare-macos.mjs first to save a scoped Cloudflare API Token.' >&2
  exit 1
fi
modules=$("$binary" list-modules --skip-standard)
case "$modules" in
  *dns.providers.cloudflare*) ;;
  *) echo 'Caddy must include github.com/caddy-dns/cloudflare.' >&2; exit 1 ;;
esac
label=org.xcx0902.florriowave.caddy
install -d -m 755 /usr/local/libexec/florriowave-preview /usr/local/etc/florriowave-preview
install -d -m 700 /var/lib/florriowave-preview
install -d -m 750 -g admin /var/log/florriowave-preview
touch /var/log/florriowave-preview/caddy.log
chown root:admin /var/log/florriowave-preview/caddy.log
chmod 640 /var/log/florriowave-preview/caddy.log
install -m 755 "$binary" /usr/local/libexec/florriowave-preview/caddy.new
install -m 644 "$config" /usr/local/etc/florriowave-preview/Caddyfile.new
install -m 600 "$credential" /usr/local/etc/florriowave-preview/cloudflare-token.new
install -m 755 "$repo/wave/tools/deploy/run-caddy-macos.sh" /usr/local/libexec/florriowave-preview/run-caddy.new
CF_API_TOKEN=$(cat /usr/local/etc/florriowave-preview/cloudflare-token.new)
export CF_API_TOKEN
XDG_DATA_HOME=/var/lib/florriowave-preview \
XDG_CONFIG_HOME=/var/lib/florriowave-preview/config \
  /usr/local/libexec/florriowave-preview/caddy.new validate \
    --config /usr/local/etc/florriowave-preview/Caddyfile.new --adapter caddyfile
mv /usr/local/libexec/florriowave-preview/caddy.new /usr/local/libexec/florriowave-preview/caddy
mv /usr/local/etc/florriowave-preview/Caddyfile.new /usr/local/etc/florriowave-preview/Caddyfile
mv /usr/local/etc/florriowave-preview/cloudflare-token.new /usr/local/etc/florriowave-preview/cloudflare-token
mv /usr/local/libexec/florriowave-preview/run-caddy.new /usr/local/libexec/florriowave-preview/run-caddy
cat > /Library/LaunchDaemons/org.xcx0902.florriowave.caddy.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>org.xcx0902.florriowave.caddy</string>
<key>ProgramArguments</key><array>
<string>/usr/local/libexec/florriowave-preview/run-caddy</string>
</array>
<key>EnvironmentVariables</key><dict>
<key>XDG_DATA_HOME</key><string>/var/lib/florriowave-preview</string>
<key>XDG_CONFIG_HOME</key><string>/var/lib/florriowave-preview/config</string>
<key>HOME</key><string>/var/root</string>
</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>/var/log/florriowave-preview/caddy.log</string>
<key>StandardErrorPath</key><string>/var/log/florriowave-preview/caddy.log</string>
</dict></plist>
PLIST
chown root:wheel /Library/LaunchDaemons/org.xcx0902.florriowave.caddy.plist
chmod 644 /Library/LaunchDaemons/org.xcx0902.florriowave.caddy.plist
plutil -lint /Library/LaunchDaemons/org.xcx0902.florriowave.caddy.plist
launchctl bootout "system/$label" 2>/dev/null || true
attempts=0
while launchctl print "system/$label" >/dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 100 ]; then
    echo 'Previous Caddy service is still stopping; bootstrap was not attempted.' >&2
    exit 1
  fi
  sleep 0.1
done
launchctl bootstrap system /Library/LaunchDaemons/org.xcx0902.florriowave.caddy.plist
echo 'Caddy installed and started on HTTPS port 18443 with automatic DNS certificate renewal.'
