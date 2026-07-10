#!/usr/bin/env bash
# Installed by setup-coturn-tls.sh as Certbot's deploy hook. Certbot provides
# RENEWED_LINEAGE. Only the configured TURN lineage may update coturn.
set -euo pipefail

# Export everything the runtime config defines: the sourced variables must
# survive into the exec'd setup-coturn-tls.sh process, not just this shell.
set -a
# shellcheck disable=SC1091
. /etc/a-meet/coturn-tls.env
set +a

TURN_LINEAGE="/etc/letsencrypt/live/$TURN_DOMAIN"
if [ "${RENEWED_LINEAGE:-}" != "$TURN_LINEAGE" ]; then
  exit 0
fi

exec "$A_MEET_DIR/deploy/setup-coturn-tls.sh" install-certificate
