import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { config } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';

// Instantiated at module scope — reused across messages
const sns = new SNSClient({ region: config.AWS_REGION });

/**
 * Builds SNS MessageAttributes from a plain key→value object.
 * All attributes are typed as String for maximum compatibility.
 *
 * @param {Record<string, string> | undefined} attributes
 * @returns {Record<string, { DataType: string; StringValue: string }>}
 */
function buildMessageAttributes(attributes) {
  if (!attributes) return {};

  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      { DataType: 'String', StringValue: value },
    ]),
  );
}

/**
 * Publishes a notification to SNS.
 * Uses the topicArn from the message if provided, otherwise falls back to SNS_TOPIC_ARN.
 *
 * @param {object} notification
 * @returns {Promise<string>} The SNS MessageId
 */
export async function publishToSns(notification) {
  const topicArn = notification.topicArn ?? config.SNS_TOPIC_ARN;

  const command = new PublishCommand({
    TopicArn: topicArn,
    Subject: notification.subject,
    Message: notification.message,
    MessageAttributes: buildMessageAttributes(notification.attributes),
  });

  const response = await sns.send(command);

  logger.info(
    {
      notificationId: notification.id,
      snsMessageId: response.MessageId,
      topicArn,
    },
    'sns_published',
  );

  return response.MessageId;
}
