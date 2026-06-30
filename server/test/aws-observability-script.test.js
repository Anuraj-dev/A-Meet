import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('deploy/aws-observability.sh', () => {
  it('provisions an app readiness health check alarm for process-down detection', async () => {
    const script = await readFile(new URL('../../deploy/aws-observability.sh', import.meta.url), 'utf8');

    expect(script).toContain('READINESS_PATH="${READINESS_PATH:-/api/health/ready}"');
    expect(script).toContain('aws route53 create-health-check');
    expect(script).toContain('--namespace AWS/Route53');
    expect(script).toContain('--metric-name HealthCheckStatus');
    expect(script).toContain('--comparison-operator LessThanThreshold');
    expect(script).toContain('--alarm-name "a-meet-${ENVIRONMENT}-process-down"');
  });
});
