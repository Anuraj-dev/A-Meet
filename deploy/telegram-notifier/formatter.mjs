export const DEFAULT_SUPPRESSION_WINDOW_MS = 10 * 60 * 1000;

export function parseSnsAlarm(event, environment) {
  const raw = event?.Records?.[0]?.Sns?.Message;
  if (!raw) throw new Error('SNS alarm message is missing');
  const alarm = JSON.parse(raw);
  return {
    alarmName: alarm.AlarmName,
    environment,
    state: alarm.NewStateValue,
    reason: alarm.NewStateReason,
    stateChangeTime: alarm.StateChangeTime ?? null,
  };
}

export function formatAlarmMessage({ alarmName, environment, state, reason }) {
  return [
    `A-Meet alert [${environment}]`,
    `Alarm: ${alarmName}`,
    `State: ${state}`,
    `Reason: ${reason}`,
  ].join('\n');
}

export function formatRecoveryMessage({ alarmName, environment, durationMs }) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return [
    `A-Meet alert [${environment}]`,
    `Alarm: ${alarmName}`,
    `✅ recovered after ${minutes}m ${seconds}s`,
  ].join('\n');
}

// Pure delivery decision: ALARMs always pass through unchanged for instant
// paging. A quick recovery (OK within the suppression window of the ALARM it
// clears) collapses into one compact line instead of a full ALARM/OK pair.
// The CloudWatch SNS payload only carries StateChangeTime, so the caller
// supplies previousStateChangeTime (the matching ALARM's timestamp, persisted
// by the Lambda). When the recovery duration can't be determined, we fall back
// to the full OK block so a genuine recovery is never silently dropped.
export function decideNotification(parsed, options = {}) {
  const windowMs = options.suppressionWindowMs ?? DEFAULT_SUPPRESSION_WINDOW_MS;

  if (parsed.state !== 'OK') {
    return { text: formatAlarmMessage(parsed) };
  }

  const durationMs = recoveryDurationMs({
    stateChangeTime: parsed.stateChangeTime,
    previousStateChangeTime: options.previousStateChangeTime ?? null,
  });
  if (durationMs !== null && durationMs <= windowMs) {
    return {
      text: formatRecoveryMessage({
        alarmName: parsed.alarmName,
        environment: parsed.environment,
        durationMs,
      }),
    };
  }

  return { text: formatAlarmMessage(parsed) };
}

function recoveryDurationMs({ stateChangeTime, previousStateChangeTime }) {
  if (!stateChangeTime || !previousStateChangeTime) return null;
  const now = Date.parse(stateChangeTime);
  const before = Date.parse(previousStateChangeTime);
  if (Number.isNaN(now) || Number.isNaN(before)) return null;
  const durationMs = now - before;
  return durationMs >= 0 ? durationMs : null;
}
