#!/usr/bin/env bash
# Give the Spotify→Discord bridge priority over Libra in every resource
# dimension on the shared single-vCPU host. Ubuntu 24.04 is cgroup v2, so
# CPUWeight is the correct knob. Idempotent.
#
# Run from the workstation:
#   Z:/Users/Heiner/Documents/PCSetup/spotify-discord/cloud/vps-ssh.ps1 -Script scripts/server/audio-priority.sh
set -euo pipefail

for unit in go-librespot spotify-discord-bot; do
  mkdir -p "/etc/systemd/system/${unit}.service.d"
  cat >"/etc/systemd/system/${unit}.service.d/10-priority.conf" <<'EOF'
[Service]
# Audio is latency-sensitive and must win every scheduling contest with the
# web app sharing this single vCPU.
CPUWeight=10000
# Under memory pressure the kernel must reach for Libra first, never the
# bridge.
OOMScoreAdjust=-500
EOF
done

mkdir -p /etc/systemd/system/docker.service.d
cat >/etc/systemd/system/docker.service.d/10-priority.conf <<'EOF'
[Service]
CPUWeight=100
EOF

systemctl daemon-reload
systemctl restart go-librespot spotify-discord-bot
systemctl restart docker 2>/dev/null || true

systemctl show go-librespot -p CPUWeight -p OOMScoreAdjust
systemctl show spotify-discord-bot -p CPUWeight -p OOMScoreAdjust
systemctl is-active go-librespot spotify-discord-bot
