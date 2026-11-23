import { z } from 'zod';
import { emailListIssue } from './email-list';

const EMPTY_EMAIL_LIST = 'Add at least one email address';

/**
 * Schema for validating Email credentials
 * Used by Data Destination module
 */
export const emailCredentialsSchema = z.object({
  to: z
    .array(z.string(), {
      error: () => EMPTY_EMAIL_LIST,
    })
    .superRefine((emails, ctx) => {
      const message = emailListIssue(emails, EMPTY_EMAIL_LIST);
      if (message) {
        ctx.addIssue({ code: 'custom', message });
      }
    }),
});
