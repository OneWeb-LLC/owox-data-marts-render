import { z } from 'zod';
import { emailListIssue } from './email-list';

const EMPTY_CHANNEL_LIST = 'Enter at least one Google Chat channel email';

// Webhook delivery sends through the Destination's Credential, so it holds nothing here.
const googleChatWebhookCredentialsSchema = z.object({
  deliveryMethod: z.literal('webhook'),
});

const googleChatEmailCredentialsSchema = z.object({
  deliveryMethod: z.literal('email'),
  to: z
    .array(z.string(), {
      error: () => EMPTY_CHANNEL_LIST,
    })
    .superRefine((emails, ctx) => {
      const message = emailListIssue(emails, EMPTY_CHANNEL_LIST);
      if (message) {
        ctx.addIssue({ code: 'custom', message });
      }
    }),
});

export const googleChatCredentialsSchema = z.discriminatedUnion('deliveryMethod', [
  googleChatWebhookCredentialsSchema,
  googleChatEmailCredentialsSchema,
]);
