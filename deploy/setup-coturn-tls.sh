#!/usr/bin/env bash
#
# Provision the Let's Encrypt certificate used by coturn's TLS listener. The
# certificate is obtained over HTTP-01 through nginx's ACME webroot and copied
# into the bind-mounted location coturn reads. Re-running this script is safe:
# certbot preserves an unexpired certificate and coturn is recreated with the
# current certificate files.
#
# Usage (on the coturn host):
#   sudo env TURN_DOMAIN=turn.example.com TURN_EMAIL=ops@example.com \
#     A_MEET_DIR=/home/ubuntu/ameet deploy/setup-coturn-tls.sh setup
#
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run this script as root (for example: sudo env ...)." >&2
  exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
A_MEET_DIR="${A_MEET_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
TURN_DOMAIN="${TURN_DOMAIN:?set TURN_DOMAIN to the public TURN hostname}"
CERTBOT_WEBROOT="${CERTBOT_WEBROOT:-/var/www/certbot}"
COTURN_CERT_DIR="${COTURN_CERT_DIR:-$A_MEET_DIR/coturn/certs}"
CERT_LINEAGE=/etc/letsencrypt/live/$TURN_DOMAIN
RENEWAL_HOOK=/etc/letsencrypt/renewal-hooks/deploy/a-meet-coturn
RUNTIME_CONFIG=/etc/a-meet/coturn-tls.env
COTURN_RUNTIME_UID="${COTURN_RUNTIME_UID:-65534}"
COTURN_RUNTIME_GID="${COTURN_RUNTIME_GID:-65534}"

ensure_certbot() {
  if command -v certbot >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
    return
  fi

  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y certbot curl
}

verify_acme_challenge() {
  local challenge_dir="$CERTBOT_WEBROOT/.well-known/acme-challenge"
  local challenge_token="a-meet-acme-${RANDOM}-${RANDOM}"
  local challenge_file="$challenge_dir/$challenge_token"
  local challenge_value="a-meet-acme-ready"
  local response

  install -d -m 0755 "$challenge_dir"
  printf '%s' "$challenge_value" > "$challenge_file"

  if ! response=$(curl --fail --silent --show-error --connect-timeout 5 --max-time 10 \
    "http://$TURN_DOMAIN/.well-known/acme-challenge/$challenge_token"); then
    rm -f "$challenge_file"
    echo "TURN HTTP-01 challenge is not reachable at http://$TURN_DOMAIN/.well-known/acme-challenge/" >&2
    exit 1
  fi
  rm -f "$challenge_file"

  if [ "$response" != "$challenge_value" ]; then
    echo "TURN HTTP-01 challenge returned an unexpected response; check DNS, nginx, and TCP 80." >&2
    exit 1
  fi
}

install_certificate() {
  if [ ! -f "$CERT_LINEAGE/fullchain.pem" ] || [ ! -f "$CERT_LINEAGE/privkey.pem" ]; then
    echo "Certificate files are missing from $CERT_LINEAGE" >&2
    exit 1
  fi

  # The coturn/coturn image drops to nobody:nogroup (65534:65534); certificates
  # installed as root-only are unreadable inside the container and the TLS
  # listener silently fails to start. Own the copies by that uid/gid.
  install -d -m 0700 -o "$COTURN_RUNTIME_UID" -g "$COTURN_RUNTIME_GID" "$COTURN_CERT_DIR"
  install -m 0600 -o "$COTURN_RUNTIME_UID" -g "$COTURN_RUNTIME_GID" "$CERT_LINEAGE/fullchain.pem" "$COTURN_CERT_DIR/fullchain.pem"
  install -m 0600 -o "$COTURN_RUNTIME_UID" -g "$COTURN_RUNTIME_GID" "$CERT_LINEAGE/privkey.pem" "$COTURN_CERT_DIR/privkey.pem"

  # coturn reads certificates on startup. Recreate only this container so the
  # new certificate is live without disturbing the application container.
  docker compose -f "$A_MEET_DIR/docker-compose.coturn.yml" up -d --force-recreate coturn
}

install_renewal_hook() {
  install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy /etc/a-meet
  install -m 0755 "$SCRIPT_DIR/coturn-renew-hook.sh" "$RENEWAL_HOOK"
  {
    printf 'A_MEET_DIR=%q\n' "$A_MEET_DIR"
    printf 'TURN_DOMAIN=%q\n' "$TURN_DOMAIN"
    printf 'COTURN_CERT_DIR=%q\n' "$COTURN_CERT_DIR"
  } > "$RUNTIME_CONFIG"
  chmod 0600 "$RUNTIME_CONFIG"
}

setup() {
  : "${TURN_EMAIL:?set TURN_EMAIL to the Lets Encrypt renewal contact}"
  install -d -m 0755 "$CERTBOT_WEBROOT"
  ensure_certbot
  install_renewal_hook

  # nginx serves CERTBOT_WEBROOT/.well-known/acme-challenge on port 80. Unlike
  # certbot's standalone mode, this is safe while the existing API redirect is
  # already bound to port 80.
  verify_acme_challenge
  certbot certonly --webroot \
    --webroot-path "$CERTBOT_WEBROOT" \
    --domain "$TURN_DOMAIN" \
    --email "$TURN_EMAIL" \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring

  systemctl enable --now certbot.timer
  install_certificate
}

case "${1:-setup}" in
  setup) setup ;;
  install-certificate) install_certificate ;;
  *) echo "usage: $0 {setup|install-certificate}" >&2; exit 2 ;;
esac
