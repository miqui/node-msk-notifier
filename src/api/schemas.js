import { z } from 'zod';

/**
 * Message attributes for SNS — each value must be a string.
 * SNS supports String, Number, and Binary types; we accept strings for simplicity.
 */
const MessageAttributesSchema = z.record(z.string()).optional();

export const NotificationSchema = z.object({
  subject: z.string().min(1).max(256),
  message: z.string().min(1).max(262_144), // SNS hard limit: 256 KB
  topicArn: z.string().startsWith('arn:aws:sns:').optional(),
  attributes: MessageAttributesSchema,
  metadata: z.record(z.unknown()).optional(),
});

export const SubscriptionSchema = z.object({
  protocol: z.enum([
    'email',
    'email-json',
    'sms',
    'sqs',
    'lambda',
    'http',
    'https',
    'firehose',
  ]),
  endpoint: z.string().min(1),
  topicArn: z.string().startsWith('arn:aws:sns:').optional(),
});

export const NotificationIdParamSchema = z.object({
  id: z.string().uuid(),
});
