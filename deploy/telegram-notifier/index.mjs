import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { formatAlarmMessage, parseSnsAlarm } from './formatter.mjs';

const ssm = new SSMClient({});

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

export async function handler(event) {
  const alarm = parseSnsAlarm(event, process.env.ENVIRONMENT ?? 'unknown');
  const { token, chatId } = await readTelegramConfig();
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: formatAlarmMessage(alarm),
    }),
  });
  if (!response.ok) throw new Error(`Telegram API failed with ${response.status}`);
}
