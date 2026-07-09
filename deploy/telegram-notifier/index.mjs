import {
  GetParameterCommand,
  GetParametersCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { decideNotification, parseSnsAlarm } from './formatter.mjs';

const ssm = new SSMClient({ region: process.env.SSM_REGION });

async function readTelegramConfig() {
  const names = [
    process.env.TELEGRAM_TOKEN_PARAMETER,
    process.env.TELEGRAM_CHAT_ID_PARAMETER,
  ];
  if (names.some((name) => !name)) throw new Error('Telegram SSM parameter names are missing');

  const response = await ssm.send(new GetParametersCommand({
    Names: names,
    WithDecryption: true,
  }));
  const values = new Map(response.Parameters?.map((parameter) => [
    parameter.Name,
    parameter.Value,
  ]));
  const token = values.get(names[0]);
  const chatId = values.get(names[1]);
  if (!token || !chatId) throw new Error('Telegram SSM parameters could not be resolved');
  return { token, chatId };
}

// The CloudWatch SNS payload only carries the NEW state's StateChangeTime, so
// the ALARM timestamp is persisted in SSM and read back when the OK arrives to
// measure how long the alarm was in ALARM (flap suppression window).
function alarmStateParameterName(environment, alarmName) {
  return `/a-meet/${environment}/alarm-state/${alarmName}`;
}

async function storeAlarmTimestamp(environment, alarmName, stateChangeTime) {
  if (!stateChangeTime) return;
  await ssm.send(new PutParameterCommand({
    Name: alarmStateParameterName(environment, alarmName),
    Value: stateChangeTime,
    Type: 'String',
    Overwrite: true,
  }));
}

async function readAlarmTimestamp(environment, alarmName) {
  try {
    const response = await ssm.send(new GetParameterCommand({
      Name: alarmStateParameterName(environment, alarmName),
    }));
    return response.Parameter?.Value ?? null;
  } catch (error) {
    if (error?.name === 'ParameterNotFound') return null;
    throw error;
  }
}

export async function handler(event) {
  const alarm = parseSnsAlarm(event, process.env.ENVIRONMENT ?? 'unknown');

  let previousStateChangeTime = null;
  if (alarm.state === 'ALARM') {
    await storeAlarmTimestamp(alarm.environment, alarm.alarmName, alarm.stateChangeTime);
  } else if (alarm.state === 'OK') {
    previousStateChangeTime = await readAlarmTimestamp(alarm.environment, alarm.alarmName);
  }

  const { text } = decideNotification(alarm, { previousStateChangeTime });
  const { token, chatId } = await readTelegramConfig();
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
  if (!response.ok) throw new Error(`Telegram API failed with ${response.status}`);
}
