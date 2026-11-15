#!/bin/sh
set -eu
# Read the root-owned credential without placing it in arguments or the Caddyfile.
CF_API_TOKEN=$(cat /usr/local/etc/florriowave-preview/cloudflare-token)
export CF_API_TOKEN
exec /usr/local/libexec/florriowave-preview/caddy run \
  --config /usr/local/etc/florriowave-preview/Caddyfile --adapter caddyfile
