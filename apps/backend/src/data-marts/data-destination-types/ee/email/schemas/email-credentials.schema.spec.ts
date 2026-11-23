import { EmailCredentialsSchema } from './email-credentials.schema';

describe('EmailCredentialsSchema', () => {
  it('asks for an address when the list is missing', () => {
    const result = EmailCredentialsSchema.safeParse({ type: 'email-credentials' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.message)).toContain(
        'Add at least one email address'
      );
    }
  });

  it('names an invalid address', () => {
    const result = EmailCredentialsSchema.safeParse({
      type: 'email-credentials',
      to: ['not-an-email'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ['to', 0],
          message: 'Enter a valid email address',
        }),
      ]);
    }
  });

  it('accepts a list of addresses', () => {
    expect(
      EmailCredentialsSchema.parse({
        type: 'email-credentials',
        to: ['team@example.com'],
      })
    ).toMatchObject({ type: 'email-credentials', to: ['team@example.com'] });
  });
});
