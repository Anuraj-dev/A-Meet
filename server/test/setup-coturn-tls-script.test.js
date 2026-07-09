import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('deploy/setup-coturn-tls.sh', () => {
  it('obtains and renews the TURN certificate through the nginx-served HTTP-01 webroot', async () => {
    const script = await readFile(new URL('../../deploy/setup-coturn-tls.sh', import.meta.url), 'utf8');

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
  });
});

describe('deploy/nginx.conf', () => {
  it('serves HTTP-01 challenges without redirecting them to HTTPS', async () => {
    const config = await readFile(new URL('../../deploy/nginx.conf', import.meta.url), 'utf8');

    expect(config).toContain('location ^~ /.well-known/acme-challenge/');
    expect(config).toContain('root /var/www/certbot;');
  });
});
