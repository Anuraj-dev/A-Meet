import { describe, expect, it } from 'vitest';
import {
  formatAlarmMessage,
  parseSnsAlarm,
} from '../../deploy/telegram-notifier/formatter.mjs';

describe('Telegram alarm formatter', () => {
  it('formats the alarm name, environment, state, and reason', () => {
    expect(formatAlarmMessage({
      alarmName: 'a-meet-prod-fatal-log',
      environment: 'prod',
      state: 'ALARM',
      reason: 'one fatal event matched',
    })).toBe(
      'A-Meet alert [prod]\n' +
      'Alarm: a-meet-prod-fatal-log\n' +
      'State: ALARM\n' +
      'Reason: one fatal event matched',
    );
  });

  it('parses a CloudWatch alarm delivered through SNS message JSON', () => {
    const event = {
      Records: [{
        Sns: {
          Message: JSON.stringify({
            AlarmName: 'a-meet-prod-health',
            NewStateValue: 'ALARM',
            NewStateReason: 'health check failed',
          }),
        },
      }],
    };

    expect(parseSnsAlarm(event, 'prod')).toEqual({
      alarmName: 'a-meet-prod-health',
      environment: 'prod',
      state: 'ALARM',
      reason: 'health check failed',
    });
  });
});
