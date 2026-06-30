import { fileURLToPath } from 'node:url';
import {
  GetParametersByPathCommand,
  SSMClient,
  type SSMClientConfig,
} from '@aws-sdk/client-ssm';

type EnvironmentTarget = Record<string, string | undefined>;
type ParameterClient = Pick<SSMClient, 'send'>;

interface LoadOptions {
  prefix: string;
  client: ParameterClient;
  target: EnvironmentTarget;
}

export async function loadSsmEnvironment({
  prefix,
  client,
  target,
}: LoadOptions): Promise<number> {
  let nextToken: string | undefined;
  let loaded = 0;

  do {
    const response = await client.send(new GetParametersByPathCommand({
      Path: prefix,
      Recursive: false,
      WithDecryption: true,
      NextToken: nextToken,
    }));

    for (const parameter of response.Parameters ?? []) {
      const key = parameter.Name?.slice(parameter.Name.lastIndexOf('/') + 1);
      if (!key || parameter.Value === undefined) {
        throw new Error(`Invalid SSM parameter under ${prefix}`);
      }
      if (target[key] === undefined) target[key] = parameter.Value;
      loaded += 1;
    }
    nextToken = response.NextToken;
  } while (nextToken);

  if (loaded === 0) throw new Error(`No SSM parameters found under ${prefix}`);
  return loaded;
}

async function start(): Promise<void> {
  const prefix = process.env.SSM_PARAMETER_PREFIX;
  if (prefix) {
    const config: SSMClientConfig = {};
    if (process.env.AWS_REGION) config.region = process.env.AWS_REGION;
    const loaded = await loadSsmEnvironment({
      prefix,
      client: new SSMClient(config),
      target: process.env,
    });
    console.info(`[ssm] Loaded ${loaded} runtime parameters from ${prefix}`);
  }
  await import('./server.js');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  start().catch((error: unknown) => {
    console.error('[ssm] Failed to prepare runtime environment', error);
    process.exit(1);
  });
}
