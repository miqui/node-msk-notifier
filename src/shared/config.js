import { z } from 'zod';

const ConfigSchema = z.object({
  // Kafka / MSK
  MSK_BROKERS: z.string().min(1),
  KAFKA_TOPIC: z.string().default('notifications'),
  KAFKA_GROUP_ID: z.string().default('node-msk-notifier-consumer'),

  // SNS
  SNS_TOPIC_ARN: z.string().min(1),

  // AWS
  AWS_REGION: z.string().default('us-east-1'),

  // API
  API_KEY: z.string().min(16).optional(),
  PORT: z.coerce.number().default(3000),

  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  NODE_ENV: z.string().default('production'),
});

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(
    `[config] Invalid environment variables:\n${JSON.stringify(parsed.error.format(), null, 2)}\n`,
  );
  process.exit(1);
}

export const config = parsed.data;
