import { SNSClient, SubscribeCommand } from '@aws-sdk/client-sns';
import { SubscriptionSchema } from '../schemas.js';
import { config } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';

const sns = new SNSClient({ region: config.AWS_REGION });

export async function subscriptionRoutes(app) {
  /**
   * POST /subscriptions
   * Subscribes an endpoint (email, SMS, SQS, Lambda, HTTP/S) to an SNS topic.
   * If topicArn is omitted, the default SNS_TOPIC_ARN from config is used.
   */
  app.post('/subscriptions', async (request, reply) => {
    const parsed = SubscriptionSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { protocol, endpoint, topicArn } = parsed.data;
    const resolvedTopicArn = topicArn ?? config.SNS_TOPIC_ARN;

    try {
      const command = new SubscribeCommand({
        TopicArn: resolvedTopicArn,
        Protocol: protocol,
        Endpoint: endpoint,
        ReturnSubscriptionArn: true,
      });

      const response = await sns.send(command);

      logger.info(
        { protocol, endpoint, topicArn: resolvedTopicArn, arn: response.SubscriptionArn },
        'subscription_created',
      );

      reply.code(201);
      return {
        subscriptionArn: response.SubscriptionArn,
        protocol,
        endpoint,
        topicArn: resolvedTopicArn,
        status:
          response.SubscriptionArn === 'PendingConfirmation'
            ? 'pending_confirmation'
            : 'confirmed',
      };
    } catch (err) {
      logger.error({ err, protocol, endpoint }, 'subscription_failed');

      if (err.name === 'InvalidParameterException') {
        return reply.code(400).send({
          error: 'INVALID_PARAMETER',
          message: err.message,
        });
      }

      return reply.code(502).send({
        error: 'SUBSCRIPTION_FAILED',
        message: 'Failed to create SNS subscription',
      });
    }
  });
}
