import { describe, expect, it } from 'vitest';
import { googleChatCredentialsSchema } from './google-chat-credentials.schema';

describe('googleChatCredentialsSchema', () => {
  it('keeps webhook delivery free of a webhook URL', () => {
    expect(
      googleChatCredentialsSchema.parse({
        deliveryMethod: 'webhook',
        webhookUrl: 'https://chat.googleapis.com/v1/spaces/space-1/messages?key=k&token=t',
      })
    ).toEqual({ deliveryMethod: 'webhook' });
  });

  it('accepts channel email delivery', () => {
    expect(
      googleChatCredentialsSchema.parse({
        deliveryMethod: 'email',
        to: ['space@example.com'],
      })
    ).toEqual({ deliveryMethod: 'email', to: ['space@example.com'] });
  });

  it('rejects email delivery without recipients', () => {
    const result = googleChatCredentialsSchema.safeParse({ deliveryMethod: 'email', to: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.message)).toContain(
        'Enter at least one Google Chat channel email'
      );
    }
  });

  it('names an invalid channel email on the list', () => {
    const result = googleChatCredentialsSchema.safeParse({
      deliveryMethod: 'email',
      to: ['not-an-email'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ['to'],
          message: '"not-an-email" is not a valid email address',
        }),
      ]);
    }
  });
});
