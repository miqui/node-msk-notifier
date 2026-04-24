import fastify from 'fastify';
import sensible from '@fastify/sensible';
import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { apiKeyMiddleware } from './middleware/apiKey.js';
import { healthRoutes } from './routes/health.js';
import { notificationRoutes } from './routes/notifications.js';
import { subscriptionRoutes } from './routes/subscriptions.js';
import { disconnectProducer } from './services/kafka.js';

const app = fastify({
  logger: {
    level: config.LOG_LEVEL,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  disableRequestLogging: false,
  trustProxy: true, // Required behind ALB
});

await app.register(sensible);
await app.register(apiKeyMiddleware);
await app.register(healthRoutes);
await app.register(notificationRoutes);
await app.register(subscriptionRoutes);

// Graceful shutdown — drain in-flight requests before disconnecting Kafka
const shutdown = async (signal) => {
  logger.info({ signal }, 'shutdown_received');

  try {
    await app.close();
    await disconnectProducer();
    logger.info('graceful_shutdown_complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'shutdown_error');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info({ port: config.PORT }, 'api_started');
} catch (err) {
  logger.error({ err }, 'startup_failed');
  process.exit(1);
}
