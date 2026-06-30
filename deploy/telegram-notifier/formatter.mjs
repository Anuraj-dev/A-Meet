export function parseSnsAlarm(event, environment) {
  const raw = event?.Records?.[0]?.Sns?.Message;
  if (!raw) throw new Error('SNS alarm message is missing');
  const alarm = JSON.parse(raw);
  return {
    alarmName: alarm.AlarmName,
    environment,
    state: alarm.NewStateValue,
    reason: alarm.NewStateReason,
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
