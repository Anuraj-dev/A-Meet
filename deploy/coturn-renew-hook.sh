#!/usr/bin/env bash
# Installed by setup-coturn-tls.sh as Certbot's deploy hook. Certbot provides
# RENEWED_LINEAGE so the setup script copies the just-renewed certificate.
set -euo pipefail

# shellcheck disable=SC1091
. /etc/a-meet/coturn-tls.env

exec "$A_MEET_DIR/deploy/setup-coturn-tls.sh" install-certificate
