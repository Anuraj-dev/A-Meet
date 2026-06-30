import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('deploy/aws-observability.sh', () => {
  it('provisions an app readiness health check alarm for process-down detection', async () => {
    const script = await readFile(new URL('../../deploy/aws-observability.sh', import.meta.url), 'utf8');

    expect(script).toContain('ROUTE53_ALARM_REGION="${ROUTE53_ALARM_REGION:-us-east-1}"');
    expect(script).toContain('READINESS_PATH="${READINESS_PATH:-/api/health/ready}"');
    expect(script).toContain('aws route53 create-health-check');
    expect(script).toContain('PROCESS_TOPIC_ARN=$(aws sns create-topic');
    expect(script).toContain('SSM_REGION=${AWS_REGION}');
    expect(script).toContain('--region "$ROUTE53_ALARM_REGION"');
    expect(script).toContain('--namespace AWS/Route53');
    expect(script).toContain('--metric-name HealthCheckStatus');
    expect(script).toContain('--comparison-operator LessThanThreshold');
    expect(script).toContain('--alarm-name "a-meet-${ENVIRONMENT}-process-down"');
  });

  it('trips the mongo-disconnect alarm on a single datapoint, since the event is logged once', async () => {
    const script = await readFile(new URL('../../deploy/aws-observability.sh', import.meta.url), 'utf8');

    // put_alarm <name> <metric> <period> <evaluation-periods/datapoints> <threshold>:
    // a single breaching period must fire, otherwise a real sustained outage (logged
    // only once) would never accumulate the consecutive datapoints to alarm.
    expect(script).toContain('put_alarm mongo-disconnect MongoDisconnectCount 60 1 1');
  });
});
