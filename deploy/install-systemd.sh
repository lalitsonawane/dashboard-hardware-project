#!/usr/bin/env bash
# Install systemd unit for the Build Console (loopback only).
# Public HTTPS is via Caddy → app.maoulabs.dpdns.org (see docs/hosting.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR=/etc/systemd/system

echo "Installing iot-build-console.service → ${UNIT_DIR}"
sudo cp "${ROOT}/deploy/systemd/iot-build-console.service" "${UNIT_DIR}/iot-build-console.service"
sudo systemctl daemon-reload
sudo systemctl enable iot-build-console.service
sudo systemctl restart iot-build-console.service
sudo systemctl --no-pager --full status iot-build-console.service || true

echo
echo "App unit installed on 127.0.0.1:8080."
echo "Ensure /etc/caddy/Caddyfile includes deploy/caddy/Caddyfile.snippet, then:"
echo "  sudo systemctl reload caddy"
echo "Public URL: https://app.maoulabs.dpdns.org/"
echo "See docs/hosting.md"
