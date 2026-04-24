import { NotificationSchema } from '../schemas.js';
import { publishNotification } from '../services/kafka.js';
import { logger } from '../../shared/logger.js';

export async function notificationRoutes(app) {
  /**
   * POST /notifications
   * Validates the payload, generates an ID, and publishes to MSK.
   * Returns immediately with a queued status — delivery is async.
   */
  app.post('/notifications', async (request, reply) => {
    const parsed = NotificationSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const notification = {
      id: crypto.randomUUID(),
      ...parsed.data,
      timestamp: new Date().toISOString(),
    };

    try {
      await publishNotification(notification);

      reply.code(202);
      return {
        id: notification.id,
        status: 'queued',
        timestamp: notification.timestamp,
      };
    } catch (err) {
      logger.error({ err, id: notification.id }, 'publish_failed');
      return reply.code(502).send({
        error: 'PUBLISH_FAILED',
        message: 'Failed to publish notification to message queue',
      });
    }
  });

  /**
   * GET /notifications/:id
   * Lightweight status endpoint. Returns queued status as this service
   * is the producer only — delivery tracking requires a downstream store.
   */
  app.get('/notifications/:id', async (request, reply) => {
    const { id } = request.params;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(id)) {
      return reply.code(400).send({
        error: 'INVALID_ID',
        message: 'Notification ID must be a valid UUID v4',
      });
    }

    // The API layer is producer-only. A full status store (DynamoDB etc.)
    // would be wired here. For now, return the accepted contract.
    return {
      id,
      status: 'queued',
      message: 'Notification accepted for delivery. Check consumer logs for delivery status.',
    };
  });
}
