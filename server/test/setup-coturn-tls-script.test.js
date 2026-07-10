import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('deploy/setup-coturn-tls.sh', () => {
  it('obtains and renews the TURN certificate through the nginx-served HTTP-01 webroot', async () => {
    const script = await readFile(new URL('../../deploy/setup-coturn-tls.sh', import.meta.url), 'utf8');

    expect(script).toContain('verify_acme_challenge');
    expect(script).toContain('http://$TURN_DOMAIN/.well-known/acme-challenge/$challenge_token');
    expect(script).toContain('certbot certonly --webroot');
    expect(script).toContain('--webroot-path "$CERTBOT_WEBROOT"');
    expect(script).toContain('--keep-until-expiring');
    expect(script).toContain('systemctl enable --now certbot.timer');
    expect(script).toContain('/etc/letsencrypt/renewal-hooks/deploy/a-meet-coturn');
  });

  it('installs renewed key material into coturn and cleanly recreates the TLS listener', async () => {
    const script = await readFile(new URL('../../deploy/setup-coturn-tls.sh', import.meta.url), 'utf8');

    expect(script).toContain('install -m 0600 "$CERT_LINEAGE/fullchain.pem" "$COTURN_CERT_DIR/fullchain.pem"');
    expect(script).toContain('install -m 0600 "$CERT_LINEAGE/privkey.pem" "$COTURN_CERT_DIR/privkey.pem"');
    expect(script).toContain('docker compose -f "$A_MEET_DIR/docker-compose.coturn.yml" up -d --force-recreate coturn');
    expect(script).toContain('CERT_LINEAGE=/etc/letsencrypt/live/$TURN_DOMAIN');
    expect(script).not.toContain('CERT_LINEAGE="${RENEWED_LINEAGE:-');
  });
});

describe('deploy/coturn-renew-hook.sh', () => {
  it('only installs a certificate after the configured TURN lineage renews', async () => {
    const hook = await readFile(new URL('../../deploy/coturn-renew-hook.sh', import.meta.url), 'utf8');

    expect(hook).toContain('TURN_LINEAGE="/etc/letsencrypt/live/$TURN_DOMAIN"');
    expect(hook).toContain('[ "${RENEWED_LINEAGE:-}" != "$TURN_LINEAGE" ]');
    expect(hook).toContain('exit 0');
  });
});

describe('deploy/nginx.conf', () => {
  it('serves HTTP-01 challenges without redirecting them to HTTPS', async () => {
    const config = await readFile(new URL('../../deploy/nginx.conf', import.meta.url), 'utf8');

    expect(config).toContain('location ^~ /.well-known/acme-challenge/');
    expect(config).toContain('root /var/www/certbot;');
    expect(config).toContain('server_name API_DOMAIN TURN_DOMAIN;');
  });
});

describe('TURN over TLS documentation', () => {
  it('requires the TURN hostname in nginx and describes recovery as an operator action', async () => {
    const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');

    expect(readme).toContain('API_DOMAIN and TURN_DOMAIN replaced');
    expect(readme).toContain('operator must re-run `setup-coturn-tls.sh setup` after recovery');
  });

  it('does not present TLS TURN on 5349 as a port-443 fallback', async () => {
    const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');

    expect(readme).toContain('does not use port 443');
    expect(readme).toContain('out-of-scope follow-up');
  });
});
