import { describe, expect, it } from 'vitest';
import {
  decideNotification,
  formatAlarmMessage,
  formatRecoveryMessage,
  parseSnsAlarm,
} from '../../deploy/telegram-notifier/formatter.mjs';

function snsEvent(message) {
  return { Records: [{ Sns: { Message: JSON.stringify(message) } }] };
}

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
    const event = snsEvent({
      AlarmName: 'a-meet-prod-health',
      NewStateValue: 'ALARM',
      NewStateReason: 'health check failed',
      StateChangeTime: '2026-07-05T12:35:00.000+0000',
    });

    expect(parseSnsAlarm(event, 'prod')).toEqual({
      alarmName: 'a-meet-prod-health',
      environment: 'prod',
      state: 'ALARM',
      reason: 'health check failed',
      stateChangeTime: '2026-07-05T12:35:00.000+0000',
    });
  });
});

describe('formatRecoveryMessage', () => {
  it('renders a single compact recovery line with minutes and seconds', () => {
    expect(formatRecoveryMessage({
      alarmName: 'a-meet-prod-mongo-disconnect',
      environment: 'prod',
      durationMs: 90_000,
    })).toBe(
      'A-Meet alert [prod]\n' +
      'Alarm: a-meet-prod-mongo-disconnect\n' +
      '✅ recovered after 1m 30s',
    );
  });
});

describe('decideNotification', () => {
  const window = 10 * 60 * 1000;

  it('passes an ALARM through unchanged for immediate delivery', () => {
    const parsed = parseSnsAlarm(snsEvent({
      AlarmName: 'a-meet-prod-mongo-disconnect',
      NewStateValue: 'ALARM',
      NewStateReason: 'one disconnect matched',
      StateChangeTime: '2026-07-05T12:35:00.000+0000',
    }), 'prod');

    expect(decideNotification(parsed, {
      previousStateChangeTime: null,
      suppressionWindowMs: window,
    })).toEqual({
      text: formatAlarmMessage(parsed),
    });
  });

  it('folds a quick recovery into a compact line when the stored ALARM timestamp is within the window', () => {
    const parsed = parseSnsAlarm(snsEvent({
      AlarmName: 'a-meet-prod-mongo-disconnect',
      NewStateValue: 'OK',
      NewStateReason: 'metric back to normal',
      StateChangeTime: '2026-07-05T12:36:30.000+0000',
    }), 'prod');

    expect(decideNotification(parsed, {
      previousStateChangeTime: '2026-07-05T12:35:00.000+0000',
      suppressionWindowMs: window,
    })).toEqual({
      text: formatRecoveryMessage({
        alarmName: 'a-meet-prod-mongo-disconnect',
        environment: 'prod',
        durationMs: 90_000,
      }),
    });
  });

  it('sends the full OK block when recovery is slower than the window', () => {
    const parsed = parseSnsAlarm(snsEvent({
      AlarmName: 'a-meet-prod-process-down',
      NewStateValue: 'OK',
      NewStateReason: 'health restored',
      StateChangeTime: '2026-07-05T13:00:00.000+0000',
    }), 'prod');

    expect(decideNotification(parsed, {
      previousStateChangeTime: '2026-07-05T12:40:00.000+0000',
      suppressionWindowMs: window,
    })).toEqual({
      text: formatAlarmMessage(parsed),
    });
  });

  it('sends the full OK block when no stored ALARM timestamp is available', () => {
    const parsed = parseSnsAlarm(snsEvent({
      AlarmName: 'a-meet-prod-process-down',
      NewStateValue: 'OK',
      NewStateReason: 'health restored',
      StateChangeTime: '2026-07-05T13:00:00.000+0000',
    }), 'prod');

    expect(decideNotification(parsed, {
      previousStateChangeTime: null,
      suppressionWindowMs: window,
    })).toEqual({
      text: formatAlarmMessage(parsed),
    });
  });

  it('sends the full OK block when the stored timestamp is malformed', () => {
    const parsed = parseSnsAlarm(snsEvent({
      AlarmName: 'a-meet-prod-process-down',
      NewStateValue: 'OK',
      NewStateReason: 'health restored',
      StateChangeTime: '2026-07-05T13:00:00.000+0000',
    }), 'prod');

    expect(decideNotification(parsed, {
      previousStateChangeTime: 'not-a-timestamp',
      suppressionWindowMs: window,
    })).toEqual({
      text: formatAlarmMessage(parsed),
    });
  });
});
