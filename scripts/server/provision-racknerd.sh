#!/usr/bin/env bash
# Idempotent provisioning for the Libra production host (RackNerd, Ubuntu 24.04,
# 1 vCPU / 961 MB), co-located with the Spotify→Discord bridge.
#
# Safe to re-run; safe to run against a fresh box — that is the point: the
# planned migration to a larger box replays this instead of repeating the
# archaeology. See docs/superpowers/specs/2026-09-05-production-re-release-design.md §6.
#
# Run from the workstation:
#   Z:/Users/Heiner/Documents/PCSetup/spotify-discord/cloud/vps-ssh.ps1 -Script scripts/server/provision-racknerd.sh
set -euo pipefail

echo "== baseline =="
free -m | head -2
journalctl --disk-usage || true

echo "== removing packages a headless KVM guest does not need =="
# unattended-upgrades is deliberately KEPT: this box faces the internet.
systemctl disable --now snapd.socket snapd.service 2>/dev/null || true
DEBIAN_FRONTEND=noninteractive apt-get purge -y snapd fwupd modemmanager udisks2 multipath-tools 2>/dev/null || true
DEBIAN_FRONTEND=noninteractive apt-get autoremove -y

echo "== capping the journal =="
mkdir -p /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/00-size.conf <<'EOF'
[Journal]
SystemMaxUse=50M
EOF
journalctl --vacuum-size=50M
systemctl restart systemd-journald

echo "== swap: add a 2 GB file next to the 1 GB partition (3 GB total) =="
# The existing 1 GB swap is a partition (/dev/vda3); it stays. A swapfile
# supplies the rest, so no repartitioning is needed.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
fi
swapon /swapfile 2>/dev/null || true
grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
sysctl -w vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >>/etc/sysctl.conf

echo "== docker from the official repo (not snap) =="
if ! command -v docker >/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    >/etc/apt/sources.list.d/docker.list
  DEBIAN_FRONTEND=noninteractive apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
systemctl enable --now docker

echo "== cloudflared from Cloudflare's repo =="
if ! command -v cloudflared >/dev/null; then
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    >/etc/apt/sources.list.d/cloudflared.list
  DEBIAN_FRONTEND=noninteractive apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y cloudflared
fi

echo "== firewall: SSH only; the tunnel is outbound =="
DEBIAN_FRONTEND=noninteractive apt-get install -y ufw
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable

echo "== deploy directory =="
mkdir -p /opt/libra

echo "== bridge still up? =="
systemctl is-active go-librespot spotify-discord-bot

echo "== after =="
free -m | head -2
swapon --show
docker --version
cloudflared --version
ufw status | head -3
journalctl --disk-usage || true
