import { z } from 'zod';

export const EmailCredentialsType = 'email-credentials';

export const EmailCredentialsSchema = z
  .object({
    type: z.literal(EmailCredentialsType),
    to: z.preprocess(
      value => (value == null ? [] : value),
      z
        .array(z.string().email('Enter a valid email address'))
        .min(1, 'Add at least one email address')
    ),
  })
  .passthrough();

export type EmailCredentials = z.infer<typeof EmailCredentialsSchema>;
