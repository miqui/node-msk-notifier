import { Kafka, logLevel } from 'kafkajs';
import { generateAuthToken } from 'aws-msk-iam-sasl-signer-js';
import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { publishToSns } from './services/sns.js';

const kafka = new Kafka({
  clientId: 'node-msk-notifier-consumer',
  brokers: config.MSK_BROKERS.split(',').map((b) => b.trim()),
  ssl: true,
  sasl: {
    mechanism: 'oauthbearer',
    oauthBearerProvider: async () => {
      const auth = await generateAuthToken({ region: config.AWS_REGION });
      return { value: auth.token };
    },
  },
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

const consumer = kafka.consumer({
  groupId: config.KAFKA_GROUP_ID,
  sessionTimeout: 30_000,
  heartbeatInterval: 3_000,
});

/**
 * Processes a single Kafka message:
 *   1. Parse JSON payload
 *   2. Publish to SNS
 *   3. Log result
 *
 * Errors are caught per-message so one bad message does not crash the consumer.
 */
async function handleMessage({ topic, partition, message }) {
  const raw = message.value?.toString();

  if (!raw) {
    logger.warn({ topic, partition, offset: message.offset }, 'empty_message_skipped');
    return;
  }

  let notification;

  try {
    notification = JSON.parse(raw);
  } catch {
    logger.error({ topic, partition, offset: message.offset, raw }, 'json_parse_failed');
    return;
  }

  logger.info(
    { id: notification.id, topic, partition, offset: message.offset },
    'message_received',
  );

  try {
    const snsMessageId = await publishToSns(notification);
    logger.info({ notificationId: notification.id, snsMessageId }, 'delivery_success');
  } catch (err) {
    logger.error({ err, notificationId: notification.id }, 'delivery_failed');
    // Re-throw to trigger KafkaJS retry / dead-letter logic if configured
    throw err;
  }
}

async function start() {
  await consumer.connect();
  logger.info({ groupId: config.KAFKA_GROUP_ID }, 'consumer_connected');

  await consumer.subscribe({
    topic: config.KAFKA_TOPIC,
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: handleMessage,
  });

  logger.info({ topic: config.KAFKA_TOPIC }, 'consumer_running');
}

// Graceful shutdown — commit offsets before exiting
const shutdown = async (signal) => {
  logger.info({ signal }, 'shutdown_received');

  try {
    await consumer.disconnect();
    logger.info('consumer_disconnected');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'shutdown_error');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  logger.error({ err }, 'consumer_startup_failed');
  process.exit(1);
});
