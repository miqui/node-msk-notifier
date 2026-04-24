import { Kafka, logLevel } from 'kafkajs';
import { generateAuthToken } from 'aws-msk-iam-sasl-signer-js';
import { config } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';

const kafka = new Kafka({
  clientId: 'node-msk-notifier-api',
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
});

/** Lazily initialised producer — reused across requests */
let producer = null;

export async function getProducer() {
  if (!producer) {
    producer = kafka.producer({
      allowAutoTopicCreation: false,
      retry: { retries: 3 },
    });
    await producer.connect();
    logger.info('kafka_producer_connected');
  }
  return producer;
}

/**
 * Publishes a notification payload to the Kafka topic.
 * @param {object} notification - The full notification object including id and timestamp.
 */
export async function publishNotification(notification) {
  const p = await getProducer();

  await p.send({
    topic: config.KAFKA_TOPIC,
    messages: [
      {
        key: notification.id,
        value: JSON.stringify(notification),
        headers: {
          source: 'node-msk-notifier-api',
          'content-type': 'application/json',
        },
      },
    ],
  });

  logger.info({ id: notification.id, topic: config.KAFKA_TOPIC }, 'notification_published');
}

export async function disconnectProducer() {
  if (producer) {
    await producer.disconnect();
    producer = null;
    logger.info('kafka_producer_disconnected');
  }
}
