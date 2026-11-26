#!/usr/bin/env bash
# Isolated hosted-runner fixture only. Never installs packages or changes services on a customer host.
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted || "$#" -eq 0 ]]; then
  echo "Refusing ClamAV fixture outside a GitHub-hosted QA runner or without a test command" >&2
  exit 1
fi
sudo apt-get update
sudo apt-get install -y --no-install-recommends clamav-daemon clamav-freshclam clamdscan
sudo systemctl stop clamav-freshclam.service
sudo freshclam --stdout

config="$(mktemp)"
log="$(mktemp)"
cat > "$config" <<'CONF'
Foreground yes
TCPAddr 127.0.0.1
TCPSocket 3310
DatabaseDirectory /var/lib/clamav
StreamMaxLength 16M
MaxFileSize 16M
MaxScanSize 100M
AlertExceedsMax yes
MaxThreads 4
MaxQueue 8
CONF
clamd --config-file="$config" > "$log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; cat "$log"; rm -f "$config" "$log"' EXIT
clamdscan --config-file="$config" --ping=60:1
clamdscan --config-file="$config" --version
export CONTAGEST_CLAMD_PORT=3310
"$@"
